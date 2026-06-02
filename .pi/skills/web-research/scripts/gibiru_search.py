#!/usr/bin/env python3
"""Search Gibiru and return structured results.

Usage: gibiru_search.py <query> [max_results]
"""

import json
import subprocess
import sys
import tempfile
import os


def run_playwright(query: str, max_results: int = 10) -> list:
    """Run playwright-cli to search Gibiru and extract results."""
    # Create a session
    subprocess.run(["playwright-cli", "open", "-s", "lc-search", "--headless", "https://gibiru.com/results.html?q=" + query.replace(" ", "+")], capture_output=True)
    # Wait for results
    subprocess.run(["playwright-cli", "eval", "-s", "lc-search", "() => { document.title; }"], capture_output=True)
    # Extract results
    script = """
    () => {
        var results = [];
        var links = document.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
            var a = links[i];
            var href = a.getAttribute('href');
            if (href && href.indexOf('http') === 0 && href.indexOf('gibiru.com') === -1) {
                results.push({
                    title: (a.textContent || '').trim(),
                    url: href,
                    snippet: (a.parentElement && a.parentElement.textContent || '').trim().substring(0, 200)
                });
            }
        }
        return results.slice(0, " + str(max_results) + "");
    }
    """
    result = subprocess.run(["playwright-cli", "eval", "-s", "lc-search", script], capture_output=True, text=True)
    # Close session
    subprocess.run(["playwright-cli", "close", "-s", "lc-search"], capture_output=True)
    
    # Parse output
    output = result.stdout
    marker = "### Result"
    idx = output.find(marker)
    if idx >= 0:
        json_str = output[idx + len(marker):].strip()
        try:
            return json.loads(json_str)
        except:
            pass
    return []


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    max_results = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    results = run_playwright(query, max_results)
    print(json.dumps({"results": results}, indent=2))


if __name__ == "__main__":
    main()
