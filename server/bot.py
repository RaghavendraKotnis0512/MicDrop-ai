#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""MicDrop.ai - Voice AI Interview Coach

Cascade pipeline: Speech-to-Text -> LLM (with tool calling) -> Text-to-Speech
Now persists sessions, questions, and answers to MySQL via db.py.

Required AI services:
- Deepgram (Speech-to-Text)
- Groq (LLM)
- Cartesia (Text-to-Speech)

Run the bot using::

    uv run bot.py
"""

import datetime
import io
import os
import random
import wave

import aiofiles
import httpx
from dotenv import load_dotenv
from loguru import logger

import db
import resume_utils
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.evals.transport import EvalTransportParams
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    AssistantTurnStoppedMessage,
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
    UserTurnStoppedMessage,
)
from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.groq.llm import GroqLLMService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.workers.runner import WorkerRunner

load_dotenv(override=True)


# -----------------------------------------------------------------------
# Live LeetCode question fetching (replaces the old hardcoded bank)
# -----------------------------------------------------------------------
LEETCODE_API_BASE = "https://leetcode-api-pied.vercel.app"

# Small fallback bank in case the LeetCode API is down or rate-limited.
FALLBACK_QUESTIONS = {
    "easy": "Given an array of integers, how would you find two numbers that add up to a target value?",
    "medium": "How would you find the longest substring without repeating characters?",
    "hard": "How would you find the median of two sorted arrays in logarithmic time?",
}


async def fetch_leetcode_question(difficulty: str) -> dict:
    """Fetch a random free (non-paywalled) LeetCode problem at the given difficulty."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{LEETCODE_API_BASE}/problems/filter",
                params={"difficulty": difficulty.capitalize(), "limit": 50},
            )
            resp.raise_for_status()
            data = resp.json()
            problems = [p for p in data.get("problems", []) if not p.get("paid_only")]
            free_unasked = [p for p in problems if p["title"] not in _asked_questions]
            if not free_unasked:
                _asked_questions.clear()
                free_unasked = problems
            if free_unasked:
                chosen = random.choice(free_unasked)
                return {"title": chosen["title"], "slug": chosen["title_slug"]}
    except Exception as e:
        logger.warning(f"[LeetCode API] fetch failed, using fallback: {e}")

    return {"title": FALLBACK_QUESTIONS.get(difficulty, FALLBACK_QUESTIONS["easy"]), "slug": None}


# TEMPORARY: no auth/session system yet, so we hardcode which user's resume to pull.
# Replace this once the frontend sends a real user_id per connection.
TEST_USER_ID = "test-user-1"


async def get_resume_question(params: FunctionCallParams):
    """Tool: fetch the candidate's uploaded resume text so the LLM can ask about it."""
    resume_text = resume_utils.get_latest_resume_text(TEST_USER_ID)

    if not resume_text:
        await params.result_callback(
            {"error": "No resume found for this candidate. Fall back to a DSA question instead."}
        )
        return

    # Lazily create the session if this is the very first question asked.
    if _session_state["session_id"] is None:
        _session_state["session_id"] = db.create_session(track="resume", difficulty="n/a")

    question_id = db.insert_question(
        session_id=_session_state["session_id"],
        question_text="Resume-based question (generated live from candidate's resume)",
        source="resume",
        difficulty="n/a",
    )
    _session_state["last_question_id"] = question_id
    _session_state["last_question"] = "resume-based question"

    logger.info(f"[TOOL] get_resume_question -> pulled resume text ({len(resume_text)} chars)")

    await params.result_callback(
        {
            "resume_text": resume_text[:3000],  # cap length to keep context manageable
            "note": (
                "Pick one specific project, skill, or experience mentioned in this resume and ask "
                "the candidate a natural spoken interview question about it -- e.g. 'tell me about "
                "the caching layer you mentioned in Project X' or 'walk me through your role in Y'."
            ),
        }
    )

# Per-process session state (reset each time run_bot() is called, i.e. per call).
_asked_questions: set[str] = set()
_session_state: dict = {"session_id": None, "last_question_id": None, "last_question": None}
_rtvi_ref: dict = {"rtvi": None}


def _to_int(value, default=5):
    """Coerce Groq's occasionally-stringified numbers into real ints."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_bool(value, default=False):
    """Coerce Groq's occasionally-stringified booleans into real bools."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1")
    return default


async def get_next_question(params: FunctionCallParams):
    """Tool: fetch the next interview question (live from LeetCode) and log it to the DB."""
    track = params.arguments.get("track", "dsa")
    difficulty = params.arguments.get("difficulty", "easy")

    result = await fetch_leetcode_question(difficulty)
    problem_title = result["title"]
    _asked_questions.add(problem_title)

    # Lazily create the session on the first question, now that we know the track/difficulty.
    if _session_state["session_id"] is None:
        _session_state["session_id"] = db.create_session(track=track, difficulty=difficulty)

    question_id = db.insert_question(
        session_id=_session_state["session_id"],
        question_text=problem_title,
        source="leetcode_api",
        difficulty=difficulty,
    )
    _session_state["last_question_id"] = question_id
    _session_state["last_question"] = problem_title

    logger.info(f"[TOOL] get_next_question -> track={track} difficulty={difficulty} title={problem_title!r}")

    await params.result_callback(
        {
            "problem_title": problem_title,
            "track": track,
            "difficulty": difficulty,
            "note": "This is a real LeetCode problem title. Phrase it as a natural spoken interview question -- describe the problem in your own words based on the title, don't just read the title verbatim.",
        }
    )


async def score_answer(params: FunctionCallParams):
    """Tool: score the candidate's last answer and log it to the DB."""
    score = _to_int(params.arguments.get("score"))
    needs_followup = _to_bool(params.arguments.get("needs_followup"))
    followup_question = params.arguments.get("followup_question", "")
    transcript = params.arguments.get("transcript", "")

    if _session_state["session_id"] and _session_state["last_question_id"]:
        db.insert_answer(
            question_id=_session_state["last_question_id"],
            session_id=_session_state["session_id"],
            transcript=transcript,
            score=score,
            needs_followup=needs_followup,
            followup_question=followup_question,
        )

    logger.info(
        f"[TOOL] score_answer -> score={score}/10 needs_followup={needs_followup} "
        f"followup={followup_question!r}"
    )

    await params.result_callback({"acknowledged": True})


async def send_report_email(to_email: str, session_id: str, stats: dict, summary_text: str, strengths: str, weaknesses: str) -> bool:
    """Email the session report via Resend. Returns True on success."""
    html_body = f"""
    <h2>Your MicDrop.ai Interview Report</h2>
    <p><strong>Questions answered:</strong> {stats.get('questions_answered', 'N/A')}</p>
    <p><strong>Average score:</strong> {stats.get('average_score', 'N/A')}/10</p>
    <h3>Summary</h3>
    <p>{summary_text}</p>
    <h3>Strengths</h3>
    <p>{strengths}</p>
    <h3>Areas to practice</h3>
    <p>{weaknesses}</p>
    """
    status = "failed"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {os.getenv('RESEND_API_KEY')}"},
                json={
                    "from": "MicDrop.ai <onboarding@resend.dev>",
                    "to": [to_email],
                    "subject": "Your MicDrop.ai Interview Report",
                    "html": html_body,
                },
            )
            resp.raise_for_status()
            status = "sent"
            logger.info(f"[EMAIL] Report sent to {to_email}")
    except Exception as e:
        logger.error(f"[EMAIL] Failed to send report to {to_email}: {e}")

    conn = db.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO email_logs (session_id, sent_to, status) VALUES (%s, %s, %s)",
            (session_id, to_email, status),
        )
        conn.commit()
    finally:
        conn.close()

    return status == "sent"


async def end_session(params: FunctionCallParams):
    """Tool: wrap up the session, persist the summary, email the report, and return stats."""
    if not _session_state["session_id"]:
        await params.result_callback({"summary_data": "No questions were answered this session."})
        return

    strengths = params.arguments.get("strengths", "")
    weaknesses = params.arguments.get("weaknesses", "")
    summary_text = params.arguments.get("summary_text", "")
    candidate_email = params.arguments.get("candidate_email", "")

    stats = db.end_session(
        session_id=_session_state["session_id"],
        summary_text=summary_text,
        strengths=strengths,
        weaknesses=weaknesses,
    )

    email_sent = False
    if candidate_email:
        email_sent = await send_report_email(
            to_email=candidate_email,
            session_id=_session_state["session_id"],
            stats=stats,
            summary_text=summary_text,
            strengths=strengths,
            weaknesses=weaknesses,
        )

    stats["email_sent"] = email_sent
    stats["strengths"] = strengths
    stats["weaknesses"] = weaknesses
    stats["summary_text"] = summary_text
    logger.info(f"[TOOL] end_session -> {stats}")

    rtvi = _rtvi_ref.get("rtvi")
    if rtvi:
        try:
            await rtvi.send_server_message({"type": "session_report", "data": stats})
        except Exception as e:
            logger.warning(f"[RTVI] Failed to push session report to client: {e}")

    await params.result_callback(stats)


get_next_question_schema = FunctionSchema(
    name="get_next_question",
    description="Fetch the next interview question to ask the candidate.",
    properties={
        "track": {
            "type": "string",
            "enum": ["dsa"],
            "description": "Interview track to pull a question from.",
        },
        "difficulty": {
            "type": "string",
            "enum": ["easy", "medium", "hard"],
            "description": "Difficulty level, based on how the candidate has been performing.",
        },
    },
    required=["track", "difficulty"],
)

score_answer_schema = FunctionSchema(
    name="score_answer",
    description=(
        "Score the candidate's most recent spoken answer from 1-10 and decide whether "
        "to ask a natural follow-up or move on to the next question."
    ),
    properties={
        "score": {
            "type": "integer",
            "description": "Quality score from 1 (weak) to 10 (excellent), as a plain integer.",
        },
        "needs_followup": {
            "type": "boolean",
            "description": "true or false -- whether the answer was incomplete and deserves a probing follow-up.",
        },
        "followup_question": {
            "type": "string",
            "description": "The natural follow-up question to ask, if needs_followup is true.",
        },
        "transcript": {
            "type": "string",
            "description": "A concise paraphrase of what the candidate said, for the record.",
        },
    },
    required=["score", "needs_followup"],
)

end_session_schema = FunctionSchema(
    name="end_session",
    description=(
        "Call this when the candidate wants to stop or wrap up the mock interview. "
        "Persists the session summary, emails the candidate a report, and returns stats "
        "so you can recap out loud."
    ),
    properties={
        "summary_text": {"type": "string", "description": "A brief overall summary of the session."},
        "strengths": {"type": "string", "description": "One or two specific things the candidate did well."},
        "weaknesses": {"type": "string", "description": "One or two specific areas to practice."},
        "candidate_email": {
            "type": "string",
            "description": "The email address the candidate gave you to send their report to.",
        },
    },
    required=["summary_text", "strengths", "weaknesses", "candidate_email"],
)

get_resume_question_schema = FunctionSchema(
    name="get_resume_question",
    description=(
        "Fetch the candidate's uploaded resume so you can ask a personalized question "
        "about a specific project, skill, or experience they listed."
    ),
    properties={},
    required=[],
)

tools = ToolsSchema(
    standard_tools=[
        get_next_question_schema,
        get_resume_question_schema,
        score_answer_schema,
        end_session_schema,
    ]
)


INTERVIEW_SYSTEM_PROMPT = """You are MicDrop, a friendly but sharp technical interview coach conducting a live \
mock interview over voice. Your responses are spoken aloud, so never use emojis, bullet points, markdown, \
or anything that can't be spoken naturally.

Flow:
1. Briefly introduce yourself and ask the candidate which track they want to practice: DSA questions, or questions based on their uploaded resume (if available). If DSA, also ask their target difficulty (easy, medium, hard). Do NOT call any tool during this step -- just speak the greeting and question.
2. If they chose DSA, call the get_next_question tool to fetch a real LeetCode problem title matching their choice. You'll get back a problem_title -- describe the problem naturally in your own spoken words based on that title (e.g. for "Two Sum", ask something like "given an array of integers, how would you find two numbers that add up to a target value"). Don't just read the title aloud. If they chose resume-based questions, call get_resume_question instead, then ask a natural question about something specific from their resume.
3. Listen to their spoken answer. If they haven't actually answered yet (e.g. they said "hello", stayed silent, or asked you to repeat the question), do NOT call any tool -- just respond naturally and re-ask or wait. Only call score_answer once they've given a real attempt at an answer.
4. Once they've answered, call the score_answer tool to record a score, a brief paraphrase of their answer as "transcript", and decide if a follow-up is needed. Always pass score as a plain integer and needs_followup as a plain true/false boolean.
5. If needs_followup is true, ask the follow-up question naturally before moving on.
6. If not, congratulate them briefly and call get_next_question again, adjusting difficulty up or down based on how they're doing.
7. Keep the tone encouraging but honest, like a real interviewer -- brief, natural, conversational.
8. If the candidate says they want to stop, are done, or wraps up (e.g. "that's enough for today"), first ask for their email address so you can send them a report. Then call the end_session tool with a brief summary_text, strengths, weaknesses, and their candidate_email. Use the returned stats to give a spoken recap: how many questions they answered, their average score, the strengths/weaknesses, and confirm the report was emailed to them. Keep it under 30 seconds of speech.
"""


async def save_audio_file(audio: bytes, filename: str, sample_rate: int, num_channels: int):
    """Save audio data to a WAV file."""
    if len(audio) > 0:
        with io.BytesIO() as buffer:
            with wave.open(buffer, "wb") as wf:
                wf.setsampwidth(2)
                wf.setnchannels(num_channels)
                wf.setframerate(sample_rate)
                wf.writeframes(audio)
            async with aiofiles.open(filename, "wb") as file:
                await file.write(buffer.getvalue())
        logger.info(f"Audio saved to {filename}")


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments) -> None:
    """Run the voice bot for this session."""
    logger.info("Starting bot")

    # Reset per-session state for this call
    _asked_questions.clear()
    _session_state.update({"session_id": None, "last_question_id": None, "last_question": None})

    # Speech-to-Text service
    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))

    # Text-to-Speech service
    tts = CartesiaTTSService(
        api_key=os.getenv("CARTESIA_API_KEY"),
        settings=CartesiaTTSService.Settings(
            voice=os.getenv("CARTESIA_VOICE_ID", "71a7ad14-091c-4e8e-a314-022ece01c121"),
        ),
    )

    # LLM service
    llm = GroqLLMService(
        api_key=os.getenv("GROQ_API_KEY"),
        settings=GroqLLMService.Settings(
            model=os.getenv("GROQ_MODEL", "moonshotai/kimi-k2-instruct-0905"),
            system_instruction=INTERVIEW_SYSTEM_PROMPT,
        ),
    )

    # Register the tools so the LLM can actually call them
    llm.register_function("get_next_question", get_next_question)
    llm.register_function("get_resume_question", get_resume_question)
    llm.register_function("score_answer", score_answer)
    llm.register_function("end_session", end_session)

    context = LLMContext(tools=tools)
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        # Tuned VAD: higher confidence + longer start/stop windows so background
        # noise or the bot's own audio bleeding into the mic doesn't get mistaken
        # for the candidate interrupting (which was cutting replies short).
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    confidence=0.7,
                    start_secs=0.3,
                    stop_secs=0.3,
                )
            )
        ),
    )

    # Audio recording, started automatically when the pipeline starts
    audio_buffer = AudioBufferProcessor(auto_start_recording=True)

    # Pipeline - assembled from reusable components
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            audio_buffer,
            assistant_aggregator,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        observers=[],
    )
    _rtvi_ref["rtvi"] = worker.rtvi

    @worker.rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):
        # Kick off the conversation
        context.add_message(
            {"role": "developer", "content": "Start by concisely introducing yourself and asking about their target track and difficulty."}
        )
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        await worker.cancel()

    @user_aggregator.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message: UserTurnStoppedMessage):
        timestamp = f"[{message.timestamp}] " if message.timestamp else ""
        line = f"{timestamp}user: {message.content}"
        logger.info(f"Transcript: {line}")

    @assistant_aggregator.event_handler("on_assistant_turn_stopped")
    async def on_assistant_turn_stopped(aggregator, message: AssistantTurnStoppedMessage):
        timestamp = f"[{message.timestamp}] " if message.timestamp else ""
        line = f"{timestamp}assistant: {message.content}"
        logger.info(f"Transcript: {line}")

    @audio_buffer.event_handler("on_audio_data")
    async def on_audio_data(buffer, audio, sample_rate, num_channels):
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"recordings/merged_{timestamp}.wav"
        os.makedirs("recordings", exist_ok=True)
        await save_audio_file(audio, filename, sample_rate, num_channels)

    runner = WorkerRunner(handle_sigint=False)

    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments):
    """Main bot entry point."""
    # Krisp is available when deployed to Pipecat Cloud
    if os.environ.get("ENV") != "local":
        from pipecat.audio.filters.krisp_viva_filter import KrispVivaFilter

        krisp_filter = KrispVivaFilter()
    else:
        krisp_filter = None

    transport_params = {
        "webrtc": lambda: TransportParams(
            audio_in_enabled=True,
            audio_in_filter=krisp_filter,
            audio_out_enabled=True,
        ),
        # Behavioral evals: run with `-t eval` to drive this bot via `pipecat eval`.
        "eval": lambda: EvalTransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    }

    transport = await create_transport(runner_args, transport_params)

    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()