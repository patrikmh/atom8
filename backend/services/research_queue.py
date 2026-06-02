"""SQLite-backed queue for research jobs."""
import sqlite3
import uuid
import json
from datetime import datetime
from typing import Optional, Dict, Any, List
from contextlib import contextmanager

import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'research_queue.db')


_db_initialized = False


def init_db():
    global _db_initialized
    if _db_initialized:
        return
    _db_initialized = True
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS research_jobs (
            id TEXT PRIMARY KEY,
            topic TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            result TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


@contextmanager
def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def enqueue(topic: str) -> str:
    init_db()
    job_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        conn.execute(
            "INSERT INTO research_jobs (id, topic, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (job_id, topic, "pending", now, now),
        )
        conn.commit()
    return job_id


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM research_jobs WHERE id = ?", (job_id,)
        ).fetchone()
    if row:
        return dict(row)
    return None


def pick_next_pending() -> Optional[Dict[str, Any]]:
    init_db()
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM research_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
    if row:
        return dict(row)
    return None


def mark_running(job_id: str):
    now = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        conn.execute(
            "UPDATE research_jobs SET status = ?, updated_at = ? WHERE id = ?",
            ("running", now, job_id),
        )
        conn.commit()


def mark_done(job_id: str, result: Dict[str, Any]):
    now = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        conn.execute(
            "UPDATE research_jobs SET status = ?, result = ?, updated_at = ? WHERE id = ?",
            ("done", json.dumps(result), now, job_id),
        )
        conn.commit()


def mark_error(job_id: str, error: str):
    now = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        conn.execute(
            "UPDATE research_jobs SET status = ?, result = ?, updated_at = ? WHERE id = ?",
            ("error", json.dumps({"error": error}), now, job_id),
        )
        conn.commit()
