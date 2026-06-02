"""Tests for the unified PiRunner service."""
import pytest
from services.pi_runner import PiRunner, run_pi_agent, send_to_pi, parse_pi_output, extract_json


def test_pirunner_init_defaults():
    """PiRunner should initialize with sensible defaults."""
    runner = PiRunner()
    assert runner.provider is not None
    assert runner.model is not None
    assert runner.tools == "read,grep,find,bash"
    assert runner.thinking == "low"
    assert runner.timeout == 120


def test_pirunner_init_custom():
    """PiRunner should accept custom parameters."""
    runner = PiRunner(
        system_prompt="Custom prompt",
        skills=["/tmp/skill.md"],
        tools="bash",
        timeout=30,
        thinking="medium",
    )
    assert runner.system_prompt == "Custom prompt"
    assert runner.skills == ["/tmp/skill.md"]
    assert runner.tools == "bash"
    assert runner.timeout == 30
    assert runner.thinking == "medium"


def test_pirunner_build_command():
    """_build_command should produce a valid pi CLI command list."""
    runner = PiRunner(system_prompt="Test", skills=["/tmp/skill.md"])
    cmd = runner._build_command("do something")
    assert "pi" in cmd
    assert "--print" in cmd
    assert "--no-session" in cmd
    assert "--provider" in cmd
    assert "--model" in cmd
    assert "--tools" in cmd
    assert "--skill" in cmd
    assert "/tmp/skill.md" in cmd
    assert "Test" in cmd[-1]
    assert "do something" in cmd[-1]


def test_pirunner_build_command_no_skills():
    """_build_command should not include --skill when skills is explicitly empty."""
    runner = PiRunner(system_prompt="Test", skills=[])
    cmd = runner._build_command("do something")
    assert "--skill" not in cmd


def test_extract_json_with_fences():
    """extract_json should parse JSON inside markdown fences."""
    text = "Some text\n```json\n{\"a\": 1}\n```\nMore text"
    result = extract_json(text)
    assert result == {"a": 1}


def test_extract_json_without_fences():
    """extract_json should parse raw JSON object."""
    text = 'Some text {"a": 1} more text'
    result = extract_json(text)
    assert result == {"a": 1}


def test_extract_json_array():
    """extract_json should parse raw JSON arrays."""
    text = "Some text [1, 2, 3] more text"
    result = extract_json(text)
    assert result == [1, 2, 3]


def test_extract_json_invalid():
    """extract_json should return None for invalid JSON."""
    text = "No JSON here"
    result = extract_json(text)
    assert result is None


def test_parse_pi_output_dict():
    """parse_pi_output should return dict when JSON is a dict."""
    assert parse_pi_output('{"a": 1}') == {"a": 1}


def test_parse_pi_output_list():
    """parse_pi_output should wrap list in a data key."""
    assert parse_pi_output("[1, 2, 3]") == {"data": [1, 2, 3]}


def test_parse_pi_output_plain_text():
    """parse_pi_output should wrap plain text with content and error."""
    result = parse_pi_output("Hello world")
    assert result["content"] == "Hello world"
    assert "error" in result


def test_run_pi_agent_is_callable():
    """run_pi_agent should be a callable async function."""
    import inspect
    assert callable(run_pi_agent)
    assert inspect.iscoroutinefunction(run_pi_agent)


def test_send_to_pi_is_callable():
    """send_to_pi should be a callable async function."""
    import inspect
    assert callable(send_to_pi)
    assert inspect.iscoroutinefunction(send_to_pi)
