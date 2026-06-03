"""Pi RPC session manager: persistent pi --mode rpc processes."""
import asyncio
import json
import os
import subprocess
import time
from typing import Any

from config import settings
from skill_resolver import resolve_skill


class PiRpcSession:
    """Manages a single persistent pi --mode rpc subprocess.

    Communication protocol:
        - Send: JSON command on stdin, one line
        - Receive: JSON event on stdout, one per line
        - End marker: event with type == "agent_end"
    """

    def __init__(self, skill: str, tools: str | None = None, extra_flags: list[str] | None = None):
        self.skill = skill
        self.tools = tools or settings.pi_tools
        self.extra_flags = extra_flags or []
        self._proc: subprocess.Popen | None = None
        self._lock = asyncio.Lock()
        self._start_time = 0.0
        self._start()

    def _start(self) -> None:
        """Spawn the pi process."""
        skill_path = resolve_skill(self.skill)
        # Data-fetching skills need a strict JSON-only system prompt so the LLM
        # does not reformat script output as markdown tables.
        is_data_skill = self.skill in {"gmail-fetch", "calendar-fetch", "tasks-fetch", "drive-fetch"}
        extra_flags = list(self.extra_flags)
        if is_data_skill:
            extra_flags.append("--append-system-prompt")
            extra_flags.append(
                "You are a JSON API. When you run a script that returns JSON, "
                "output ONLY the raw JSON returned by the script. Do NOT convert to markdown tables, "
                "do NOT add commentary, do NOT summarize. Just echo the exact JSON output from the script."
            )
        cmd = [
            "pi",
            "--mode", "rpc",
            "--no-session",
            "--skill", skill_path,
            "--tools", self.tools,
            "--provider", settings.pi_provider,
            "--model", settings.pi_model,
            *extra_flags,
        ]
        # Ensure Google OAuth credentials are in the environment for skills
        env = os.environ.copy()
        if settings.google_client_id:
            env["GOOGLE_CLIENT_ID"] = settings.google_client_id
        if settings.google_client_secret:
            env["GOOGLE_CLIENT_SECRET"] = settings.google_client_secret
        self._proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=os.getcwd(),
            env=env,
        )
        self._start_time = time.time()

    def _restart(self) -> None:
        """Kill and respawn the process."""
        if self._proc:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                self._proc.kill()
        self._start()

    def _is_alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    async def prompt(self, message: str, timeout: int = settings.pi_timeout) -> dict[str, Any]:
        """Send a prompt and return parsed events.

        Args:
            message: The prompt to send (may include /skill-name trigger)
            timeout: Max seconds to wait
        """
        async with self._lock:
            if not self._is_alive():
                self._restart()

            proc = self._proc
            assert proc is not None and proc.stdin is not None and proc.stdout is not None

            # Send prompt command
            cmd_obj = {"type": "prompt", "message": message}
            proc.stdin.write(json.dumps(cmd_obj) + "\n")
            proc.stdin.flush()

            # Collect events until agent_end
            events = []
            start = time.time()
            try:
                for line in proc.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    # Skip the initial command acceptance response
                    if event.get("type") == "response" and event.get("command") == "prompt":
                        if not event.get("success", True):
                            return {"status": "error", "error": event.get("error", "Prompt rejected")}
                        continue
                    # Skip fire-and-forget extension UI requests
                    if event.get("type") == "extension_ui_request":
                        continue
                    events.append(event)
                    if event.get("type") == "agent_end":
                        break
                    if time.time() - start > timeout:
                        break
            except Exception as e:
                return {"status": "error", "error": str(e), "events": events}

            return self._parse_events(events)

    @staticmethod
    def _extract_text(content: str | list | None) -> str:
        """Extract plain text from AssistantMessage content.

        Content can be a string (legacy) or an array of blocks:
        [{"type": "text", "text": "..."}, {"type": "thinking", ...}, ...]
        """
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        # Array of blocks
        texts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                texts.append(block.get("text", ""))
        return "".join(texts)

    def _parse_events(self, events: list[dict]) -> dict[str, Any]:
        """Parse the event stream to extract the final response.

        Strategy:
            1. Look for turn_end event (assistant message for the turn)
            2. Fall back to agent_end (all messages for the entire run)
            3. Extract text from content blocks
            4. Try to parse JSON from the extracted text
            5. Handle errors (stopReason == "error")
        """
        # Try turn_end first (direct assistant message)
        turn_end = None
        for ev in events:
            if ev.get("type") == "turn_end":
                turn_end = ev

        if turn_end:
            message = turn_end.get("message", {})
            content = self._extract_text(message.get("content"))
            stop_reason = message.get("stopReason")
            error_msg = message.get("errorMessage")

            if stop_reason == "error" and error_msg:
                return {"status": "error", "error": error_msg, "raw": content}

            result = self._extract_json(content)
            if result:
                return {"status": "ok", "data": result, "raw": content}
            return {"status": "ok", "data": content, "raw": content}

        # Fall back to agent_end
        agent_end = None
        for ev in events:
            if ev.get("type") == "agent_end":
                agent_end = ev
                break

        if not agent_end:
            return {"status": "error", "error": "No agent_end or turn_end event received", "events": events}

        messages = agent_end.get("messages", [])
        if not messages:
            return {"status": "error", "error": "No messages in agent_end", "events": events}

        # Last assistant message
        assistant_msgs = [m for m in messages if m.get("role") == "assistant"]
        if not assistant_msgs:
            return {"status": "error", "error": "No assistant message found", "events": events}

        last_msg = assistant_msgs[-1]
        content = self._extract_text(last_msg.get("content"))
        stop_reason = last_msg.get("stopReason")
        error_msg = last_msg.get("errorMessage")

        if stop_reason == "error" and error_msg:
            return {"status": "error", "error": error_msg, "raw": content}

        # Try to find JSON block
        result = self._extract_json(content)
        if result:
            return {"status": "ok", "data": result, "raw": content}

        return {"status": "ok", "data": content, "raw": content}

    @staticmethod
    def _extract_json(text: str) -> Any | None:
        """Extract JSON from markdown code blocks or raw text."""
        # Try markdown code blocks
        import re
        blocks = re.findall(r"```(?:json)?\n(.*?)\n```", text, re.DOTALL)
        for block in blocks:
            try:
                return json.loads(block.strip())
            except json.JSONDecodeError:
                continue
        # Try raw JSON
        text = text.strip()
        if text.startswith("[") and text.endswith("]"):
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass
        if text.startswith("{") and text.endswith("}"):
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass
        return None

    async def close(self) -> None:
        """Terminate the process."""
        if self._proc:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                self._proc.kill()
            self._proc = None


class PiPool:
    """A pool of PiRpcSession workers for a given skill.

    Uses round-robin dispatch across workers so multiple requests
    to the same skill can execute in parallel.
    """

    def __init__(self, skill: str, size: int = 1, **kwargs: Any):
        self.skill = skill
        self.size = size
        self._kwargs = kwargs
        self._workers: list[PiRpcSession] = []
        self._ready = False
        self._idx = 0

    async def init(self) -> None:
        """Initialize all workers."""
        for _ in range(self.size):
            self._workers.append(PiRpcSession(self.skill, **self._kwargs))
        self._ready = True

    async def prompt(self, message: str, timeout: int = settings.pi_timeout) -> dict[str, Any]:
        """Send a prompt using the next available worker (round-robin)."""
        if not self._ready or not self._workers:
            await self.init()
        # Pick a worker round-robin
        worker = self._workers[self._idx % self.size]
        self._idx += 1
        return await worker.prompt(message, timeout)

    async def close(self) -> None:
        """Close all workers."""
        for w in self._workers:
            await w.close()
        self._workers = []
        self._ready = False


# Global singletons — one pool per endpoint type
class PiSessionManager:
    """Singleton manager for all pi endpoint pools."""

    def __init__(self):
        self._pools: dict[str, PiPool] = {}
        self._initialized = False

    async def init(self) -> None:
        """Start all pi pools."""
        if self._initialized:
            return
        # All pools use --no-session (ephemeral) for the pi process.
        # Chat session history is managed in-memory by the ai router.
        pool_size = settings.pi_pool_size
        self._pools = {
            "gmail": PiPool("gmail-fetch", size=pool_size),
            "calendar": PiPool("calendar-fetch", size=pool_size),
            "tasks": PiPool("tasks-fetch", size=pool_size),
            "drive": PiPool("drive-fetch", size=pool_size),
            "research": PiPool("web-research", size=pool_size),
            "chat": PiPool("web-research", size=pool_size),
        }
        await asyncio.gather(*[p.init() for p in self._pools.values()])
        self._initialized = True

    def get(self, name: str) -> PiPool:
        """Get a pool by name."""
        return self._pools[name]

    async def close(self) -> None:
        """Close all pools."""
        await asyncio.gather(*[p.close() for p in self._pools.values()], return_exceptions=True)
        self._initialized = False


# Global instance
pi_manager = PiSessionManager()
