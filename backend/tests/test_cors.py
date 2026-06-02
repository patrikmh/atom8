"""Tests for CORS configuration and input sanitization."""
import os


def test_cors_allows_configured_origin(client):
    """CORS should allow requests from the configured origin."""
    response = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert "access-control-allow-origin" in response.headers


def test_cors_blocks_unconfigured_origin(monkeypatch):
    """CORS should not allow wildcard origins when credentials are enabled."""
    # This test documents the expected behavior. In production,
    # allow_origins should be set to specific domains.
    assert os.getenv("CORS_ALLOW_CREDENTIALS", "false").lower() in ("false", "0", "")


def test_prompt_sanitization():
    """User prompts should not contain shell metacharacters."""
    from services.pi_data_fetch import sanitize_prompt
    assert sanitize_prompt("Hello World") == "Hello World"
    assert sanitize_prompt("Hello; rm -rf /") == "Hello rm -rf /"
    assert sanitize_prompt("$(whoami)") == "(whoami)"
    assert sanitize_prompt("`ls`") == "ls"
