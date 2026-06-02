"""Tests confirming orphaned code files are removed and backend still starts."""
import os


def test_ai_research_file_removed():
    """services/ai_research.py should not exist."""
    path = os.path.join(os.path.dirname(__file__), "..", "services", "ai_research.py")
    assert not os.path.exists(path), "ai_research.py should have been removed"


def test_no_mock_responses_in_ai_router():
    """ai.py should not contain MOCK_RESPONSES or unused helper functions."""
    path = os.path.join(os.path.dirname(__file__), "..", "routers", "ai.py")
    with open(path, "r") as f:
        content = f.read()
    assert "MOCK_RESPONSES" not in content, "ai.py should not contain MOCK_RESPONSES"
    assert "analyze_intent" not in content, "ai.py should not contain analyze_intent"
    assert "generate_a2ui_component" not in content, "ai.py should not contain generate_a2ui_component"


def test_backend_imports_after_cleanup():
    """The main app should still import successfully after code removal."""
    import main
    assert main.app is not None
