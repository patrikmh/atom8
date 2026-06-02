"""Tests for the main FastAPI application and health endpoint."""


def test_health_check(client):
    """GET /health should return status: ok."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
