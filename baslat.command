#!/bin/zsh
# Çift tıkla: haritayı yerelde açar (http://localhost:8791). Bu pencere açık kaldıkça çalışır.
cd "$(dirname "$0")"
PORT=8791
if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://localhost:$PORT/"
  exit 0
fi
( sleep 1; open "http://localhost:$PORT/" ) &
echo "Diplomasi Haritası çalışıyor: http://localhost:$PORT  (kapatmak için bu pencereyi kapat)"
exec python3 -m http.server $PORT --bind 127.0.0.1
