"""Dashboard layout persistence using a simple JSON file."""
import json
from pathlib import Path

from fastapi import APIRouter

from config import settings
from models import DashboardLayout

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_DEFAULT_LAYOUT = {
    "version": "1.0",
    "widgets": [
        {"id": "email", "type": "gmail", "position": {"x": 0, "y": 0, "w": 6, "h": 4}},
        {"id": "calendar", "type": "calendar", "position": {"x": 6, "y": 0, "w": 6, "h": 4}},
        {"id": "tasks", "type": "tasks", "position": {"x": 0, "y": 4, "w": 4, "h": 3}},
        {"id": "drive", "type": "drive", "position": {"x": 4, "y": 4, "w": 4, "h": 3}},
        {"id": "chat", "type": "chat", "position": {"x": 8, "y": 4, "w": 4, "h": 3}},
    ],
}


def _load_layout() -> dict:
    """Load dashboard layout from JSON file."""
    path = settings.dashboard_json_path
    if path.exists():
        with open(path, "r") as f:
            return json.load(f)
    return _DEFAULT_LAYOUT.copy()


def _save_layout(data: dict) -> None:
    """Save dashboard layout to JSON file."""
    path = settings.dashboard_json_path
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


@router.get("/layout")
async def get_layout():
    """Get the current dashboard layout."""
    return _load_layout()


@router.post("/layout")
async def save_layout(request: DashboardLayout):
    """Save the dashboard layout."""
    _save_layout(request.layout)
    return {"status": "ok"}


@router.get("/widgets")
async def get_widgets():
    """Get available widget types."""
    return {
        "widgets": [
            {"type": "gmail", "name": "Email", "icon": "mail"},
            {"type": "calendar", "name": "Calendar", "icon": "calendar"},
            {"type": "tasks", "name": "Tasks", "icon": "checklist"},
            {"type": "drive", "name": "Drive", "icon": "drive"},
            {"type": "chat", "name": "AI Chat", "icon": "chat"},
        ]
    }
