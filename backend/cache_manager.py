"""Thread-safe cache manager with persistent storage TTL support."""
import json
import os
import time
import fcntl
import hashlib
from pathlib import Path
from typing import Any, Optional
from threading import Lock


class CacheManager:
    """Thread-safe cache manager with file-based persistence and TTL."""

    def __init__(self, cache_dir: str = "cache", ttl: int = 300):
        """Initialize cache manager.

        Args:
            cache_dir: Directory to store cache files
            ttl: Default time-to-live in seconds
        """
        self.cache_dir = Path(cache_dir)
        self.ttl = ttl
        self._lock = Lock()
        self.cache_dir.mkdir(exist_ok=True)

    def _get_cache_file(self, key: str) -> Path:
        """Get cache file path for a given key."""
        # Use SHA256 hash for safe filenames
        safe_key = hashlib.sha256(key.encode()).hexdigest()
        return self.cache_dir / f"{safe_key}.json"

    def _make_key(self, endpoint: str, params: dict) -> str:
        """Create a stable cache key from endpoint and params.

        Uses JSON serialization with sorted keys for stability across processes.
        """
        return f"{endpoint}:{json.dumps(params, sort_keys=True)}"

    def get(self, endpoint: str, params: dict) -> Optional[dict]:
        """Get cached data if valid.

        Args:
            endpoint: Cache endpoint name
            params: Parameters that form the cache key

        Returns:
            Cached data dict or None if not found/expired
        """
        key = self._make_key(endpoint, params)
        cache_file = self._get_cache_file(key)

        with self._lock:
            if not cache_file.exists():
                return None

            try:
                with open(cache_file, 'r') as f:
                    cached = json.load(f)

                # Check TTL
                if time.time() - cached['timestamp'] > cached.get('ttl', self.ttl):
                    cache_file.unlink(missing_ok=True)
                    return None

                return cached.get('data')
            except (json.JSONDecodeError, KeyError, OSError):
                # Corrupted cache file, delete it
                cache_file.unlink(missing_ok=True)
                return None

    def set(self, endpoint: str, params: dict, data: Any, ttl: Optional[int] = None) -> None:
        """Store data in cache.

        Args:
            endpoint: Cache endpoint name
            params: Parameters that form the cache key
            data: Data to cache
            ttl: Custom TTL (uses default if None)
        """
        key = self._make_key(endpoint, params)
        cache_file = self._get_cache_file(key)

        with self._lock:
            cache_entry = {
                'timestamp': time.time(),
                'ttl': ttl or self.ttl,
                'data': data,
                'endpoint': endpoint,
                'params': params,
            }

            # Write to temp file first, then atomic rename
            temp_file = cache_file.with_suffix('.tmp')
            with open(temp_file, 'w') as f:
                json.dump(cache_entry, f)
                f.flush()
                # Ensure data is on disk
                os.fsync(f.fileno())

            # Atomic rename
            temp_file.replace(cache_file)

    def delete(self, endpoint: str, params: dict) -> bool:
        """Delete specific cache entry.

        Args:
            endpoint: Cache endpoint name
            params: Parameters that form the cache key

        Returns:
            True if deleted, False if not found
        """
        key = self._make_key(endpoint, params)
        cache_file = self._get_cache_file(key)

        with self._lock:
            if cache_file.exists():
                cache_file.unlink()
                return True
            return False

    def clear(self, endpoint: Optional[str] = None) -> int:
        """Clear cache entries.

        Args:
            endpoint: Clear only entries for this endpoint (None = clear all)

        Returns:
            Number of cache files deleted
        """
        with self._lock:
            if endpoint:
                count = 0
                for cache_file in self.cache_dir.glob("*.json"):
                    try:
                        with open(cache_file, 'r') as f:
                            cached = json.load(f)
                        if cached.get('endpoint') == endpoint:
                            cache_file.unlink()
                            count += 1
                    except (json.JSONDecodeError, OSError):
                        # Corrupted file, delete it
                        cache_file.unlink(missing_ok=True)
                        count += 1
                return count
            else:
                # Delete all cache files
                count = sum(1 for _ in self.cache_dir.glob("*.json"))
                for cache_file in self.cache_dir.glob("*.json"):
                    cache_file.unlink(missing_ok=True)
                return count

    def stats(self) -> dict:
        """Get cache statistics.

        Returns:
            Dictionary with cache stats
        """
        with self._lock:
            stats = {
                'total_entries': 0,
                'entries_by_endpoint': {},
                'old_entries': 0,
                'total_size_bytes': 0,
            }

            for cache_file in self.cache_dir.glob("*.json"):
                try:
                    with open(cache_file, 'r') as f:
                        cached = json.load(f)

                    stats['total_entries'] += 1
                    stats['total_size_bytes'] += cache_file.stat().st_size

                    endpoint = cached.get('endpoint', 'unknown')
                    stats['entries_by_endpoint'][endpoint] = \
                        stats['entries_by_endpoint'].get(endpoint, 0) + 1

                    # Check if expired
                    if time.time() - cached['timestamp'] > cached.get('ttl', self.ttl):
                        stats['old_entries'] += 1

                except (json.JSONDecodeError, OSError):
                    # Corrupted file, count as old (will be cleaned)
                    stats['total_entries'] += 1
                    stats['old_entries'] += 1

            return stats

    def cleanup_expired(self) -> int:
        """Remove expired cache entries.

        Returns:
            Number of entries removed
        """
        with self._lock:
            removed = 0
            for cache_file in self.cache_dir.glob("*.json"):
                try:
                    with open(cache_file, 'r') as f:
                        cached = json.load(f)

                    if time.time() - cached['timestamp'] > cached.get('ttl', self.ttl):
                        cache_file.unlink()
                        removed += 1
                except (json.JSONDecodeError, OSError):
                    # Corrupted file, delete it
                    cache_file.unlink(missing_ok=True)
                    removed += 1

            return removed


# Global cache instance
cache = CacheManager(cache_dir="cache", ttl=300)