#!/usr/bin/env python3
"""Fetch tasks from Google Tasks using the shared google-auth token helper.

Usage: fetch_tasks.py [list_id] [query]
"""

import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
import urllib.parse

# Resolve google-auth helper relative to this skill
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GET_TOKEN = os.path.join(SCRIPT_DIR, "..", "..", "google-auth", "scripts", "get_token.py")


def get_token() -> str:
    """Get a valid access token via the shared google-auth helper."""
    result = subprocess.run(["python3", GET_TOKEN], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError("Failed to get token: " + result.stderr)
    data = json.loads(result.stdout)
    if "error" in data:
        raise RuntimeError(data["error"])
    return data["token"]


def fetch_tasks(token: str, list_id: str = "default", query: str = "") -> list:
    """Fetch tasks from Google Tasks API."""
    url = f"https://tasks.googleapis.com/tasks/v1/lists/{list_id}/tasks?maxResults=10"
    if query:
        url += "&" + urllib.parse.urlencode({"q": query})
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Token expired or invalid")
        raise RuntimeError(f"Tasks API error: {e.code}")
    return data.get("items", [])


def parse_task(data: dict) -> dict:
    """Parse Google Task into a structured dict."""
    return {
        "id": data.get("id"),
        "title": data.get("title", "No Title"),
        "completed": data.get("status") == "completed",
        "due": data.get("due", ""),
    }


def main():
    list_id = sys.argv[1] if len(sys.argv) > 1 else "default"
    query = sys.argv[2] if len(sys.argv) > 2 else ""
    token = get_token()
    tasks = fetch_tasks(token, list_id, query)
    parsed = [parse_task(t) for t in tasks[:10]]
    print(json.dumps({"tasks": parsed}, indent=2))


if __name__ == "__main__":
    main()
