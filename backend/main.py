from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Load .env from project root (one directory above backend/)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from database import init_db
from routers import data, auth, dashboard, ai

app = FastAPI(title="Living Canvas Dashboard API", version="0.2.0")

# CORS — configurable via environment for production safety
CORS_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")
CORS_CREDENTIALS = os.getenv("CORS_ALLOW_CREDENTIALS", "false").lower() == "true"

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Init DB
init_db()

# Routers
app.include_router(data.router)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(ai.router)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"message": "Living Canvas Dashboard API", "version": "0.2.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
