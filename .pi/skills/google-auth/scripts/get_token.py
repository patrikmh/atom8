#!/usr/bin/env python3
"""Read and refresh Google OAuth tokens from ~/.pi/agent/auth.json.

Returns a JSON object with the valid access token and expiry timestamp.
This script handles token refresh automatically when the token is expired
or near expiry (< 5 minutes).
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse

AUTH_FILE = os.path.expanduser("~/.pi/agent/auth.json")
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"


def load_auth() -> dict:
    """Load the auth file. Returns empty dict if missing or unreadable."""
    if not os.path.exists(AUTH_FILE):
        return {}
    try:
        with open(AUTH_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def save_auth(data: dict) -> None:
    """Save the auth file atomically."""
    tmp = AUTH_FILE + ".tmp"
    os.makedirs(os.path.dirname(AUTH_FILE), exist_ok=True)
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, AUTH_FILE)


def get_google_token_entry(auth: dict) -> dict:
    """Extract the Google token entry from the auth file.

    The Google token is stored under the 'google-antigravity' key.
    """
    google = auth.get("google-antigravity", {})
    if not google:
        return {}
    return {
        "access_token": google.get("access"),
        "refresh_token": google.get("refresh"),
        "token_expiry": google.get("expires", 0) // 1000,  # ms -> s
        "client_id": os.getenv("GOOGLE_CLIENT_ID") or os.getenv("GMAIL_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET") or os.getenv("GMAIL_CLIENT_SECRET", ""),
    }


def refresh_token(token: dict) -> dict:
    """Refresh the access token using the refresh token.

    Returns the updated token dict with new token and expiry.
    """
    refresh_token = token.get("refresh_token")
    client_id = token.get("client_id", "")
    client_secret = token.get("client_secret", "")

    if not refresh_token:
        print(json.dumps({"error": "No refresh token available"}), file=sys.stderr)
        sys.exit(1)

    payload = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode("utf-8")

    req = urllib.request.Request(
        GOOGLE_OAUTH_TOKEN_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(json.dumps({"error": f"Refresh failed: {e.code} {body}"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Refresh failed: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

    # Update token data
    token["access_token"] = data["access_token"]
    token["token_expiry"] = int(time.time()) + data.get("expires_in", 3600)

    # Update auth.json
    auth = load_auth()
    if "google-antigravity" not in auth:
        auth["google-antigravity"] = {}
    auth["google-antigravity"]["access"] = data["access_token"]
    auth["google-antigravity"]["expires"] = token["token_expiry"] * 1000  # ms
    save_auth(auth)

    return token


def get_token() -> dict:
    """Get a valid Google access token.

    Reads auth.json, checks expiry, refreshes if needed, and returns
the token info.
    """
    auth = load_auth()
    if not auth:
        return {"error": "No auth data found"}

    token = get_google_token_entry(auth)
    if not token.get("access_token"):
        return {"error": "No Google token found"}

    expiry = token.get("token_expiry", 0)
    now = time.time()

    # Refresh if expired or within 5 minutes of expiry
    if now >= expiry - 300:
        token = refresh_token(token)

    return {
        "token": token.get("access_token"),
        "expiry": token.get("token_expiry"),
    }


if __name__ == "__main__":
    print(json.dumps(get_token()))
