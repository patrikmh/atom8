import subprocess
import json
import os
import time
from typing import Optional, Dict, Any

PI_CLI_PATH = os.getenv("PI_CLI_PATH", "pi")
PROJECT_DIR = os.getenv("PI_PROJECT_DIR", "/Users/patrikandersson/telegram/atom8")


def spawn_pi_and_run(command: str, timeout: int = 60) -> Dict[str, Any]:
    """Spawn a headless pi process and execute a tool command."""
    
    script = f"""
const {{ spawn }} = require('child_process');
const path = require('path');

const pi = spawn('{PI_CLI_PATH}', ['non-interactive'], {{
  cwd: '{PROJECT_DIR}',
  env: {{ ...process.env, PI_HEADLESS: '1' }},
  stdio: ['pipe', 'pipe', 'pipe']
}});

let output = '';
let error = '';

pi.stdout.on('data', (data) => {{
  output += data.toString();
}});

pi.stderr.on('data', (data) => {{
  error += data.toString();
}});

pi.on('close', (code) => {{
  console.log(JSON.stringify({{
    exit_code: code,
    stdout: output,
    stderr: error
  }}));
}});

// Send commands to pi
pi.stdin.write(`{command}\\n`);
pi.stdin.write('exit\\n');
pi.stdin.end();
"""
    
    # Write temporary script
    script_path = f"/tmp/pi_bridge_{int(time.time() * 1000)}.js"
    with open(script_path, "w") as f:
        f.write(script)
    
    try:
        result = subprocess.run(
            ["node", script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        
        # Parse the last line as JSON
        lines = result.stdout.strip().split("\n")
        for line in reversed(lines):
            line = line.strip()
            if line:
                try:
                    parsed = json.loads(line)
                    if "exit_code" in parsed:
                        return parsed
                except json.JSONDecodeError:
                    continue
        
        # Fallback: return raw output
        return {
            "exit_code": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except subprocess.TimeoutExpired:
        return {"error": "Timeout", "exit_code": -1}
    except Exception as e:
        return {"error": str(e), "exit_code": -1}
    finally:
        try:
            os.remove(script_path)
        except:
            pass


def parse_gmail_output(stdout: str) -> Dict[str, Any]:
    """Parse pi gmail output into structured JSON."""
    emails = []
    lines = stdout.strip().split("\n")
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith("-") or line.startswith("|"):
            continue
        
        # Try to parse email lines
        if "From:" in line and "Subject:" in line:
            parts = line.split("Subject:")
            if len(parts) == 2:
                from_part = parts[0].replace("From:", "").strip()
                subject = parts[1].strip()
                emails.append({
                    "id": f"email_{len(emails)}",
                    "from_name": from_part,
                    "from_email": "",
                    "subject": subject,
                    "preview": "",
                    "date": "",
                    "is_read": True,
                })
    
    return {"emails": emails}


def parse_calendar_output(stdout: str) -> Dict[str, Any]:
    """Parse pi calendar output into structured JSON."""
    events = []
    lines = stdout.strip().split("\n")
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith("-"):
            continue
        
        if ":" in line:
            parts = line.split("-", 1)
            if len(parts) == 2:
                time_part = parts[0].strip()
                title = parts[1].strip()
                events.append({
                    "id": f"event_{len(events)}",
                    "title": title,
                    "start": time_part,
                    "end": "",
                    "location": "",
                    "color": "#4285f4",
                })
    
    return {"events": events, "date": ""}


def parse_tasks_output(stdout: str) -> Dict[str, Any]:
    """Parse pi tasks output into structured JSON."""
    tasks = []
    lines = stdout.strip().split("\n")
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith("-"):
            continue
        
        completed = line.startswith("[x]") or line.startswith("✓")
        title = line.lstrip("[x] ").lstrip("[ ] ").lstrip("✓ ").lstrip("☐ ").strip()
        
        if title:
            tasks.append({
                "id": f"task_{len(tasks)}",
                "title": title,
                "completed": completed,
                "priority": "medium",
                "due_date": None,
            })
    
    return {"tasks": tasks}


def parse_drive_output(stdout: str) -> Dict[str, Any]:
    """Parse pi drive output into structured JSON."""
    files = []
    lines = stdout.strip().split("\n")
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith("-"):
            continue
        
        parts = line.split("(")
        if len(parts) >= 2:
            name = parts[0].strip()
            mime_type = parts[1].rstrip(")") if parts[1].endswith(")") else "file"
            files.append({
                "id": f"file_{len(files)}",
                "name": name,
                "mime_type": mime_type,
                "size": None,
                "modified": "",
            })
        else:
            files.append({
                "id": f"file_{len(files)}",
                "name": line,
                "mime_type": "file",
                "size": None,
                "modified": "",
            })
    
    return {"files": files}
