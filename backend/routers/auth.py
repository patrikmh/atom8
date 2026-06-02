"""Google OAuth authentication router."""
import json
import urllib.parse
import urllib.request

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse

from auth_manager import get_google_credentials, is_authenticated, save_auth, load_auth, get_auth_email, is_token_expired
from config import settings
from models import AuthRequest, AuthStatus

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/google")
async def google_auth(request: AuthRequest):
    """Exchange Google OAuth code for tokens and store in auth.json."""
    client_id, client_secret = get_google_credentials()
    if not client_id or not client_secret:
        raise HTTPException(500, "Google OAuth credentials not configured")

    data = urllib.parse.urlencode({
        "code": request.code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": request.redirect_uri,
        "grant_type": "authorization_code",
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
    except Exception as e:
        raise HTTPException(400, f"Token exchange failed: {e}")

    access_token = result.get("access_token")
    if not access_token:
        raise HTTPException(400, "No access token received")

    _store_google_tokens(result)

    return {"status": "ok", "authenticated": True}


# Frontend-compatible aliases
@router.post("/google/token")
async def google_auth_alias(request: AuthRequest):
    """Alias for /google for frontend compatibility."""
    return await google_auth(request)


@router.get("/status")
async def auth_status():
    """Check if Google OAuth is authenticated."""
    return AuthStatus(
        authenticated=is_authenticated(),
        email=get_auth_email(),
        is_expired=is_token_expired(),
    )


@router.get("/google/status")
async def auth_status_alias():
    """Alias for /status for frontend compatibility."""
    return await auth_status()


@router.get("/url")
async def auth_url():
    """Get the Google OAuth authorization URL."""
    client_id = settings.google_client_id
    redirect_uri = settings.google_redirect_uri
    scope = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks.readonly https://www.googleapis.com/auth/drive.readonly"

    url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={urllib.parse.quote(client_id)}"
        f"&redirect_uri={urllib.parse.quote(redirect_uri)}"
        f"&scope={urllib.parse.quote(scope)}"
        "&response_type=code"
        "&access_type=offline"
        "&prompt=consent"
    )
    return {"url": url}


@router.get("/google/url")
async def auth_url_alias():
    """Alias for /url for frontend compatibility."""
    return await auth_url()


@router.post("/logout")
async def logout():
    """Clear auth tokens."""
    auth_data = load_auth()
    for key in ["google-antigravity", "google", "gmail", "google-gemini-cli"]:
        auth_data.pop(key, None)
    save_auth(auth_data)
    return {"status": "ok", "authenticated": False}


@router.delete("/google")
async def logout_alias():
    """Alias for /logout for frontend compatibility."""
    return await logout()


def _fetch_google_email(access_token: str) -> str | None:
    """Fetch the user's email from Google UserInfo API."""
    try:
        req = urllib.request.Request(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(req) as resp:
            user_info = json.loads(resp.read())
            return user_info.get("email")
    except Exception:
        return None


def _store_google_tokens(result: dict) -> None:
    """Store Google OAuth tokens in auth.json with proper timestamp."""
    import time
    access_token = result.get("access_token")
    refresh_token = result.get("refresh_token")
    expires_in = result.get("expires_in", 3600)
    email = _fetch_google_email(access_token) if access_token else None

    auth_data = load_auth()
    auth_data["google-antigravity"] = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": result.get("token_type", "Bearer"),
        "expires": int(time.time() * 1000) + (expires_in * 1000),
        "expires_in": expires_in,
        "scope": result.get("scope", ""),
        "email": email,
    }
    save_auth(auth_data)


async def process_google_callback(code: str):
    """Exchange Google OAuth code and store tokens."""
    if not code:
        return JSONResponse({"status": "error", "message": "No code provided"}, status_code=400)

    client_id, client_secret = get_google_credentials()
    if not client_id or not client_secret:
        return JSONResponse({"status": "error", "message": "Missing credentials"}, status_code=500)

    data = urllib.parse.urlencode({
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
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
    except Exception as e:
        return JSONResponse({"status": "error", "message": f"Token exchange failed: {e}"}, status_code=400)

    access_token = result.get("access_token")
    if not access_token:
        return JSONResponse({"status": "error", "message": "No access token received"}, status_code=400)

    _store_google_tokens(result)

    # Return HTML that closes the popup and signals success
    html = """<!DOCTYPE html>
<html>
<head><title>Auth Complete</title></head>
<body style="font-family:system-ui;text-align:center;padding:40px;">
  <h2 style="color:green;">Google Connected</h2>
  <p>You can close this window and return to the app.</p>
  <script>
    window.opener.postMessage({type: 'google-auth-success'}, '*');
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>"""
    return HTMLResponse(html)


@router.get("/google/callback")
async def google_callback(code: str = ""):
    """Handle OAuth redirect from Google popup."""
    return await process_google_callback(code)
