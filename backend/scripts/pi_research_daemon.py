#!/usr/bin/env python3
"""Headless pi session that polls the backend queue and runs web research."""
import sys
import os
import time
import json
import subprocess
import requests

BACKEND_URL = "http://localhost:8000"
POLL_INTERVAL = 5


def poll():
    try:
        r = requests.get(f"{BACKEND_URL}/api/ai/research/queue/pending", timeout=5)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"[poll error] {e}")
    return None


def mark_running(job_id: str):
    requests.post(f"{BACKEND_URL}/api/ai/research/queue/{job_id}/running", timeout=5)


def mark_done(job_id: str, result: dict):
    requests.post(f"{BACKEND_URL}/api/ai/research/queue/{job_id}/done", json=result, timeout=30)


def mark_error(job_id: str, error: str):
    requests.post(f"{BACKEND_URL}/api/ai/research/queue/{job_id}/error", json={"error": error}, timeout=30)


def run_pi_research(topic: str) -> dict:
    """Run a headless pi session with the web-research skill."""
    # Build the prompt that explicitly invokes the web-research skill
    prompt = (
        f"/web-research Research the topic: '{topic}'.\n\n"
        "Search the web using playwright-cli via the bash tool. "
        "Browse pages, extract relevant content, and synthesize a structured report. "
        "Return the final result as a JSON object with 'content' and 'sources' fields."
    )

    cmd = [
        "pi",
        "--print",
        "--no-session",
        "--tools", "bash",
        "--skill", os.path.expanduser("~/.pi/agent/skills/web-research/SKILL.md"),
        "--thinking", "medium",
        prompt,
    ]

    print(f"[research] Starting pi research for: {topic}")
    print(f"[research] Command: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
            cwd="/Users/patrikandersson/telegram/atom8",
        )
        stdout = result.stdout
        stderr = result.stderr

        print(f"[research] pi exit code: {result.returncode}")
        if stderr:
            print(f"[research] stderr: {stderr[:500]}")

        # Try to extract JSON from the output
        content = stdout.strip()
        # If the output contains markdown or JSON blocks, try to parse
        if "```json" in content:
            start = content.index("```json") + 7
            end = content.index("```", start)
            content = content[start:end].strip()
        elif "```" in content:
            start = content.index("```") + 3
            end = content.index("```", start)
            content = content[start:end].strip()

        try:
            parsed = json.loads(content)
            if "content" in parsed:
                return {"content": parsed["content"], "sources": parsed.get("sources", []), "status": "ok"}
        except json.JSONDecodeError:
            pass

        # Fallback: return the raw text as content
        return {
            "content": content[:3000] if content else "Research completed but no parseable output.",
            "sources": [],
            "status": "ok",
        }

    except subprocess.TimeoutExpired:
        return {"content": "Research timed out.", "sources": [], "status": "error"}
    except Exception as e:
        return {"content": f"Research failed: {e}", "sources": [], "status": "error"}


def main():
    print("[daemon] Headless pi research daemon started")
    while True:
        job = poll()
        if job:
            job_id = job["id"]
            topic = job["topic"]
            print(f"[daemon] Got job {job_id}: {topic}")
            mark_running(job_id)
            result = run_pi_research(topic)
            if result.get("status") == "error":
                mark_error(job_id, result["content"])
            else:
                mark_done(job_id, result)
            print(f"[daemon] Job {job_id} completed")
        else:
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
