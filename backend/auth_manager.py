"""Google OAuth token management via auth.json."""
import json
import os
from pathlib import Path

from config import settings


def load_auth() -> dict:
    """Load auth.json from pi agent directory."""
    path = settings.auth_json_path
    if path.exists():
        with open(path, "r") as f:
            return json.load(f)
    return {}


def save_auth(data: dict) -> None:
    """Save auth.json to pi agent directory."""
    path = settings.auth_json_path
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def get_google_token() -> str | None:
    """Get a valid Google access token from auth.json."""
    auth = load_auth()
    # Try multiple keys pi ecosystem uses
    for key in ["google-antigravity", "google", "gmail", "google-gemini-cli"]:
        entry = auth.get(key)
        if isinstance(entry, dict):
            token = entry.get("access_token")
            if token:
                return token
            # Fallback: some keys use 'access' instead of 'access_token'
            token = entry.get("access")
            if token:
                return token
    return None


def get_google_refresh_token() -> str | None:
    """Get the Google refresh token from auth.json."""
    auth = load_auth()
    for key in ["google-antigravity", "google", "gmail", "google-gemini-cli"]:
        entry = auth.get(key)
        if isinstance(entry, dict):
            token = entry.get("refresh_token")
            if token:
                return token
            # Fallback: some keys use 'refresh' instead of 'refresh_token'
            token = entry.get("refresh")
            if token:
                return token
    return None


def get_google_credentials() -> tuple[str, str]:
    """Get client ID and secret from environment."""
    return settings.google_client_id, settings.google_client_secret


def refresh_google_token() -> str | None:
    """Refresh the Google access token using the refresh token."""
    refresh_token = get_google_refresh_token()
    client_id, client_secret = get_google_credentials()

    if not refresh_token or not client_id or not client_secret:
        return None

    import urllib.request
    import urllib.parse

    data = urllib.parse.urlencode({
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            new_access_token = result.get("access_token")
            if new_access_token:
                # Update auth.json
                auth = load_auth()
                for key in ["google-antigravity", "google", "gmail"]:
                    if key in auth:
                        auth[key]["access_token"] = new_access_token
                save_auth(auth)
                return new_access_token
    except Exception:
        pass
    return None


def get_auth_email() -> str | None:
    """Get the email from the best Google auth entry."""
    auth = load_auth()
    for key in ["google-antigravity", "google", "gmail", "google-gemini-cli"]:
        entry = auth.get(key)
        if isinstance(entry, dict):
            email = entry.get("email")
            if email:
                return email
    return None


def get_valid_token() -> str | None:
    """Get a valid (non-expired) Google access token, refreshing if needed."""
    token = get_google_token()
    if token:
        return token
    return refresh_google_token()


def is_authenticated() -> bool:
    """Check if Google OAuth tokens are present."""
    return get_google_token() is not None


def is_token_expired() -> bool:
    """Check if the Google token is expired."""
    auth = load_auth()
    for key in ["google-antigravity", "google", "gmail", "google-gemini-cli"]:
        entry = auth.get(key)
        if isinstance(entry, dict):
            expires_ms = entry.get("expires", entry.get("expires_in", 0))
            if expires_ms:
                import time
                now_ms = int(time.time() * 1000)
                return now_ms > int(expires_ms)
    return True
