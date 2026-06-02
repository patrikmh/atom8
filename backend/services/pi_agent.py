"""Thin backward-compatible shim around services.pi_runner.

All real logic has moved to ``PiRunner`` in ``services.pi_runner``.
This module re-exports the public API so existing imports stay valid.
"""

from services.pi_runner import (
    PiRunner,
    run_pi_agent,
    parse_pi_output,
    extract_json,
)

__all__ = ["PiRunner", "run_pi_agent", "parse_pi_output", "extract_json"]
