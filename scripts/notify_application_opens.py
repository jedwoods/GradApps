#!/usr/bin/env python3
"""Notify when GradApps PhD application portals open (macOS Notification Center)."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENS_FILE = ROOT / "_shared" / "application-opens.json"
STATE_FILE = ROOT / "_shared" / ".notify-state.json"
LOG_FILE = ROOT / "_shared" / ".notify-log.txt"


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def log(msg: str) -> None:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{stamp}] {msg}\n"
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line)
    print(line, end="")


def notify(title: str, body: str, subtitle: str = "GradApps") -> None:
    # Escape for AppleScript string literals
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace('"', '\\"')

    script = (
        f'display notification "{esc(body)}" '
        f'with title "{esc(title)}" '
        f'subtitle "{esc(subtitle)}" '
        f'sound name "Glass"'
    )
    subprocess.run(["osascript", "-e", script], check=False)


def open_browser(url: str) -> None:
    subprocess.run(["open", url], check=False)


def due_events(today: date, config: dict) -> list[dict]:
    days_before = config.get("notify_days_before", [3, 1, 0])
    events = []
    for portal in config["portals"]:
        opens = date.fromisoformat(portal["opens"])
        for offset in days_before:
            notify_on = opens - timedelta(days=offset)
            if notify_on == today:
                if offset == 0:
                    kind = "opens_today"
                    title = f"{portal['school']} application opens today"
                elif offset == 1:
                    kind = "opens_tomorrow"
                    title = f"{portal['school']} opens tomorrow"
                else:
                    kind = f"opens_in_{offset}_days"
                    title = f"{portal['school']} opens in {offset} days"
                events.append(
                    {
                        "key": f"{portal['id']}:{kind}:{portal['opens']}",
                        "kind": kind,
                        "title": title,
                        "body": f"{portal['program']} — {portal.get('opens_note', portal['opens'])}",
                        "portal": portal,
                    }
                )
        # Catch-up: if already open and within 7 days after open, remind once
        if opens < today <= opens + timedelta(days=7):
            events.append(
                {
                    "key": f"{portal['id']}:already_open:{portal['opens']}",
                    "kind": "already_open",
                    "title": f"{portal['school']} application is open",
                    "body": f"{portal['program']} opened {portal['opens']}. {portal.get('opens_note', '')}",
                    "portal": portal,
                }
            )
    return events


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print events without notifying")
    parser.add_argument("--force", action="store_true", help="Ignore already-sent state")
    parser.add_argument("--open-links", action="store_true", help="Open portal URLs in browser")
    parser.add_argument(
        "--date",
        default=None,
        help="Override today as YYYY-MM-DD (for testing)",
    )
    args = parser.parse_args()

    config = load_json(OPENS_FILE, None)
    if not config:
        log(f"Missing config: {OPENS_FILE}")
        return 1

    today = date.fromisoformat(args.date) if args.date else date.today()
    state = {} if args.force else load_json(STATE_FILE, {})
    sent = set(state.get("sent", []))

    events = due_events(today, config)
    pending = [e for e in events if e["key"] not in sent]

    if not pending:
        log(f"No new notifications for {today.isoformat()}")
        return 0

    for event in pending:
        log(f"{event['kind']}: {event['title']} — {event['body']}")
        if not args.dry_run:
            notify(event["title"], event["body"])
            if args.open_links and event["portal"].get("portal"):
                open_browser(event["portal"]["portal"])
            sent.add(event["key"])

    if not args.dry_run:
        state["sent"] = sorted(sent)
        state["last_run"] = datetime.now().isoformat(timespec="seconds")
        save_json(STATE_FILE, state)
        log(f"Sent {len(pending)} notification(s)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
