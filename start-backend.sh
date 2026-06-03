#!/usr/bin/env bash
# Start the Living Canvas FastAPI backend with multiple workers for parallel request handling.

cd "$(dirname "$0")/backend"

# Install deps if needed
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt -q

# Start with 4 workers for parallel processing.
# Uses --loop uvloop for better async performance.
# Remove --reload for production; use start-backend-dev.sh for development with reload.
exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4 --loop uvloop
