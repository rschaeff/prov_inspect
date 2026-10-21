#!/bin/bash
#
# Start prov_inspect detached on leda.
#   ./start_background.sh         production build, port 3008
#   ./start_background.sh --dev   dev server,       port 4008
#
# Internal only. Do NOT expose this; it serves internal structures and unreleased curation calls.
#
# `setsid` is load-bearing. Launched as a plain `nohup ... &` from a shell that
# then exits, npm and its `next start` child get killed with the process group,
# so the server appears to start, answers once, and is gone by the next check.
# setsid puts it in its own session so it outlives the launching shell.
cd "$(dirname "$0")"

if [ "$1" = "--dev" ]; then
    CMD=(npm run dev:leda); PORT=4008; MODE=dev
else
    CMD=(npm start); PORT=3008; MODE=production
    if [ ! -f .next/BUILD_ID ]; then
        echo "Error: no production build. Run 'npm run build' first."; exit 1
    fi
fi

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    echo "Error: port $PORT is already in use."; exit 1
fi

setsid nohup "${CMD[@]}" > prov_inspect.log 2>&1 < /dev/null &
disown
sleep 1

# Record the pid that actually holds the port, not npm's wrapper.
for _ in $(seq 1 40); do
    PID=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | head -1)
    [ -n "$PID" ] && break
    sleep 0.5
done

if [ -z "$PID" ]; then
    echo "Error: did not come up on port $PORT. Last log lines:"; tail -5 prov_inspect.log; exit 1
fi
echo "$PID" > prov_inspect.pid
echo "prov_inspect ($MODE) listening on port $PORT, pid $PID"
echo "  http://leda:$PORT"
