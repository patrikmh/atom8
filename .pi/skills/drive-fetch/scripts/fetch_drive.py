#!/usr/bin/env python3
"""Fetch recent files from Google Drive using the shared google-auth token helper.

Usage: fetch_drive.py [count] [query]
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


def fetch_files(token: str, count: int = 10, query: str = "") -> list:
    """Fetch recent files from Google Drive API."""
    url = f"https://www.googleapis.com/drive/v3/files?pageSize={count}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size)"
    if query:
        url += "&" + urllib.parse.urlencode({"q": f"name contains '{query}'"})
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Token expired or invalid")
        raise RuntimeError(f"Drive API error: {e.code}")
    return data.get("files", [])


def parse_file(data: dict) -> dict:
    """Parse Google Drive file into a structured dict."""
    return {
        "id": data.get("id"),
        "name": data.get("name", "No Name"),
        "mimeType": data.get("mimeType", ""),
        "modifiedTime": data.get("modifiedTime", ""),
        "size": data.get("size", ""),
    }


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    query = sys.argv[2] if len(sys.argv) > 2 else ""
    token = get_token()
    files = fetch_files(token, count, query)
    parsed = [parse_file(f) for f in files[:count]]
    print(json.dumps({"files": parsed}, indent=2))


if __name__ == "__main__":
    main()
