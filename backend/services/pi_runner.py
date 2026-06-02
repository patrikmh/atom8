"""Unified pi CLI runner with configurable system prompt, skills, and timeout.

This module consolidates the subprocess logic that was previously duplicated
across pi_agent.py and pi_chat.py.  A single PiRunner instance can be reused
for different tasks (data fetching, web research, chat, etc.) by supplying a
custom system_prompt and optional skills list.
"""

import subprocess
import asyncio
import os
import json
import re
from typing import Any, Dict, List, Optional

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configurable via environment
PI_PROVIDER = os.getenv("PI_PROVIDER", "fireworks")
PI_MODEL = os.getenv("PI_MODEL", "accounts/fireworks/routers/kimi-k2p6-turbo")

# Default skill set for chat / data fetching
DEFAULT_SKILLS = [
    os.path.expanduser("~/.pi/agent/skills/web-research/SKILL.md"),
    os.path.expanduser("~/.pi/agent/skills/gmail-fetch/SKILL.md"),
    os.path.expanduser("~/.pi/agent/skills/calendar-fetch/SKILL.md"),
    os.path.expanduser("~/.pi/agent/skills/tasks-fetch/SKILL.md"),
    os.path.expanduser("~/.pi/agent/skills/drive-fetch/SKILL.md"),
]

# Default system prompt for generic data fetching
DEFAULT_SYSTEM_PROMPT = (
    "You are a data fetch agent for a dashboard application. "
    "You have access to read, grep, find, and bash tools. "
    "For fetching Google data (Gmail, Calendar, Tasks, Drive), follow the relevant skill workflow and use bash with curl. "
    "For web research, follow the web-research skill and use bash with playwright-cli. "
    "Return ONLY the JSON result, no extra text, no markdown, no explanations."
)


def extract_json(text: str) -> Any:
    """Try to find and parse the first JSON object or array in the text.

    Searches (in order):
    1.  A fenced JSON block  `` ` `` json ... `` ` `
    2.  A raw JSON object
    3.  A raw JSON array

    Returns the parsed Python object or ``None`` when nothing is found.
    """
    # 1. Markdown fences
    fences = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fences:
        try:
            return json.loads(fences.group(1))
        except json.JSONDecodeError:
            pass

    # 2. Raw object
    obj_match = re.search(r"\{[\s\S]*\}", text)
    if obj_match:
        try:
            return json.loads(obj_match.group(0))
        except json.JSONDecodeError:
            pass

    # 3. Raw array
    arr_match = re.search(r"\[[\s\S]*\]", text)
    if arr_match:
        try:
            return json.loads(arr_match.group(0))
        except json.JSONDecodeError:
            pass

    return None


def parse_a2ui_components(text: str) -> tuple[str, List[Dict[str, Any]]]:
    """Extract A2UI JSON components from the response text.

    Returns a tuple ``(clean_text, components)`` where *clean_text* is the
    original text with all `` ` `` `a2ui` blocks removed.
    """
    components: List[Dict[str, Any]] = []
    pattern = r"```a2ui\s*\n(.*?)\n```"
    matches = re.findall(pattern, text, re.DOTALL)
    for match in matches:
        try:
            data = json.loads(match)
            if isinstance(data, dict) and data.get("type"):
                components.append(data)
        except json.JSONDecodeError:
            pass
    clean_text = re.sub(pattern, "", text, flags=re.DOTALL).strip()
    return clean_text, components


def parse_pi_output(text: str) -> Dict[str, Any]:
    """Parse the output of a pi agent into a standardised dict.

    * JSON dict  → returned as-is
    * JSON list  → wrapped in ``{"data": [...]}``
    * Plain text → ``{"content": text, "error": "..."}``
    """
    data = extract_json(text)
    if data is not None:
        if isinstance(data, dict):
            return data
        if isinstance(data, list):
            return {"data": data}
    return {"content": text, "error": "Failed to parse JSON from pi agent"}


class PiRunner:
    """Configurable wrapper around the ``pi`` CLI subprocess.

    Parameters
    ----------
    system_prompt:
        The system prompt injected before the task.  Defaults to
        ``DEFAULT_SYSTEM_PROMPT``.
    skills:
        List of paths to skill files that are passed via ``--skill``.
        When ``None`` the *default* skill set (for chat / data fetching)
        is loaded.
    tools:
        Comma-separated tool list forwarded to the pi CLI.
    timeout:
        Subprocess timeout in seconds.
    thinking:
        Thinking level for the pi CLI (``low``, ``medium``, ``high``).
    provider:
        Model provider slug.  Defaults to ``$PI_PROVIDER``.
    model:
        Model name.  Defaults to ``$PI_MODEL``.
    """

    def __init__(
        self,
        system_prompt: Optional[str] = None,
        skills: Optional[List[str]] = None,
        tools: str = "read,grep,find,bash",
        timeout: int = 120,
        thinking: str = "low",
        provider: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self.skills = skills if skills is not None else DEFAULT_SKILLS
        self.tools = tools
        self.timeout = timeout
        self.thinking = thinking
        self.provider = provider or PI_PROVIDER
        self.model = model or PI_MODEL

    def _build_command(self, task: str) -> List[str]:
        """Build the full ``pi`` CLI argument list for *task*.

        The final argument is the prompt string
        ``system_prompt + "\n\nTask: " + task + "\n\nReturn ONLY the JSON result."``
        """
        prompt = (
            f"{self.system_prompt}\n\n"
            f"Task: {task}\n\n"
            "Execute the task using the available tools. Return ONLY the JSON result."
        )

        cmd: List[str] = [
            "pi",
            "--print",
            "--no-session",
            "--provider",
            self.provider,
            "--model",
            self.model,
            "--thinking",
            self.thinking,
            "--tools",
            self.tools,
        ]

        for skill in self.skills:
            cmd.extend(["--skill", skill])

        cmd.append(prompt)
        return cmd

    def _run_sync(self, task: str) -> str:
        """Synchronous execution — blocks the current thread.

        Runs ``pi`` with the built command, captures stdout/stderr, and
        returns the raw text output.  On error a JSON-encoded error string
        is returned so callers can always attempt ``parse_pi_output``.
        """
        cmd = self._build_command(task)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                cwd=PROJECT_ROOT,
                env=os.environ.copy(),
            )
            output = result.stdout.strip()
            if not output:
                output = result.stderr.strip()
            if not output:
                output = "No response from pi agent."
            return output
        except subprocess.TimeoutExpired:
            return '{"error": "The pi agent timed out."}'
        except FileNotFoundError:
            return '{"error": "Pi is not installed on the server."}'
        except Exception as e:
            return f'{{"error": "Error running pi agent: {str(e)}"}}'

    async def run(self, task: str) -> str:
        """Async wrapper that delegates to the thread pool."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._run_sync, task)


# --- Convenience re-exports for backward compatibility ---

# Default runner for generic data fetching / web research
_default_runner = PiRunner()


async def run_pi_agent(
    task: str,
    system_prompt: Optional[str] = None,
    timeout: int = 120,
    skills: Optional[List[str]] = None,
) -> str:
    """Async entry-point used by ``pi_data_fetch.py`` and ``ai.py``.

    Creates a *task-scoped* runner when a custom ``system_prompt`` or
    ``skills`` list is provided, otherwise reuses the default runner.
    """
    if system_prompt or skills:
        runner = PiRunner(
            system_prompt=system_prompt,
            skills=skills,
            timeout=timeout,
        )
        return await runner.run(task)
    return await _default_runner.run(task)


# Default runner for chat (loads the full skill set)
_chat_runner = PiRunner(skills=DEFAULT_SKILLS)


async def send_to_pi(prompt: str, timeout: int = 60) -> str:
    """Async entry-point used by ``pi_chat.py``.

    The *prompt* is treated as the complete task text; the default chat
    system prompt is already baked into ``_chat_runner``.
    """
    return await _chat_runner.run(prompt)
