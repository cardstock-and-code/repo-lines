#!/usr/bin/env bash
# Rebuilds the moving parts of the fixture so E2E runs are repeatable:
# fresh heartbeat timestamps, live PIDs, and predictable file mtimes.
set -e
DEV=/home/claude/fixtures/dev
export REPO_LINES_HOME=/home/claude/fixtures/rlhome
S=$REPO_LINES_HOME/sessions
mkdir -p "$S"; rm -f "$S"/*.json

pkill -f "sleep 4242" 2>/dev/null || true
setsid nohup sleep 4242 >/dev/null 2>&1 </dev/null & P1=$!
setsid nohup sleep 4242 >/dev/null 2>&1 </dev/null & P2=$!
disown -a 2>/dev/null || true

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
MID=$(date -u -d '18 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
OLD=$(date -u -d '4 hours ago'   +%Y-%m-%dT%H:%M:%SZ)

w(){ printf '%s\n' "$2" > "$S/$1.json"; }
w a "{\"agent\":\"Claude Code\",\"pid\":$P1,\"worktree\":\"$DEV/trees/sr-portal-phase25\",\"branch\":\"phase-25-payroll\",\"startedAt\":\"$NOW\",\"beatAt\":\"$NOW\",\"note\":\"payout confirmation step\"}"
w b "{\"agent\":\"Codex\",\"pid\":$P2,\"worktree\":\"$DEV/trees/sr-portal-laundry\",\"branch\":\"laundry-bin-rework\",\"startedAt\":\"$MID\",\"beatAt\":\"$MID\"}"
w c "{\"agent\":\"Codex\",\"pid\":999999,\"worktree\":\"$DEV/trees/sr-portal-storerun\",\"branch\":\"store-run-receipts\",\"startedAt\":\"$OLD\",\"beatAt\":\"$OLD\"}"
w d "{\"agent\":\"Claude Code\",\"pid\":$P1,\"worktree\":\"$DEV/trees/sr-site-estimate\",\"branch\":\"estimate-form\",\"startedAt\":\"$NOW\",\"beatAt\":\"$NOW\"}"
w e "{\"agent\":\"Claude Code\",\"pid\":999997,\"worktree\":\"/home/claude/somewhere-else\",\"branch\":\"who-knows\",\"startedAt\":\"$OLD\",\"beatAt\":\"$OLD\"}"

# live session edited seconds ago; idle one edited 18 min ago; ended one hours ago
touch -d 'now'              "$DEV/trees/sr-portal-phase25/PayoutTable.jsx" "$DEV/trees/sr-portal-phase25/periods.js"
touch -d '18 minutes ago'   "$DEV/trees/sr-portal-laundry/bins.js"        "$DEV/trees/sr-portal-laundry/periods.js"
touch -d '4 hours ago'      "$DEV/trees/sr-portal-storerun/receipt.js"
touch -d 'now'              "$DEV/trees/sr-site-estimate/EstimateForm.jsx"

echo "fixture ready (live pids $P1 $P2)"
