#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 20+ e npm precisam estar instalados." >&2
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 20 )); then
  echo "Versão de Node muito antiga: $(node --version). Instale Node.js 20 ou mais recente." >&2
  exit 1
fi

npm install
npm test
npm run dist:linux

echo
echo "Build concluído. Procure o AppImage dentro de: $ROOT/release/"
