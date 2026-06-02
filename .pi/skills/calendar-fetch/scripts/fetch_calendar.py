#!/usr/bin/env python3
"""Fetch calendar events from Google Calendar using the shared google-auth token helper.

Usage: fetch_calendar.py [date] [query]
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


def fetch_events(token: str, date: str = "", query: str = "") -> list:
    """Fetch events from Google Calendar API."""
    # Use the primary calendar
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true"
    if date:
        url += "&" + urllib.parse.urlencode({"timeMin": date + "T00:00:00Z", "timeMax": date + "T23:59:59Z"})
    if query:
        url += "&" + urllib.parse.urlencode({"q": query})
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Token expired or invalid")
        raise RuntimeError(f"Calendar API error: {e.code}")
    return data.get("items", [])


def parse_event(data: dict) -> dict:
    """Parse Calendar event into a structured dict."""
    start = data.get("start", {})
    end = data.get("end", {})
    return {
        "id": data.get("id"),
        "summary": data.get("summary", "No Title"),
        "start": start.get("dateTime") or start.get("date", ""),
        "end": end.get("dateTime") or end.get("date", ""),
        "location": data.get("location", ""),
    }


def main():
    date = sys.argv[1] if len(sys.argv) > 1 else ""
    query = sys.argv[2] if len(sys.argv) > 2 else ""
    token = get_token()
    events = fetch_events(token, date, query)
    parsed = [parse_event(e) for e in events[:10]]
    print(json.dumps({"events": parsed}, indent=2))


if __name__ == "__main__":
    main()
