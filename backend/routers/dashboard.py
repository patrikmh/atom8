from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime
import json

from database import SessionLocal, Layout, WidgetCache, get_db
from models import LayoutSave, WidgetCacheRequest

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/layout")
async def get_layout(db: Session = Depends(get_db)):
    """Get saved layout for the default user."""
    layout = db.query(Layout).filter(Layout.user_id == "default").first()
    
    if not layout:
        return {
            "widgets": None,
            "background": None,
            "sidebar_open": True,
            "status": "not_found"
        }
    
    return {
        "widgets": json.loads(layout.widgets_json) if layout.widgets_json else None,
        "background": json.loads(layout.background_json) if layout.background_json else None,
        "sidebar_open": layout.sidebar_open,
        "status": "ok"
    }


@router.post("/layout")
async def save_layout(data: LayoutSave, db: Session = Depends(get_db)):
    """Save layout for the default user."""
    layout = db.query(Layout).filter(Layout.user_id == "default").first()
    
    if not layout:
        layout = Layout(
            id="default",
            user_id="default",
            widgets_json=data.widgets_json,
            background_json=data.background_json,
            sidebar_open=data.sidebar_open,
            updated_at=datetime.utcnow(),
        )
        db.add(layout)
    else:
        layout.widgets_json = data.widgets_json
        layout.background_json = data.background_json
        layout.sidebar_open = data.sidebar_open
        layout.updated_at = datetime.utcnow()
    
    db.commit()
    return {"status": "ok", "message": "Layout saved"}


@router.get("/cache/{widget_id}")
async def get_widget_cache(widget_id: str, db: Session = Depends(get_db)):
    """Get cached data for a widget."""
    cache = db.query(WidgetCache).filter(
        WidgetCache.widget_id == widget_id,
        WidgetCache.user_id == "default"
    ).first()
    
    if not cache:
        return {"data": None, "status": "not_found"}
    
    return {
        "data": json.loads(cache.data_json) if cache.data_json else None,
        "fetched_at": cache.fetched_at.isoformat() if cache.fetched_at else None,
        "status": "ok"
    }


@router.post("/cache/{widget_id}")
async def set_widget_cache(widget_id: str, request: WidgetCacheRequest, db: Session = Depends(get_db)):
    """Save cached data for a widget."""
    cache = db.query(WidgetCache).filter(
        WidgetCache.widget_id == widget_id,
        WidgetCache.user_id == "default"
    ).first()
    
    if not cache:
        cache = WidgetCache(
            id=f"{widget_id}_default",
            widget_id=widget_id,
            user_id="default",
            data_json=json.dumps(request.data),
            fetched_at=datetime.utcnow(),
        )
        db.add(cache)
    else:
        cache.data_json = json.dumps(request.data)
        cache.fetched_at = datetime.utcnow()
    
    db.commit()
    return {"status": "ok"}
