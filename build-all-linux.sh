#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
if ! command -v wine >/dev/null 2>&1; then echo 'Wine é necessário para gerar o instalador Windows pelo Linux. Instale com: sudo pacman -S --needed wine' >&2; exit 1; fi
node -e "if (Number(process.versions.node.split('.')[0]) < 20) process.exit(1)" || { echo 'Node.js 20+ é necessário.' >&2; exit 1; }
npm install
npm test
npm run dist:all
printf '\nBuild Linux + Windows concluído em: %s/release/\n' "$ROOT"
