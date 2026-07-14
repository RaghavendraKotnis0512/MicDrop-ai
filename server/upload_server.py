"""MicDrop.ai - Standalone resume upload server.

Runs separately from bot.py (the voice pipeline) on its own port.
Accepts a PDF resume, extracts text, and saves it to MySQL.

Run with:
    uv run uvicorn upload_server:app --port 8001 --reload
"""

import os
import tempfile

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

import resume_utils

load_dotenv(override=True)

app = FastAPI(title="MicDrop.ai Resume Upload")

# Allow the React client (running on a different port) to call this
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your actual frontend URL before deploying
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/upload-resume")
async def upload_resume(user_id: str, file: UploadFile = File(...)):
    """Accept a PDF resume, parse it, and store it for the given user_id."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = tmp.name

        raw_text = resume_utils.extract_text_from_pdf(tmp_path)
        os.unlink(tmp_path)

        if not raw_text:
            raise HTTPException(status_code=422, detail="Could not extract any text from this PDF.")

        resume_id = resume_utils.save_resume(user_id=user_id, file_name=file.filename, raw_text=raw_text)

        logger.info(f"[UPLOAD] Saved resume {resume_id} for user {user_id} ({len(raw_text)} chars)")

        return {"resume_id": resume_id, "chars_extracted": len(raw_text)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[UPLOAD] Failed to process resume: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok"}