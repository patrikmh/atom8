"""API contract tests for the headless pi backend."""
import pytest
from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


# ─── Health ───────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health(self):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        assert r.json()["version"] == "3.0.0"

    def test_root(self):
        r = client.get("/")
        assert r.status_code == 200
        assert "Living Canvas API v3.0" in r.json()["message"]


# ─── Auth ─────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_auth_status(self):
        r = client.get("/api/auth/status")
        assert r.status_code == 200
        assert "authenticated" in r.json()

    def test_auth_url(self):
        r = client.get("/api/auth/url")
        assert r.status_code == 200
        assert "url" in r.json()
        assert "accounts.google.com" in r.json()["url"]

    def test_logout(self):
        r = client.post("/api/auth/logout")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ─── Dashboard ────────────────────────────────────────────────────────────────

class TestDashboard:
    def test_get_layout(self):
        r = client.get("/api/dashboard/layout")
        assert r.status_code == 200
        assert "widgets" in r.json()

    def test_save_layout(self):
        layout = {"version": "1.0", "widgets": []}
        r = client.post("/api/dashboard/layout", json={"layout": layout})
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_get_widgets(self):
        r = client.get("/api/dashboard/widgets")
        assert r.status_code == 200
        assert "widgets" in r.json()


# ─── Data (mocked — requires real pi process) ─────────────────────────────────

class TestData:
    @pytest.mark.skip(reason="Requires pi --mode rpc process")
    def test_gmail(self):
        r = client.post("/api/data/gmail", json={"prompt": "test", "count": 5})
        assert r.status_code == 200

    @pytest.mark.skip(reason="Requires pi --mode rpc process")
    def test_calendar(self):
        r = client.post("/api/data/calendar", json={"prompt": "test", "count": 5})
        assert r.status_code == 200


# ─── AI (mocked — requires real pi process) ───────────────────────────────────

class TestAI:
    @pytest.mark.skip(reason="Requires pi --mode rpc process")
    def test_chat(self):
        r = client.post("/api/ai/chat", json={"message": "hello"})
        assert r.status_code == 200

    @pytest.mark.skip(reason="Requires pi --mode rpc process")
    def test_research(self):
        r = client.post("/api/ai/research", json={"topic": "test"})
        assert r.status_code == 200
