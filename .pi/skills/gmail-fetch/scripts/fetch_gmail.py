#!/usr/bin/env python3
"""Fetch emails from Gmail using the shared google-auth token helper.

Usage: fetch_gmail.py [count] [query]
"""

import json
import os
import subprocess
import sys
import urllib.request
import urllib.parse
import urllib.error

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


def fetch_messages(token: str, count: int = 10, query: str = "") -> list:
    """Fetch message list from Gmail API."""
    url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults={count}&format=metadata"
    if query:
        url += "&" + urllib.parse.urlencode({"q": query})
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Token expired or invalid")
        raise RuntimeError(f"Gmail API error: {e.code}")
    return data.get("messages", [])


def fetch_message_detail(token: str, msg_id: str) -> dict:
    """Fetch full message details from Gmail API."""
    url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}?format=full"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Gmail API error: {e.code}")
    return data


def parse_email(data: dict) -> dict:
    """Parse Gmail message response into a structured email dict."""
    headers = {h["name"]: h["value"] for h in data.get("payload", {}).get("headers", [])}
    from_header = headers.get("From", "")
    from_email = ""
    from_name = ""
    if "<" in from_header and ">" in from_header:
        from_name = from_header.split("<")[0].strip().strip('"')
        from_email = from_header[from_header.find("<") + 1:from_header.find(">")]
    else:
        from_email = from_header
    return {
        "id": data.get("id"),
        "subject": headers.get("Subject", "No Subject"),
        "from_email": from_email,
        "from_name": from_name,
        "date": headers.get("Date", ""),
        "preview": data.get("snippet", "")[:200],
    }


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    query = sys.argv[2] if len(sys.argv) > 2 else ""
    token = get_token()
    messages = fetch_messages(token, count, query)
    emails = []
    for msg in messages[:count]:
        try:
            detail = fetch_message_detail(token, msg["id"])
            emails.append(parse_email(detail))
        except Exception as e:
            emails.append({"id": msg["id"], "error": str(e)})
    print(json.dumps({"emails": emails}, indent=2))


if __name__ == "__main__":
    main()
