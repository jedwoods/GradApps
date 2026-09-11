# GradApps

Local workspace for tracking graduate (CS PhD) applications: shared essay drafts, per-school packets, a deadline tracker, and a small browser editor.

School-specific packets, spreadsheets, and personal profile data are **gitignored** so this repo stays a reusable shell without your target list or drafts.

## What's included

- `serve.py` + `web/` — local markdown editor with live preview
- `_shared/materials/` — blank SOP / personal-statement / CV templates
- `applications/_template/` — copy this folder for each program
- `scripts/notify_application_opens.py` — optional macOS open-date notifications
- Example configs: `schools.csv.example`, `tracker.md.example`, `_shared/application-opens.example.json`

## Quick start

```bash
# Copy examples and fill in locally (these files stay untracked)
cp schools.csv.example schools.csv
cp tracker.md.example tracker.md
cp _shared/application-opens.example.json _shared/application-opens.json
cp _shared/timeline.example.md _shared/timeline.md
cp _shared/recommenders.example.md _shared/recommenders.md
cp _shared/applicant-profile.example.md _shared/applicant-profile.md

# Add a school packet
cp -R applications/_template applications/my-school-phd

# Browser editor
python3 serve.py
# → http://127.0.0.1:8765
```

## Layout

```
_shared/                 reusable materials (profile/recommenders stay local)
applications/<school>/   README, application.md, checklist, statements/, faculty/
schools.csv              your list (local only)
tracker.md               deadlines/fees (local only)
```

## Notifications (optional, macOS)

1. Edit `_shared/application-opens.json` with portal open dates.
2. Copy `scripts/notify-opens.plist.example` → a LaunchAgent plist, replace `PROJECT_ROOT`, then `launchctl load` it.
3. Manual check: `python3 scripts/notify_application_opens.py`
