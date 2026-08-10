#!/usr/bin/env bash
# capture-finding.sh: append one finding to .claude/reviews/review-issues.jsonl
# Call once per confirmed finding. Safe to call from any review skill in any project.
set -euo pipefail

PROJECT=""; SKILL=""; RUN_ID=""; DIMENSION=""; SEVERITY=""
CATEGORY=""; FILE=""; LINE="0"; MESSAGE=""
FIX=""; AGENT=""; CHECK_ID=""; WHITELISTED="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --skill) SKILL="$2"; shift 2 ;;
    --run-id) RUN_ID="$2"; shift 2 ;;
    --dimension) DIMENSION="$2"; shift 2 ;;
    --severity) SEVERITY="$2"; shift 2 ;;
    --category) CATEGORY="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --line) LINE="$2"; shift 2 ;;
    --message) MESSAGE="$2"; shift 2 ;;
    --fix) FIX="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    --check-id) CHECK_ID="$2"; shift 2 ;;
    --whitelisted) WHITELISTED="true"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

for v in PROJECT SKILL RUN_ID DIMENSION SEVERITY CATEGORY FILE MESSAGE; do
  if [ -z "${!v}" ]; then echo "capture-finding.sh: missing required --${v,,}" >&2; exit 2; fi
done

DATE=$(date -u +%Y-%m-%d)
REVIEWS_DIR=".claude/reviews"; LOG="$REVIEWS_DIR/review-issues.jsonl"
mkdir -p "$REVIEWS_DIR"

# category_hash groups findings into pattern classes for a-self-learner.
# The clustering key is the CATEGORY slug alone (lowercased): NOT the free-text
# message and NOT the dimension, either of which fragments one pattern into
# many hashes. Must stay in lockstep with a-self-learner's capture-finding.sh
# and review-log-schema.md "category_hash computation".
HASH=$(printf '%s' "$CATEGORY" | tr '[:upper:]' '[:lower:]' | sha256sum | cut -c1-16)
FINDING_ID=$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')

python3 - "$DATE" "$PROJECT" "$SKILL" "$RUN_ID" "$FINDING_ID" "$DIMENSION" \
  "$SEVERITY" "$CATEGORY" "$FILE" "$LINE" "$MESSAGE" "$FIX" "$AGENT" \
  "$CHECK_ID" "$HASH" "$WHITELISTED" "$LOG" <<'PY'
import json, sys
(date, project, skill, run_id, finding_id, dimension, severity, category,
 file_, line, message, fix, agent, check_id, category_hash, whitelisted, log) = sys.argv[1:]
rec = {"date": date, "project": project, "skill": skill, "run_id": run_id,
       "finding_id": finding_id, "dimension": dimension, "severity": severity,
       "category": category, "file": file_, "line": int(line or 0),
       "message": message, "category_hash": category_hash,
       "whitelisted": whitelisted == "true"}
if fix: rec["fix_proposed"] = fix
if agent: rec["agent"] = agent
if check_id: rec["check_id"] = check_id
with open(log, "a") as f:
    f.write(json.dumps(rec, separators=(",", ":")) + "\n")
PY
