#!/bin/bash
cd "$(dirname "$0")"
PORT=${1:-3008}
PID=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | head -1)
if [ -z "$PID" ]; then
    echo "Nothing listening on $PORT."; rm -f prov_inspect.pid; exit 0
fi
kill "$PID" 2>/dev/null
for _ in $(seq 1 20); do
    ss -ltn 2>/dev/null | grep -q ":$PORT " || break
    sleep 0.5
done
ss -ltn 2>/dev/null | grep -q ":$PORT " && kill -9 "$PID" 2>/dev/null
rm -f prov_inspect.pid
echo "Stopped pid $PID on port $PORT"
