#!/usr/bin/env python3
"""Append each prompt and final response to .agent-logs/<start>_<session>.md.

Wired to SessionStart, UserPromptSubmit and Stop in .claude/settings.json.
Reads the hook payload from stdin. Exits 1 (non-blocking, visible) on failure
so a broken hook never stops a prompt but is never silent either.
"""
import fcntl
import json
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

AUTHOR = "abdelmalek-maskri"
TOOL = "claude-code"

HEADER_RE = re.compile(r"\A---\n.*?\n---\n\n", re.S)
ENTRY_RE = re.compile(r"^\[LOG_ENTRY type=(PROMPT|RESPONSE) num=(\d+) ", re.M)
PROMPT_TIME_RE = re.compile(r"^\[LOG_ENTRY type=PROMPT [^\n]*\ntimestamp: (\S+)", re.M)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def model_cache(session_id):
    # Outside the repo so the cache never gets committed alongside the logs.
    d = Path(tempfile.gettempdir()) / "agent-capture"
    d.mkdir(exist_ok=True)
    return d / f"{session_id}.model"


def read_transcript(path):
    rows = []
    if not path or not os.path.exists(path):
        return rows
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                # The transcript is written while we read it; a half-written last line is expected.
                continue
    return rows


def row_model(row):
    msg = row.get("message")
    if row.get("type") != "assistant" or not isinstance(msg, dict):
        return None
    model = msg.get("model")
    # "<synthetic>" marks locally generated rows such as API error notices.
    return model if model and not model.startswith("<") else None


def turn_model(rows):
    for row in reversed(rows):
        if is_real_prompt(row):
            return None
        if row_model(row):
            return row_model(row)
    return None


def configured_model(project_dir):
    if os.environ.get("ANTHROPIC_MODEL"):
        return os.environ["ANTHROPIC_MODEL"]
    for path in (project_dir / ".claude/settings.local.json",
                 project_dir / ".claude/settings.json",
                 Path.home() / ".claude/settings.json"):
        try:
            model = json.loads(path.read_text()).get("model")
        except (OSError, ValueError):
            continue
        if model:
            return model
    return "unknown"


def resolve_model(payload, rows, project_dir):
    """No hook payload carries the model, so use the transcript, then what we saw last."""
    for row in reversed(rows):
        if row_model(row):
            return row_model(row)
    cache = model_cache(payload["session_id"])
    if cache.exists() and cache.read_text().strip():
        return cache.read_text().strip()
    return configured_model(project_dir)


def is_real_prompt(row):
    if row.get("type") != "user" or row.get("isMeta") or row.get("isSidechain"):
        return False
    content = (row.get("message") or {}).get("content")
    if isinstance(content, str):
        return True
    return isinstance(content, list) and any(b.get("type") == "text" for b in content) \
        and not any(b.get("type") == "tool_result" for b in content)


def prompt_text(row):
    content = row["message"]["content"]
    if isinstance(content, str):
        return content
    return "\n".join(b["text"] for b in content if b.get("type") == "text")


def final_text_from_transcript(rows):
    # Text blocks after the last tool call of the turn are the final answer.
    parts = []
    for row in reversed(rows):
        if is_real_prompt(row):
            break
        msg = row.get("message") or {}
        content = msg.get("content")
        if row.get("type") == "user" and isinstance(content, list) \
                and any(b.get("type") == "tool_result" for b in content):
            break
        if row.get("type") == "assistant" and isinstance(content, list):
            parts[:0] = [b["text"] for b in content if b.get("type") == "text"]
    return "\n\n".join(parts)


def find_log(log_dir, session_id):
    matches = sorted(log_dir.glob(f"*_{session_id}.md"))
    return matches[0] if matches else None


def header(session_id, model, project, body):
    prompt_times = PROMPT_TIME_RE.findall(body)
    first = prompt_times[0] if prompt_times else now_iso()
    last = prompt_times[-1] if prompt_times else first
    return (
        "---\n"
        f"session_id: {session_id}\n"
        f"date: {first[:10]}\n"
        f"author: {AUTHOR}\n"
        f"model: {model}\n"
        f"tool: {TOOL}\n"
        f"project: {project}\n"
        f"total_exchanges: {len(prompt_times)}\n"
        f"first_prompt_time: {first}\n"
        f"last_prompt_time: {last}\n"
        "---\n\n"
    )


def entry(kind, num, session_id, ts, model, text):
    return (
        f"[LOG_ENTRY type={kind} num={num} session={session_id[:8]}]\n"
        f"timestamp: {ts}\n"
        f"model: {model}\n\n"
        f"{text.rstrip()}\n\n\n"
    )


def append(log_dir, project, session_id, model, new_entries):
    """new_entries: list of (kind, ts, text). Numbering is derived from the file."""
    path = find_log(log_dir, session_id)
    if path is None:
        first_ts = new_entries[0][1]
        stamp = first_ts[:19].replace("T", "_").replace(":", "-")
        path = log_dir / f"{stamp}_{session_id}.md"
        body = (
            f"# Session Log - {first_ts[:10]}\n\n"
            f"Session: `{session_id[:8]}` | Project: `{project}` | Author: `{AUTHOR}`\n\n"
            "---\n\n"
        )
    else:
        body = HEADER_RE.sub("", path.read_text(encoding="utf-8"), count=1)

    for kind, ts, text in new_entries:
        prompts = sum(1 for k, _ in ENTRY_RE.findall(body) if k == "PROMPT")
        num = prompts + 1 if kind == "PROMPT" else max(prompts, 1)
        body += entry(kind, num, session_id, ts, model, text)

    tmp = path.with_suffix(".tmp")
    tmp.write_text(header(session_id, model, project, body) + body, encoding="utf-8")
    tmp.replace(path)


def last_entry_kind(log_dir, session_id):
    path = find_log(log_dir, session_id)
    if path is None:
        return None
    kinds = ENTRY_RE.findall(path.read_text(encoding="utf-8"))
    return kinds[-1][0] if kinds else None


def main():
    payload = json.load(sys.stdin)
    event = payload["hook_event_name"]
    session_id = payload["session_id"]
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd())
    log_dir = Path(os.environ.get("AGENT_LOG_DIR") or project_dir / ".agent-logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    project = project_dir.name

    if event == "SessionStart":
        if payload.get("model"):
            model_cache(session_id).write_text(payload["model"])
        return

    with open(model_cache(session_id).with_suffix(".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        rows = read_transcript(payload.get("transcript_path"))
        if event == "Stop":
            # The transcript is flushed asynchronously; give this turn's rows a moment to land.
            deadline = time.monotonic() + 3
            while turn_model(rows) is None and time.monotonic() < deadline:
                time.sleep(0.2)
                rows = read_transcript(payload.get("transcript_path"))
        model = resolve_model(payload, rows, project_dir)
        if event == "Stop" and turn_model(rows):
            model_cache(session_id).write_text(model)

        if event == "UserPromptSubmit":
            text = payload.get("prompt")
            if text is None:
                text = payload.get("user_input", "")
            append(log_dir, project, session_id, model, [("PROMPT", now_iso(), text)])

        elif event == "Stop":
            entries = []
            # The prompt can be missing if the hook was installed mid-turn or the
            # prompt hook failed; recover it from the transcript rather than lose it.
            if last_entry_kind(log_dir, session_id) != "PROMPT":
                prompt_row = next((r for r in reversed(rows) if is_real_prompt(r)), None)
                if prompt_row is not None:
                    entries.append(("PROMPT", prompt_row.get("timestamp") or now_iso(),
                                    prompt_text(prompt_row)))
            text = payload.get("last_assistant_message")
            if not text:
                text = final_text_from_transcript(rows)
            entries.append(("RESPONSE", now_iso(), text or "(no text response)"))
            append(log_dir, project, session_id, model, entries)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as exc:
        print(f"agent capture hook failed: {exc!r}", file=sys.stderr)
        sys.exit(1)
