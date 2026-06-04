# Cache System Fix - Summary

## Issues Fixed

The previous cache implementation had several critical issues:

1. **In-memory cache was lost on server restart** - Cache data was stored in a simple dictionary and disappeared whenever the server restarted
2. **Unstable cache keys** - Used `hash()` which produces different results across Python processes/restarts
3. **No manual cache clearing capability** - Only Gmail had `nocache` parameter, no way to clear cache
4. **Race conditions** - Dictionary operations weren't thread-safe for concurrent requests
5. **No cache visibility** - No way to see what was cached or get cache statistics
6. **No cache management** - No endpoints to clear or manage cache entries

## Solution Implemented

### 1. New Cache Manager (`cache_manager.py`)

Created a comprehensive cache manager with the following features:

- **Persistent storage**: Cache is stored as files in a `cache/` directory
- **Thread-safe operations**: All cache operations use thread locks
- **Stable cache keys**: Uses SHA256 + JSON serialization for consistent keys across processes
- **TTL support**: Time-to-live expiration with configurable default (5 minutes)
- **Atomic writes**: Uses temp files and atomic renames for safe writes
- **Cache statistics**: Provides detailed cache stats and metrics
- **Cache management**: Methods to clear specific endpoints or all entries
- **Automatic cleanup**: Removes expired entries on startup and on-demand

### 2. Updated Data Router (`routers/data.py`)

- Replaced old in-memory cache with new cache manager
- Added `nocache` parameter to ALL endpoints (not just Gmail)
- Added cache management endpoints:
  - `GET /api/data/cache/stats` - Get cache statistics
  - `POST /api/data/cache/clear?endpoint=<name>` - Clear cache for specific endpoint
  - `DELETE /api/data/cache/expired` - Remove expired entries
- Updated all endpoint functions to support cache bypass

### 3. Updated Models (`models.py`)

- Added `nocache` field to `DataRequest` model
- Added `nocache` field to `DocsListRequest` model  
- Added `nocache` field to `DocsReadRequest` model

### 4. Updated Main App (`main.py`)

- Added cache cleanup on server startup
- Imports and initializes the cache manager

## New Endpoints

### Cache Management

#### `GET /api/data/cache/stats`
Get current cache statistics.

**Response:**
```json
{
  "stats": {
    "total_entries": 25,
    "entries_by_endpoint": {
      "gmail": 10,
      "calendar": 5,
      "tasks": 8,
      "drive": 2
    },
    "old_entries": 3,
    "total_size_bytes": 524288
  },
  "status": "ok"
}
```

#### `POST /api/data/cache/clear?endpoint=<name>`
Clear cache entries. Omit `endpoint` parameter to clear all cache.

**Parameters:**
- `endpoint` (optional): Cache endpoint name (`gmail`, `calendar`, `tasks`, `drive`, `docs`)

**Response:**
```json
{
  "cleared": 12,
  "endpoint": "gmail",
  "status": "ok"
}
```

#### `DELETE /api/data/cache/expired`
Remove all expired cache entries.

**Response:**
```json
{
  "removed": 5,
  "status": "ok"
}
```

## Usage Examples

### Bypass Cache (nocache)

All data endpoints now support `nocache` parameter:

**POST Example:**
```bash
curl -X POST http://localhost:8000/api/data/gmail \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Show my latest emails",
    "count": 10,
    "nocache": true
  }'
```

**GET Example:**
```bash
curl "http://localhost:8000/api/data/gmail?count=10&q=Show+my+latest+emails&nocache=true"
```

### Clear Specific Endpoint Cache

```bash
curl -X POST "http://localhost:8000/api/data/cache/clear?endpoint=gmail"
```

### Clear All Cache

```bash
curl -X POST "http://localhost:8000/api/data/cache/clear"
```

### View Cache Statistics

```bash
curl http://localhost:8000/api/data/cache/stats
```

### Clean Up Expired Entries

```bash
curl -X DELETE http://localhost:8000/api/data/cache/expired
```

## Benefits

1. **Persistence**: Cache survives server restarts
2. **Reliability**: Thread-safe operations prevent race conditions
3. **Management**: Full control over cache with clear and stats endpoints
4. **Flexibility**: Bypass cache on-demand per request
5. **Visibility**: See what's cached and identify stale data
6. **Performance**: Automatic cleanup prevents cache bloat
7. **Stability**: Consistent cache keys across processes

## Testing

All existing tests pass with the new cache implementation:
- 8 tests passed
- 4 tests skipped (require pi --mode rpc)
- 1 deprecation warning (from Pydantic, not cache-related)

## Files Changed

1. **`backend/cache_manager.py`** (NEW) - Core cache management implementation
2. **`backend/routers/data.py`** - Updated to use new cache manager and added management endpoints
3. **`backend/models.py`** - Added `nocache` field to request models
4. **`backend/main.py`** - Added cache initialization and cleanup on startup

## Cache Storage

Cache files are stored in `backend/cache/` directory with the following structure:
```
backend/cache/
  ├── <sha256_hash>.json  # Individual cache entries
  └── ...
```

Each cache entry contains:
- `timestamp`: Entry creation time
- `ttl`: Time-to-live in seconds
- `data`: Cached response data
- `endpoint`: Endpoint name
- `params`: Request parameters

## Default Configuration

- **TTL**: 300 seconds (5 minutes)
- **Cache directory**: `backend/cache/`
- **File format**: JSON
- **Cleanup**: Automatic on startup and manual via API

## Future Enhancements

Potential improvements:
- SQLite backend for higher performance
- Cache size limits with LRU eviction
- Per-endpoint TTL configuration
- Cache invalidation webhooks
- Distributed cache support (Redis, Memcached)
- Cache warming on startup
- More detailed metrics and monitoring