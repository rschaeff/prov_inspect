#!/usr/bin/env bash
# Mol* is served as the PREBUILT BUNDLE from public/, not bundled by Next.
#
# WHY. `molstar/lib/apps/viewer` pulls in the mp4-export extension, whose
# h264 encoder requires `fs`, and the skin as `.scss`, which wants a sass
# toolchain. Both are build-time problems created by importing the whole app
# when this dashboard needs a viewport and a selection. The published bundle
# already resolved them at Mol*'s own build time, so it is copied in verbatim.
#
# Re-run after `npm install molstar@<newer>`; `npm run build` runs it first.
set -euo pipefail
cd "$(dirname "$0")"
src=node_modules/molstar/build/viewer
test -f "$src/molstar.js" || { echo "no molstar build at $src" >&2; exit 1; }
mkdir -p public/molstar
cp "$src/molstar.js" "$src/molstar.css" public/molstar/
node -e "console.log('molstar', require('./node_modules/molstar/package.json').version, '->', 'public/molstar/')"
