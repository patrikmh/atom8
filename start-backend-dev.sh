#!/usr/bin/env bash
# Start the Living Canvas FastAPI backend in development mode with hot reload.

cd "$(dirname "$0")/backend"

# Install deps if needed
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt -q

# Start with --reload for development (single worker only)
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
