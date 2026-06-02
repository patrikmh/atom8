from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class HealthResponse(BaseModel):
    status: str


class GmailRequest(BaseModel):
    count: int = 10
    prompt: Optional[str] = None


class CalendarRequest(BaseModel):
    date: Optional[str] = None
    prompt: Optional[str] = None


class TasksRequest(BaseModel):
    list_id: Optional[str] = "default"
    prompt: Optional[str] = None


class DriveRequest(BaseModel):
    count: int = 10
    prompt: Optional[str] = None


class EmailItem(BaseModel):
    id: str
    from_name: str
    from_email: str
    subject: str
    preview: str
    date: str
    is_read: bool = True


class GmailResponse(BaseModel):
    emails: List[EmailItem]


class CalendarEvent(BaseModel):
    id: str
    title: str
    start: str
    end: str
    location: Optional[str] = None
    color: str = "#4285f4"


class CalendarResponse(BaseModel):
    events: List[CalendarEvent]
    date: str


class TaskItem(BaseModel):
    id: str
    title: str
    completed: bool
    priority: str = "medium"
    due_date: Optional[str] = None


class TasksResponse(BaseModel):
    tasks: List[TaskItem]


class DriveFile(BaseModel):
    id: str
    name: str
    mime_type: str
    size: Optional[str] = None
    modified: str


class DriveResponse(BaseModel):
    files: List[DriveFile]


class LayoutSave(BaseModel):
    widgets_json: str
    background_json: str
    sidebar_open: bool = True


class UserToken(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    expires_at: Optional[datetime] = None
