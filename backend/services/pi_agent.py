"""Generic headless pi agent runner with tool support."""

import subprocess
import asyncio
import os
import json
import re
from typing import Dict, Any, Optional

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configurable via environment
PI_PROVIDER = os.getenv("PI_PROVIDER", "fireworks")
PI_MODEL = os.getenv("PI_MODEL", "accounts/fireworks/routers/kimi-k2p6-turbo")


def _run_pi_sync(
    task: str,
    system_prompt: Optional[str] = None,
    timeout: int = 120,
    skills: Optional[list[str]] = None,
) -> str:
    """Synchronous pi runner — runs in a thread pool."""
    if not system_prompt:
        system_prompt = (
            "You are a data fetch agent for a dashboard application. "
            "You have access to read, grep, find, and bash tools. "
            "For fetching Google data (Gmail, Calendar, Tasks, Drive), follow the relevant skill workflow and use bash with curl. "
            "For web research, follow the web-research skill and use bash with playwright-cli. "
            "Return ONLY the JSON result, no extra text, no markdown, no explanations."
        )

    prompt = f"{system_prompt}\n\nTask: {task}\n\nExecute the task using the available tools. Return ONLY the JSON result."

    cmd = [
        "pi",
        "--print",
        "--no-session",
        "--provider",
        PI_PROVIDER,
        "--model",
        PI_MODEL,
        "--thinking",
        "low",
        "--tools",
        "read,grep,find,bash",
        prompt,
    ]
    
    # Load all skills by default
    default_skills = [
        os.path.expanduser("~/.pi/agent/skills/web-research/SKILL.md"),
        os.path.expanduser("~/.pi/agent/skills/gmail-fetch/SKILL.md"),
        os.path.expanduser("~/.pi/agent/skills/calendar-fetch/SKILL.md"),
        os.path.expanduser("~/.pi/agent/skills/tasks-fetch/SKILL.md"),
        os.path.expanduser("~/.pi/agent/skills/drive-fetch/SKILL.md"),
    ]
    
    for skill in (skills or default_skills):
        cmd.extend(["--skill", skill])

    try:
        env = os.environ.copy()
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=PROJECT_ROOT,
            env=env,
        )
        output = result.stdout.strip()
        if not output:
            output = result.stderr.strip()
        if not output:
            output = "No response from pi agent."
        return output
    except subprocess.TimeoutExpired:
        return "{\"error\": \"The pi agent timed out.\"}"
    except FileNotFoundError:
        return "{\"error\": \"Pi is not installed on the server.\"}"
    except Exception as e:
        return f'{{"error": "Error running pi agent: {str(e)}"}}'


async def run_pi_agent(
    task: str,
    system_prompt: Optional[str] = None,
    timeout: int = 120,
    skills: Optional[list[str]] = None,
) -> str:
    """Async wrapper that runs the synchronous pi subprocess in a thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _run_pi_sync, task, system_prompt, timeout, skills
    )


def extract_json(text: str) -> Any:
    """Try to find and parse the first JSON object or array in the text."""
    # Try to find a JSON block (with or without markdown fences)
    fences = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fences:
        try:
            return json.loads(fences.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find raw JSON object
    obj_match = re.search(r"\{[\s\S]*\}", text)
    if obj_match:
        try:
            return json.loads(obj_match.group(0))
        except json.JSONDecodeError:
            pass

    # Try to find raw JSON array
    arr_match = re.search(r"\[[\s\S]*\]", text)
    if arr_match:
        try:
            return json.loads(arr_match.group(0))
        except json.JSONDecodeError:
            pass

    return None


def parse_pi_output(text: str) -> Dict[str, Any]:
    """Parse the output of a pi agent into a dict."""
    data = extract_json(text)
    if data is not None:
        if isinstance(data, dict):
            return data
        if isinstance(data, list):
            return {"data": data}
    return {"content": text, "error": "Failed to parse JSON from pi agent"}
