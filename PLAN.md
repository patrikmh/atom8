# Multilingual Agent-Based Data Fetching — Plan

## Goal
Replace the English-centric, regex-based keyword and query parsing in the data fetching pipeline with the LLM agent's native multilingual understanding. The agent (kimi-k2p6-turbo) already understands and can respond in Swedish, German, Spanish, etc. We should use it instead of hardcoded English regex.

## Files to Change

| Step | File | Scope |
|------|------|-------|
| 1 | `.pi/extensions/living-canvas.ts` | Update `fetch_gmail` tool description with Gmail query examples so the agent knows how to build valid queries. |
| 2 | `backend/services/pi_data_fetch.py` | Remove `parse_gmail_query` entirely. In `fetch_gmail_pi`, pass the raw user prompt directly to the agent. Also update `fetch_calendar_pi`, `fetch_tasks_pi`, `fetch_drive_pi` to include the raw prompt in the agent task. |
| 3 | `backend/services/ai_research.py` | Remove `analyze_intent` and `DATA_SOURCE_KEYWORDS` — no more keyword-based routing. |
| 4 | `backend/routers/ai.py` | Replace the `analyze_research_intent` call in `/research` with a direct agent call that lets the agent decide what to fetch based on the user's natural language prompt. |

## What Stays the Same
- The backend formatting layer in `/api/ai/research` that converts raw email data into a summary string (e.g., `Found 5 email(s): 1. Subject from Sender...`). The frontend contract stays intact.
- The `in_memory` TTL cache in `pi_data_fetch.py` stays intact.
- The `run_pi_agent` and `parse_pi_output` infrastructure in `pi_agent.py` stays intact.

## Out of Scope
- True summarization (e.g., "summarize these emails"). The current system fetches metadata-only (subject, snippet) and does not read full email bodies. Actual summarization would require a second agent pass with the full content. This is a feature request, not a parsing fix.
