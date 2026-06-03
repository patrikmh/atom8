"""Simple pi subprocess runner: spawns `pi -p --mode json` per request.

Returns the raw assistant text (markdown) from the turn_end event.
"""
import asyncio
import json
import os

SKILL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".pi", "skills")

SKILL_MAP = {
    "gmail": "gmail-fetch",
    "calendar": "calendar-fetch",
    "tasks": "tasks-fetch",
    "drive": "drive-fetch",
}


def _skill_path(skill_name: str) -> str:
    mapped = SKILL_MAP.get(skill_name, skill_name)
    return os.path.join(SKILL_DIR, mapped, "SKILL.md")


async def run_pi(
    skill: str,
    command: str,
    timeout: int = 60,
    provider: str | None = None,
    model: str | None = None,
) -> str:
    """Run `pi -p --mode json` with the given skill and command.

    Returns the raw assistant text content from the turn_end event.
    """
    skill_path = _skill_path(skill)
    env = os.environ.copy()
    env.setdefault("GOOGLE_CLIENT_ID", os.getenv("GOOGLE_CLIENT_ID", ""))
    env.setdefault("GOOGLE_CLIENT_SECRET", os.getenv("GOOGLE_CLIENT_SECRET", ""))

    cmd = [
        "pi",
        "-p",
        "--mode", "json",
        "--no-session",
        "--skill", skill_path,
        "--tools", "read,grep,find,bash",
        command,
    ]
    if provider:
        cmd.extend(["--provider", provider])
    if model:
        cmd.extend(["--model", model])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        env=env,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise

    text = ""
    for line in stdout.decode("utf-8", errors="ignore").split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "turn_end":
            for block in event.get("message", {}).get("content", []):
                if block.get("type") == "text":
                    text += block.get("text", "")
    return text
