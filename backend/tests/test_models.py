"""Tests for Pydantic request/response models."""
import pytest
from pydantic import ValidationError
from models import (
    ChatRequest,
    ChatClearRequest,
    ChatNewRequest,
    ResearchRequest,
    DesignRequest,
    WidgetCacheRequest,
    GmailRequest,
    CalendarRequest,
    TasksRequest,
    DriveRequest,
    LayoutSave,
)


def test_chat_request_valid():
    req = ChatRequest(message="Hello", session_id="abc123")
    assert req.message == "Hello"
    assert req.session_id == "abc123"


def test_chat_request_no_session():
    req = ChatRequest(message="Hello")
    assert req.session_id is None


def test_chat_request_missing_message():
    with pytest.raises(ValidationError):
        ChatRequest()


def test_chat_clear_request_valid():
    req = ChatClearRequest(session_id="abc123")
    assert req.session_id == "abc123"


def test_chat_clear_request_missing():
    with pytest.raises(ValidationError):
        ChatClearRequest()


def test_chat_new_request_optional():
    req = ChatNewRequest()
    assert req.session_id is None


def test_research_request_valid():
    req = ResearchRequest(topic="AI news")
    assert req.topic == "AI news"


def test_research_request_missing():
    with pytest.raises(ValidationError):
        ResearchRequest()


def test_design_request_valid():
    req = DesignRequest(layout={"widgets": []})
    assert req.layout == {"widgets": []}


def test_widget_cache_request_valid():
    req = WidgetCacheRequest(data={"emails": []})
    assert req.data == {"emails": []}


def test_gmail_request_defaults():
    req = GmailRequest()
    assert req.count == 10
    assert req.prompt is None


def test_calendar_request_defaults():
    req = CalendarRequest()
    assert req.date is None
    assert req.prompt is None


def test_tasks_request_defaults():
    req = TasksRequest()
    assert req.list_id == "default"
    assert req.prompt is None


def test_drive_request_defaults():
    req = DriveRequest()
    assert req.count == 10
    assert req.prompt is None


def test_layout_save_valid():
    req = LayoutSave(widgets_json="[]", background_json="{}")
    assert req.sidebar_open is True
