"""Generic headless pi agent runner with tool support."""

import subprocess
import asyncio
import os
import json
import re
from typing import Dict, Any, Optional

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _run_pi_sync(
    task: str,
    system_prompt: Optional[str] = None,
    timeout: int = 120,
) -> str:
    """Synchronous pi runner — runs in a thread pool."""
    if not system_prompt:
        system_prompt = (
            "You are a data fetch agent for a dashboard application. "
            "You have access to the project-specific extension tools: fetch_gmail, fetch_calendar, fetch_tasks, fetch_drive, research_topic, research_gmail, research_calendar, research_tasks, research_drive. "
            "You also have access to read, bash, grep, and find tools. "
            "Use the project-specific tools to fetch data directly. "
            "Return ONLY the JSON result, no extra text, no markdown, no explanations."
        )

    prompt = f"{system_prompt}\n\nTask: {task}\n\nExecute the task using the available tools. Return ONLY the JSON result."

    try:
        env = os.environ.copy()
        result = subprocess.run(
            [
                "pi",
                "--print",
                "--no-session",
                "--provider",
                "fireworks",
                "--model",
                "accounts/fireworks/routers/kimi-k2p6-turbo",
                "--thinking",
                "low",
                "--extension",
                ".pi/extensions/living-canvas.ts",
                "--extension",
                ".pi/extensions/living-canvas-research.ts",
                "--tools",
                "read,bash,grep,find,fetch_gmail,fetch_calendar,fetch_tasks,fetch_drive,research_topic,research_gmail,research_calendar,research_tasks,research_drive",
                prompt,
            ],
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
) -> str:
    """Async wrapper that runs the synchronous pi subprocess in a thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _run_pi_sync, task, system_prompt, timeout
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
