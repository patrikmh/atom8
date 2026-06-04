"""Pydantic request/response models."""
from typing import Any, Optional

from pydantic import BaseModel


# ─── Auth ─────────────────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    code: str
    redirect_uri: str = "http://localhost:5173/oauth/callback"


class AuthStatus(BaseModel):
    authenticated: bool
    email: str | None = None
    name: str | None = None
    is_expired: bool = False


# ─── Data ─────────────────────────────────────────────────────────────────────

class DataRequest(BaseModel):
    prompt: str = ""
    count: int = 10
    date: Optional[str] = None
    list_id: Optional[str] = None
    folder_id: Optional[str] = None
    document_id: Optional[str] = None
    nocache: bool = False  # Bypass cache when true


class DataResponse(BaseModel):
    data: list[Any]
    count: int
    status: str = "ok"
    error: Optional[str] = None


class DocsListRequest(BaseModel):
    prompt: str = ""
    count: int = 10
    query: Optional[str] = None
    nocache: bool = False  # Bypass cache when true


class DocsReadRequest(BaseModel):
    document_id: str
    prompt: str = ""
    nocache: bool = False  # Bypass cache when true


class DocsWriteRequest(BaseModel):
    document_id: Optional[str] = None
    title: Optional[str] = None
    content: str
    append: bool = False


class AllDataRequest(BaseModel):
    gmail_prompt: str = "Show my latest emails"
    gmail_count: int = 10
    calendar_date: Optional[str] = None
    calendar_prompt: str = "Show today's events"
    tasks_list_id: str = "default"
    tasks_prompt: str = "Show my tasks"
    drive_count: int = 10
    drive_prompt: str = "Show my files"
    docs_count: int = 10
    docs_prompt: str = "Show my documents"
    notion_count: int = 10
    notion_prompt: str = "Show my Notion pages"
    nocache: bool = False  # Bypass cache when true


class AllDataResponse(BaseModel):
    gmail: dict
    calendar: dict
    tasks: dict
    drive: dict
    docs: dict
    notion: dict
    status: str = "ok"


# ─── Notion ─────────────────────────────────────────────────────────────────

class NotionRequest(BaseModel):
    prompt: str = "Show my Notion pages"
    count: int = 10
    query: Optional[str] = None
    database_id: Optional[str] = None
    nocache: bool = False


# ─── Research ─────────────────────────────────────────────────────────────────

class ResearchRequest(BaseModel):
    topic: str
    depth: str = "medium"  # shallow, medium, deep
    max_results: int = 10


class ResearchResponse(BaseModel):
    content: str
    sources: list[str | dict]
    status: str = "ok"
    error: Optional[str] = None


# ─── Chat ─────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
    session_id: str
    status: str = "ok"
    error: Optional[str] = None


# ─── Summarize ────────────────────────────────────────────────────────────────

class SummarizeRequest(BaseModel):
    prompt: str
    count: int = 10
    date: Optional[str] = None
    list_id: Optional[str] = None


class SummarizeResponse(BaseModel):
    summary: str
    sources: list[str] = []
    intent: str = "research"
    status: str = "ok"
    error: Optional[str] = None


# ─── Dashboard ────────────────────────────────────────────────────────────────

class DashboardLayout(BaseModel):
    layout: dict[str, Any]


# ─── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    version: str = "3.0.0"
