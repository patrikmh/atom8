"""FastAPI entry point for the headless pi backend."""
import asyncio
import signal
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from pi_rpc import pi_manager
from models import HealthResponse
from routers import auth, data, ai, dashboard
from routers.auth import process_google_callback


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init all pi RPC pools. Shutdown: close them."""
    # Startup
    await pi_manager.init()
    yield
    # Shutdown
    await pi_manager.close()


app = FastAPI(
    title="Living Canvas API",
    description="Headless pi backend with skill-driven endpoints",
    version="3.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(data.router)
app.include_router(ai.router)
app.include_router(dashboard.router)


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    return HealthResponse(status="ok")


@app.get("/")
async def root(code: str = ""):
    """API root. Also handles OAuth callback at redirect_uri root."""
    if code:
        return await process_google_callback(code)
    return {"message": "Living Canvas API v3.0", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
