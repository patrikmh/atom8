from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime
import os

from database import Base, SessionLocal, User, get_db
from models import UserToken
from services.google_api import get_google_token, get_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/google/token")
async def store_google_token(token: UserToken, db: Session = Depends(get_db)):
    """Store Google OAuth tokens after user completes OAuth flow."""
    user_id = "default"  # v1: single user
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(
            id=user_id,
            email="user@example.com",
            google_access_token=token.access_token,
            google_refresh_token=token.refresh_token,
            google_token_expiry=token.expires_at,
            created_at=datetime.utcnow(),
        )
        db.add(user)
    else:
        user.google_access_token = token.access_token
        if token.refresh_token:
            user.google_refresh_token = token.refresh_token
        user.google_token_expiry = token.expires_at
    
    db.commit()
    return {"status": "ok", "message": "Token stored"}


@router.get("/google/url")
async def get_google_auth_url():
    """Generate Google OAuth URL for the user to authenticate."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    # Use the current backend host for redirect
    redirect_uri = "http://localhost:8000/api/auth/google/callback"
    
    scopes = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/tasks.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ]
    
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        "&response_type=code"
        "&access_type=offline"
        "&prompt=consent"
        f"&scope={'+'.join(scopes)}"
    )
    
    return {"url": url}


@router.get("/google/callback")
async def google_auth_callback(code: str):
    """Handle Google OAuth callback."""
    import httpx
    
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    redirect_uri = "http://localhost:8000/api/auth/google/callback"
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Google OAuth failed: {resp.text}")
    
    data = resp.json()
    
    # Store token in auth.json for compatibility with google_api.py
    try:
        import json
        auth_path = os.path.expanduser("~/.pi/agent/auth.json")
        with open(auth_path, "r") as f:
            auth = json.load(f)
        
        auth["google-antigravity"] = {
            "type": "oauth",
            "access": data.get("access_token"),
            "refresh": data.get("refresh_token"),
            "expires": int((datetime.utcnow().timestamp() + data.get("expires_in", 3600)) * 1000),
        }
        
        with open(auth_path, "w") as f:
            json.dump(auth, f, indent=2)
    except Exception as e:
        print(f"Failed to store token: {e}")
    
    return {
        "status": "ok",
        "message": "Authentication successful. You can close this window.",
    }


@router.get("/google/status")
async def get_google_auth_status(db: Session = Depends(get_db)):
    """Check if Google OAuth is configured."""
    # Check auth.json first (primary source)
    token = get_google_token()
    if token and token.get("access"):
        # Check if token is valid by trying to refresh or get access token
        access = await get_access_token()
        if access:
            return {"authenticated": True, "has_token": True, "is_expired": False}
        return {"authenticated": False, "has_token": True, "is_expired": True}
    
    # Fallback to DB
    user = db.query(User).filter(User.id == "default").first()
    
    if not user:
        return {"authenticated": False, "has_token": False, "is_expired": False}
    
    has_token = bool(user.google_access_token)
    is_expired = False
    if user.google_token_expiry and user.google_token_expiry < datetime.utcnow():
        is_expired = True
    
    return {
        "authenticated": has_token and not is_expired,
        "has_token": has_token,
        "is_expired": is_expired,
    }


@router.delete("/google")
async def clear_google_auth(db: Session = Depends(get_db)):
    """Clear Google auth tokens."""
    user = db.query(User).filter(User.id == "default").first()
    if user:
        user.google_access_token = None
        user.google_refresh_token = None
        user.google_token_expiry = None
        db.commit()
    
    # Also clear auth.json
    try:
        import json
        auth_path = os.path.expanduser("~/.pi/agent/auth.json")
        with open(auth_path, "r") as f:
            auth = json.load(f)
        if "google-antigravity" in auth:
            del auth["google-antigravity"]
        with open(auth_path, "w") as f:
            json.dump(auth, f, indent=2)
    except Exception:
        pass
    
    return {"status": "ok", "message": "Auth cleared"}
