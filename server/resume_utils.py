"""MicDrop.ai - Resume parsing helpers."""

import uuid

import pypdf
from loguru import logger

import db


def extract_text_from_pdf(file_path: str) -> str:
    """Pull raw text out of a PDF resume."""
    reader = pypdf.PdfReader(file_path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return text.strip()


def save_resume(user_id: str, file_name: str, raw_text: str) -> int:
    """Store the parsed resume text in MySQL. Returns the resume row id."""
    conn = db.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO resumes (user_id, file_name, raw_text) VALUES (%s, %s, %s)",
            (user_id, file_name, raw_text),
        )
        conn.commit()
        resume_id = cur.lastrowid
        logger.info(f"[DB] Saved resume {resume_id} for user {user_id}")
        return resume_id
    finally:
        conn.close()


def get_latest_resume_text(user_id: str) -> str | None:
    """Fetch the most recently uploaded resume's raw text for a user."""
    conn = db.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT raw_text FROM resumes WHERE user_id = %s ORDER BY uploaded_at DESC LIMIT 1",
            (user_id,),
        )
        row = cur.fetchone()
        return row["raw_text"] if row else None
    finally:
        conn.close()