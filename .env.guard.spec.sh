#!/usr/bin/env bash
set -euo pipefail
docker compose config -q
docker compose up -d --wait
docker compose ps --format json | grep -q '"Health":"healthy"'
! git ls-files | grep -qE '(^|/)\.env$'
docker compose down -v
