#!/usr/bin/env bash
# =============================================================================
# Google Skills Shared Library
# =============================================================================
# Common utilities for all Google data-fetch skills. Source this in any script:
#   source "$(dirname "$0")/../../common/lib.sh"
#
# Provides:
#   - Token management (get_token, validate_token)
#   - Output formatting (format_json, format_table, format_csv, format_tsv,
#     format_markdown, format_compact)
#   - Pagination helpers (paginate)
#   - Error handling (check_error, check_http_status)
#   - URL encoding (urlencode)
#   - Date helpers (date_iso, date_add_days, date_add_hours)
#   - Logging (log, log_err, log_debug, log_verbose)
#   - Configuration loading (load_config)
#   - API response processing (extract_field, count_results)
#   - macOS / Linux compatibility
# =============================================================================

# --- strict mode ---
set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

# Auth file path
GSKILL_AUTH_FILE="${GSKILL_AUTH_FILE:-${HOME}/.pi/agent/auth.json}"
GSKILL_CONFIG_FILE="${GSKILL_CONFIG_FILE:-${HOME}/.pi/agent/google-skills.conf}"

# Default output format
GSKILL_FORMAT="${GSKILL_FORMAT:-json}"

# Verbose mode
GSKILL_VERBOSE="${GSKILL_VERBOSE:-0}"

# Max retries for transient errors
GSKILL_MAX_RETRIES="${GSKILL_MAX_RETRIES:-3}"

# Retry delay (seconds)
GSKILL_RETRY_DELAY="${GSKILL_RETRY_DELAY:-1}"

# Google OAuth token endpoint
GSKILL_OAUTH_URL="https://oauth2.googleapis.com/token"

# =============================================================================
# LOGGING
# =============================================================================

log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2; }
log_err() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; }
log_warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $*" >&2; }
log_debug() {
  if [[ "$GSKILL_VERBOSE" -ge 1 ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] DEBUG: $*" >&2
  fi
}
log_verbose() {
  if [[ "$GSKILL_VERBOSE" -ge 2 ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] VERBOSE: $*" >&2
  fi
}

# =============================================================================
# CONFIGURATION LOADING
# =============================================================================

# Load configuration from ~/.pi/agent/google-skills.conf
# Format: KEY=VALUE (one per line, comments start with #)
load_config() {
  if [[ -f "$GSKILL_CONFIG_FILE" ]]; then
    log_debug "Loading config from $GSKILL_CONFIG_FILE"
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
      [[ -z "$key" || "$key" == \#* ]] && continue
      key="$(echo "$key" | xargs)"
      value="$(echo "$value" | xargs)"
      # Only set if not already set in environment
      if [[ -z "${!key:-}" ]]; then
        export "$key=$value"
      fi
    done < "$GSKILL_CONFIG_FILE"
  else
    log_debug "No config file found at $GSKILL_CONFIG_FILE"
  fi
}

# =============================================================================
# TOKEN MANAGEMENT
# =============================================================================

# Get a value from auth.json using jq
_gskill_auth_get() {
  local key="$1"
  if [[ -f "$GSKILL_AUTH_FILE" ]]; then
    jq -r "${key}" "$GSKILL_AUTH_FILE" 2>/dev/null || echo "null"
  else
    echo "null"
  fi
}

# Save a value back to auth.json atomically
_gskill_auth_save() {
  local access="$1"
  local expires_ms="$2"
  local tmpfile="${GSKILL_AUTH_FILE}.tmp.$$"
  mkdir -p "$(dirname "$GSKILL_AUTH_FILE")"
  # Determine which key to update
  local current_key
  current_key=$(_gskill_auth_get '."google-antigravity".access_token')
  if [[ "$current_key" == "null" || -z "$current_key" ]]; then
    current_key=$(_gskill_auth_get '."google-antigravity".access')
  fi
  if [[ "$current_key" != "null" && -n "$current_key" ]]; then
    jq --arg a "$access" --arg e "$expires_ms" \
       '."google-antigravity".access_token = $a | ."google-antigravity".expires = ($e | tonumber)' \
       "$GSKILL_AUTH_FILE" > "$tmpfile"
  else
    jq --arg a "$access" --arg e "$expires_ms" \
       '."google-gemini-cli".access_token = $a | ."google-gemini-cli".expires = ($e | tonumber)' \
       "$GSKILL_AUTH_FILE" > "$tmpfile"
  fi
  mv "$tmpfile" "$GSKILL_AUTH_FILE"
}

# Get a valid access token. Auto-refreshes if expired.
# Usage: TOKEN=$(get_token)
get_token() {
  local client_id="${1:-${GOOGLE_CLIENT_ID:-${GMAIL_CLIENT_ID:-}}}"
  local client_secret="${2:-${GOOGLE_CLIENT_SECRET:-${GMAIL_CLIENT_SECRET:-}}}"

  if [[ ! -f "$GSKILL_AUTH_FILE" ]]; then
    log_err "No auth.json found at $GSKILL_AUTH_FILE"
    log_err "Run the Google OAuth login flow first via the auth extension."
    return 1
  fi

  local access_token refresh_token expires_ms
  # Try modern key names first (access_token / refresh_token), fall back to legacy (access / refresh)
  access_token=$(_gskill_auth_get '."google-antigravity".access_token')
  if [[ "$access_token" == "null" || -z "$access_token" ]]; then
    access_token=$(_gskill_auth_get '."google-antigravity".access')
  fi
  refresh_token=$(_gskill_auth_get '."google-antigravity".refresh_token')
  if [[ "$refresh_token" == "null" || -z "$refresh_token" ]]; then
    refresh_token=$(_gskill_auth_get '."google-antigravity".refresh')
  fi
  expires_ms=$(_gskill_auth_get '."google-antigravity".expires')

  # Fallback to google-gemini-cli if google-antigravity is missing
  if [[ "$access_token" == "null" || -z "$access_token" ]]; then
    access_token=$(_gskill_auth_get '."google-gemini-cli".access_token')
    if [[ "$access_token" == "null" || -z "$access_token" ]]; then
      access_token=$(_gskill_auth_get '."google-gemini-cli".access')
    fi
    refresh_token=$(_gskill_auth_get '."google-gemini-cli".refresh_token')
    if [[ "$refresh_token" == "null" || -z "$refresh_token" ]]; then
      refresh_token=$(_gskill_auth_get '."google-gemini-cli".refresh')
    fi
    expires_ms=$(_gskill_auth_get '."google-gemini-cli".expires')
  fi

  if [[ "$access_token" == "null" || -z "$access_token" ]]; then
    log_err "No Google access token found in auth.json"
    return 1
  fi

  # Check if token is still valid (with 5-minute buffer)
  if [[ "$expires_ms" != "null" && -n "$expires_ms" && "$expires_ms" != "0" ]]; then
    local now_ms five_min_ms
    now_ms=$(date +%s)000
    five_min_ms=300000
    if (( expires_ms > now_ms + five_min_ms )); then
      log_debug "Token still valid (expires: $expires_ms)"
      echo "$access_token"
      return 0
    fi
    log_debug "Token expired or near expiry (expires: $expires_ms, now: $now_ms)"
  fi

  # Token expired — try refresh
  if [[ "$refresh_token" == "null" || -z "$refresh_token" ]]; then
    log_err "No refresh token available in auth.json"
    return 1
  fi

  if [[ -z "$client_id" || -z "$client_secret" ]]; then
    log_err "Cannot refresh token — GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set."
    log_err "  Set them as environment variables, or pass as arguments:"
    log_err "    get_token <CLIENT_ID> <CLIENT_SECRET>"
    return 1
  fi

  log_debug "Refreshing token..."
  local response
  response=$(curl -s -X POST "$GSKILL_OAUTH_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=refresh_token" \
    -d "refresh_token=${refresh_token}" \
    -d "client_id=${client_id}" \
    -d "client_secret=${client_secret}")

  if echo "$response" | jq -e 'has("error")' >/dev/null 2>&1; then
    log_err "Token refresh failed:"
    echo "$response" | jq -r '.error_description // .error' >&2
    return 1
  fi

  local new_access expires_in new_expires_ms
  new_access=$(echo "$response" | jq -r '.access_token')
  expires_in=$(echo "$response" | jq -r '.expires_in // 3600')
  new_expires_ms=$(( $(date +%s) + expires_in ))000

  _gskill_auth_save "$new_access" "$new_expires_ms"
  log_debug "Token refreshed successfully, new expiry: $new_expires_ms"
  echo "$new_access"
}

# Validate a token by making a simple API call
# Returns 0 if valid, 1 if invalid
validate_token() {
  local token="$1"
  local response
  response=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $token" \
    "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}")
  [[ "$response" == "200" ]]
}

# =============================================================================
# ERROR HANDLING
# =============================================================================

# Check if a JSON response contains an error
# Usage: check_error "$response" || return 1
check_error() {
  local response="$1"
  local context="${2:-API call}"
  if echo "$response" | jq -e 'has("error")' >/dev/null 2>&1; then
    local msg
    msg=$(echo "$response" | jq -r '.error.message // .error // "Unknown error"')
    log_err "$context failed: $msg"
    return 1
  fi
  return 0
}

# Check HTTP status code from curl
# Usage: check_http_status "$status" "$url" || return 1
check_http_status() {
  local status="$1"
  local url="${2:-}"
  if [[ "$status" -ge 400 ]]; then
    log_err "HTTP $status error for ${url:-request}"
    return 1
  fi
  return 0
}

# =============================================================================
# URL ENCODING
# =============================================================================

# URL-encode a string using jq
urlencode() {
  printf '%s' "$1" | jq -sRr '@uri'
}

# =============================================================================
# DATE HELPERS (macOS + Linux compatible)
# =============================================================================

# Get current date in ISO format (YYYY-MM-DD)
date_iso() {
  date +%Y-%m-%d
}

# Get current datetime in ISO format with timezone (YYYY-MM-DDTHH:MM:SS+ZZ:ZZ)
date_iso_full() {
  if date --version >/dev/null 2>&1; then
    # GNU date (Linux)
    date --iso-8601=seconds
  else
    # BSD date (macOS)
    date +%Y-%m-%dT%H:%M:%S%z
  fi
}

# Add days to a date (YYYY-MM-DD)
date_add_days() {
  local base_date="$1"
  local days="${2:-1}"
  if date --version >/dev/null 2>&1; then
    # GNU date
    date -d "${base_date} + ${days} days" +%Y-%m-%d
  else
    # BSD date
    date -v+"${days}"d -j -f "%Y-%m-%d" "$base_date" +%Y-%m-%d
  fi
}

# Add hours to current datetime, return ISO format
date_add_hours() {
  local hours="${1:-1}"
  if date --version >/dev/null 2>&1; then
    date -d "+${hours} hours" +%Y-%m-%dT%H:%M:%S%z
  else
    date -v+"${hours}"H +%Y-%m-%dT%H:%M:%S%z
  fi
}

# Get start of day in ISO format (YYYY-MM-DDTHH:MM:SSZ)
date_start_of_day() {
  local d="${1:-$(date_iso)}"
  echo "${d}T00:00:00Z"
}

# Get end of day in ISO format
date_end_of_day() {
  local d="${1:-$(date_iso)}"
  echo "${d}T23:59:59Z"
}

# =============================================================================
# PAGINATION
# =============================================================================

# Fetch all pages of a paginated API and merge results
# Usage: paginate "$base_url" "$items_key" "$token"
# Returns: merged JSON array
paginate() {
  local base_url="$1"
  local items_key="${2:-items}"
  local token="$3"
  local max_pages="${4:-10}"

  local all_items="[]"
  local url="$base_url"
  local page=0

  while [[ -n "$url" && $page -lt $max_pages ]]; do
    log_debug "Fetching page $page: ${url%%\?*}"
    local response
    response=$(curl -s -H "Authorization: Bearer $token" "$url")

    if ! check_error "$response" "Page $page"; then
      break
    fi

    local page_items
    page_items=$(echo "$response" | jq ".${items_key} // []")
    all_items=$(echo "$all_items" "$page_items" | jq -s 'add')

    local next_page_token
    next_page_token=$(echo "$response" | jq -r '.nextPageToken // empty')
    if [[ -n "$next_page_token" ]]; then
      # Append or replace pageToken in URL
      if [[ "$url" == *"pageToken="* ]]; then
        url=$(echo "$url" | sed "s/pageToken=[^&]*/pageToken=${next_page_token}/")
      else
        url="${url}&pageToken=${next_page_token}"
      fi
    else
      url=""
    fi

    page=$((page + 1))
  done

  echo "$all_items"
}

# =============================================================================
# OUTPUT FORMATTING
# =============================================================================

# Format a JSON array as a pretty table (using jq)
# Keys are auto-detected from the first object, or passed as space-separated string
format_table() {
  local json="$1"
  local keys="${2:-}"

  # Auto-detect keys if not provided
  if [[ -z "$keys" ]]; then
    keys=$(echo "$json" | jq -r '
      if type == "array" and length > 0 then (keys[0] | keys_unsorted | join(" "))
      elif type == "object" then (keys_unsorted | join(" "))
      else "" end
    ')
  fi

  if [[ -z "$keys" ]]; then
    echo "(no data)"
    return 0
  fi

  # Convert space-separated to array for jq
  local keys_json
  keys_json=$(echo "$keys" | tr ' ' '\n' | jq -R . | jq -s .)

  # Print header
  echo "$keys" | tr ' ' '\t'
  # Print separator
  echo "$keys" | sed 's/[^ ]*/--------/g' | tr ' ' '\t'

  # Print rows
  echo "$json" | jq -r --argjson keys "$keys_json" '
    if type == "array" then
      .[] | [ $keys[] as $k | (.[$k] // "") | tostring ] | @tsv
    else
      [ $keys[] as $k | (.[$k] // "") | tostring ] | @tsv
    end
  '
}

# Format as CSV
format_csv() {
  local json="$1"
  echo "$json" | jq -r '
    (if length > 0 then (.[0] | keys_unsorted) else [] end) as $keys |
    ($keys | @csv),
    (.[] | [ $keys[] as $k | (.[$k] // "") | tostring ] | @csv)
  '
}

# Format as TSV
format_tsv() {
  local json="$1"
  echo "$json" | jq -r '
    (if length > 0 then (.[0] | keys_unsorted) else [] end) as $keys |
    ($keys | @tsv),
    (.[] | [ $keys[] as $k | (.[$k] // "") | tostring ] | @tsv)
  '
}

# Format as Markdown table (handles arrays and single objects)
format_markdown() {
  local json="$1"
  local keys="${2:-}"

  # Auto-detect keys if not provided
  if [[ -z "$keys" ]]; then
    keys=$(echo "$json" | jq -r '
      if type == "array" and length > 0 then (keys[0] | keys_unsorted | join(" "))
      elif type == "object" then (keys_unsorted | join(" "))
      else "" end
    ')
  fi

  if [[ -z "$keys" ]]; then
    echo "*(no data)*"
    return 0
  fi

  # Convert to jq array
  local keys_json
  keys_json=$(echo "$keys" | tr ' ' '\n' | jq -R . | jq -s .)

  # Header
  echo "| $(echo "$keys" | sed 's/ / | /g') |"
  # Separator
  echo "| $(echo "$keys" | sed 's/[^ ]*/---/g' | sed 's/ / | /g') |"
  # Rows
  echo "$json" | jq -r --argjson keys "$keys_json" '
    if type == "array" then
      .[] | "| " + ([ $keys[] as $k | (.[$k] // "") | tostring ] | join(" | ")) + " |"
    else
      "| " + ([ $keys[] as $k | (.[$k] // "") | tostring ] | join(" | ")) + " |"
    end
  '
}

# Format as compact one-line per item (handles arrays and single objects)
format_compact() {
  local json="$1"
  echo "$json" | jq -r '
    if type == "array" then
      .[] | to_entries | map("\(.key)=\(.value)") | join(" | ")
    else
      to_entries | map("\(.key)=\(.value)") | join(" | ")
    end
  '
}

# Generic format dispatcher
# Usage: format_output "$json" "$format" "$keys"
format_output() {
  local json="$1"
  local fmt="${2:-$GSKILL_FORMAT}"
  local keys="${3:-}"

  case "$fmt" in
    json)     echo "$json" | jq '.' ;;
    compact)  format_compact "$json" ;;
    table)    format_table "$json" "$keys" ;;
    csv)      format_csv "$json" ;;
    tsv)      format_tsv "$json" ;;
    markdown|md) format_markdown "$json" "$keys" ;;
    *)        echo "$json" | jq '.' ;;
  esac
}

# =============================================================================
# API RESPONSE HELPERS
# =============================================================================

# Extract a field from JSON response
extract_field() {
  local json="$1"
  local field="$2"
  echo "$json" | jq -r ".$field // empty"
}

# Count results in an array response
count_results() {
  local json="$1"
  local key="${2:-}"
  if [[ -n "$key" ]]; then
    echo "$json" | jq -r ".${key} | length // 0"
  else
    echo "$json" | jq -r 'length // 0'
  fi
}

# Get a single value from a JSON object
jq_get() {
  local json="$1"
  local jq_expr="$2"
  echo "$json" | jq -r "$jq_expr"
}

# =============================================================================
# HTTP REQUESTS WITH RETRY
# =============================================================================

# Make a GET request with retry logic
# Usage: http_get "$url" "$token" [max_retries]
http_get() {
  local url="$1"
  local token="$2"
  local max_retries="${3:-$GSKILL_MAX_RETRIES}"
  local attempt=1

  while true; do
    local response status
    status=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $token" "$url")

    if [[ "$status" == "200" ]]; then
      curl -s -H "Authorization: Bearer $token" "$url"
      return 0
    fi

    if [[ "$status" == "429" || "$status" == "500" || "$status" == "502" || "$status" == "503" ]]; then
      if [[ $attempt -lt $max_retries ]]; then
        log_warn "HTTP $status, retrying in ${GSKILL_RETRY_DELAY}s (attempt $attempt/$max_retries)..."
        sleep "$GSKILL_RETRY_DELAY"
        attempt=$((attempt + 1))
        continue
      fi
    fi

    log_err "HTTP $status for $url"
    return 1
  done
}

# Make a POST request with retry logic
http_post() {
  local url="$1"
  local token="$2"
  local data="$3"
  local max_retries="${4:-$GSKILL_MAX_RETRIES}"
  local attempt=1

  while true; do
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$url")

    if [[ "$status" == "200" ]]; then
      curl -s -X POST -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$data" "$url"
      return 0
    fi

    if [[ "$status" == "429" || "$status" == "500" || "$status" == "502" || "$status" == "503" ]]; then
      if [[ $attempt -lt $max_retries ]]; then
        log_warn "HTTP $status, retrying in ${GSKILL_RETRY_DELAY}s (attempt $attempt/$max_retries)..."
        sleep "$GSKILL_RETRY_DELAY"
        attempt=$((attempt + 1))
        continue
      fi
    fi

    log_err "HTTP $status for $url"
    return 1
  done
}

# =============================================================================
# MIME TYPE HELPERS
# =============================================================================

# Human-readable mime type name
mime_to_name() {
  local mime="$1"
  case "$mime" in
    application/vnd.google-apps.document)   echo "Google Doc" ;;
    application/vnd.google-apps.spreadsheet) echo "Google Sheet" ;;
    application/vnd.google-apps.presentation) echo "Google Slides" ;;
    application/vnd.google-apps.folder)     echo "Folder" ;;
    application/vnd.google-apps.form)       echo "Google Form" ;;
    application/vnd.google-apps.drawing)    echo "Google Drawing" ;;
    application/vnd.google-apps.script)     echo "Apps Script" ;;
    application/vnd.google-apps.site)     echo "Site" ;;
    application/pdf)                        echo "PDF" ;;
    text/*)                                 echo "Text" ;;
    image/*)                                echo "Image" ;;
    video/*)                                echo "Video" ;;
    audio/*)                                echo "Audio" ;;
    application/zip|application/x-zip*)     echo "ZIP" ;;
    *)                                      echo "$mime" ;;
  esac
}

# =============================================================================
# SIZE FORMATTING
# =============================================================================

# Format bytes to human-readable
format_size() {
  local bytes="$1"
  if [[ "$bytes" == "null" || -z "$bytes" || "$bytes" == "N/A" ]]; then
    echo "N/A"
    return
  fi

  local units=(B KB MB GB TB)
  local unit_idx=0
  local size="$bytes"

  while (( $(echo "$size >= 1024" | bc -l 2>/dev/null || echo "0") )) && (( unit_idx < 4 )); do
    size=$(echo "scale=2; $size / 1024" | bc)
    unit_idx=$((unit_idx + 1))
  done

  # If bc is not available, use simple division
  if ! command -v bc >/dev/null 2>&1; then
    if (( bytes >= 1099511627776 )); then echo "$(( bytes / 1099511627776 )) TB"; return; fi
    if (( bytes >= 1073741824 )); then echo "$(( bytes / 1073741824 )) GB"; return; fi
    if (( bytes >= 1048576 )); then echo "$(( bytes / 1048576 )) MB"; return; fi
    if (( bytes >= 1024 )); then echo "$(( bytes / 1024 )) KB"; return; fi
    echo "${bytes} B"
    return
  fi

  printf "%.1f %s\n" "$size" "${units[$unit_idx]}"
}

# =============================================================================
# EMAIL PARSING
# =============================================================================

# Parse an email "From" header into name and email
# Input: "John Doe <john@example.com>" or "john@example.com"
# Output: space-separated: "John Doe" "john@example.com"
parse_email_from() {
  local from="$1"
  if [[ "$from" == *"<"*""* ]]; then
    local name email
    name=$(echo "$from" | sed 's/ <.*//; s/^"//; s/"$//')
    email=$(echo "$from" | sed 's/.*<//; s/>.*//')
    echo "$name" "$email"
  else
    echo "" "$from"
  fi
}

# Extract email from "From" header (just the address)
extract_email() {
  local from="$1"
  if [[ "$from" == *"<"*""* ]]; then
    echo "$from" | sed 's/.*<//; s/>.*//'
  else
    echo "$from"
  fi
}

# Extract name from "From" header
extract_name() {
  local from="$1"
  if [[ "$from" == *"<"*""* ]]; then
    echo "$from" | sed 's/ <.*//; s/^"//; s/"$//'
  else
    echo ""
  fi
}

# =============================================================================
# VERBOSE / DEBUG
# =============================================================================

# Enable verbose mode from command line
enable_verbose() {
  GSKILL_VERBOSE=1
  export GSKILL_VERBOSE
}

# Enable very verbose mode
enable_debug() {
  GSKILL_VERBOSE=2
  export GSKILL_VERBOSE
}

# Print script info
show_info() {
  local script_name="$1"
  log "=== $script_name ==="
  log "Auth file:  $GSKILL_AUTH_FILE"
  log "Config file: $GSKILL_CONFIG_FILE"
  log "Format:     $GSKILL_FORMAT"
  log "Verbose:    $GSKILL_VERBOSE"
}

# =============================================================================
# Auto-load config if sourced
# =============================================================================
load_config
