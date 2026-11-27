#!/bin/sh
set -eu

cd -P "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Servono Node.js 24 LTS o 26 LTS e npm. Installali e riprova." >&2
  exit 1
fi

if ! node -e "const v=process.versions.node.split('.').map(Number); process.exit((v[0]===24 && v[1]>=15) || v[0]===26 ? 0 : 1)"; then
  echo "Serve Node.js 24 LTS (24.15.0 o successiva) oppure 26 LTS." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installazione delle dipendenze al primo avvio..."
  npm ci
fi

echo "Avvio di Immobiliare..."
exec npm run desktop:dev -- "$@"
