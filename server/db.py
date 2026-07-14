"""MicDrop.ai - MySQL persistence layer.

Handles all database writes/reads for sessions, questions, answers, and summaries.
"""

import os
import uuid

import mysql.connector
from loguru import logger


def get_connection():
    """Open a fresh MySQL connection using .env credentials."""
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD"),
        database=os.getenv("MYSQL_DATABASE", "micdrop_ai"),
    )


def create_session(track: str, difficulty: str, user_id: str | None = None) -> str:
    """Create a new session row. Returns the new session_id (UUID)."""
    session_id = str(uuid.uuid4())
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO sessions (id, user_id, track, starting_difficulty, status) "
            "VALUES (%s, %s, %s, %s, 'in_progress')",
            (session_id, user_id, track, difficulty),
        )
        conn.commit()
        logger.info(f"[DB] Created session {session_id}")
        return session_id
    finally:
        conn.close()


def insert_question(session_id: str, question_text: str, source: str, difficulty: str) -> int:
    """Insert a question row. Returns the new question_id."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO questions (session_id, question_text, source, difficulty) "
            "VALUES (%s, %s, %s, %s)",
            (session_id, question_text, source, difficulty),
        )
        conn.commit()
        question_id = cur.lastrowid
        logger.info(f"[DB] Inserted question {question_id} for session {session_id}")
        return question_id
    finally:
        conn.close()


def insert_answer(
    question_id: int,
    session_id: str,
    transcript: str,
    score: int,
    needs_followup: bool,
    followup_question: str,
) -> None:
    """Insert an answer row tied to a question."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO answers "
            "(question_id, session_id, transcript, score, needs_followup, followup_question) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (question_id, session_id, transcript, score, needs_followup, followup_question),
        )
        cur.execute(
            "UPDATE sessions SET questions_answered = questions_answered + 1 WHERE id = %s",
            (session_id,),
        )
        conn.commit()
        logger.info(f"[DB] Inserted answer for question {question_id}, score={score}")
    finally:
        conn.close()


def end_session(session_id: str, summary_text: str, strengths: str, weaknesses: str) -> dict:
    """Mark a session complete, compute avg score, store the summary. Returns summary stats."""
    conn = get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT AVG(score) as avg_score, COUNT(*) as total FROM answers WHERE session_id = %s",
            (session_id,),
        )
        row = cur.fetchone()
        avg_score = round(row["avg_score"], 1) if row["avg_score"] is not None else None
        total = row["total"]

        cur.execute(
            "UPDATE sessions SET status = 'completed', ended_at = NOW(), avg_score = %s WHERE id = %s",
            (avg_score, session_id),
        )
        cur.execute(
            "INSERT INTO session_summaries (session_id, summary_text, strengths, weaknesses) "
            "VALUES (%s, %s, %s, %s)",
            (session_id, summary_text, strengths, weaknesses),
        )
        conn.commit()
        logger.info(f"[DB] Ended session {session_id}: {total} questions, avg {avg_score}")
        return {"questions_answered": total, "average_score": avg_score}
    finally:
        conn.close()