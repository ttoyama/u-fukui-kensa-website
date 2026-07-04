#!/bin/bash
# Mac mini 仮運用: ビルド済みの dist/ を学内LANに配信する。
# 使い方: bash scripts/serve.sh [ポート番号]（既定 8080）
# 停止: Ctrl+C（launchd 常駐の場合は launchctl unload）
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${1:-8080}"

if [ ! -d dist ]; then
  echo "dist/ がありません。先に npm run build を実行してください。" >&2
  exit 1
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
echo "配信を開始します: http://${IP}:${PORT}"
exec python3 -m http.server "$PORT" --directory dist --bind 0.0.0.0
