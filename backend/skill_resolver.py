"""Skill path resolution for the pi headless backend."""
import os
from pathlib import Path

from config import PROJECT_ROOT

# Skill registry: name -> relative path in project
SKILL_PATHS = {
    "gmail-fetch": ".pi/skills/gmail-fetch/SKILL.md",
    "calendar-fetch": ".pi/skills/calendar-fetch/SKILL.md",
    "tasks-fetch": ".pi/skills/tasks-fetch/SKILL.md",
    "drive-fetch": ".pi/skills/drive-fetch/SKILL.md",
    "docs-fetch": ".pi/skills/docs-fetch/SKILL.md",
    "web-research": ".pi/skills/web-research/SKILL.md",
    "google-auth": ".pi/skills/google-auth/SKILL.md",
    "playwright-cli": ".pi/skills/playwright-cli/SKILL.md",
}


def resolve_skill(name: str) -> str:
    """Resolve a skill name to an absolute path.

    1. Try project-level path
    2. Fall back to global pi agent skills
    3. Raise FileNotFoundError if not found
    """
    rel = SKILL_PATHS.get(name)
    if rel:
        project_path = PROJECT_ROOT / rel
        if project_path.exists():
            return str(project_path.resolve())

    # Fallback to global pi agent skills
    global_path = Path.home() / ".pi" / "agent" / "skills" / name / "SKILL.md"
    if global_path.exists():
        return str(global_path.resolve())

    raise FileNotFoundError(f"Skill '{name}' not found in project or global pi skills")
