#!/usr/bin/env bash
# Shared Google OAuth token helper.
# Reads ~/.pi/agent/auth.json, checks expiry, refreshes if needed,
# and prints the valid access token as a single line (no quotes).
#
# Usage:  TOKEN=$(./get_token.sh)
#   or:  TOKEN=$(./get_token.sh "YOUR_CLIENT_ID" "YOUR_CLIENT_SECRET")
#
# If the token is expired or near expiry (< 5 min) and refresh fails,
# the script returns an error message to stderr and exits 1.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../common/lib.sh"

# Client ID / Secret from args, env vars, or fallback
CLIENT_ID="${1:-${GOOGLE_CLIENT_ID:-${GMAIL_CLIENT_ID:-}}}"
CLIENT_SECRET="${2:-${GOOGLE_CLIENT_SECRET:-${GMAIL_CLIENT_SECRET:-}}}"

# Get token using the shared library
get_token "$CLIENT_ID" "$CLIENT_SECRET"
