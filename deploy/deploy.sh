#!/usr/bin/env bash
# Deploy mums.flower to dev3: rsync the code, install production deps inside node:24-alpine (so
# libSQL's musl binary is the one installed), install the unit and the Moshpit nginx template,
# restart, and check health. Run from a checkout: deploy/deploy.sh [root@host]
set -euo pipefail
HOST="${1:-root@dev3}"
cd "$(dirname "$0")/.."

rsync -az --delete \
  --exclude .git --exclude node_modules --exclude test --exclude '*.db' --exclude '*.db-*' --exclude '.claude' \
  ./ "$HOST:/opt/mums.flower/"

ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/mums.flower
docker run --rm -v /opt/mums.flower:/app -w /app node:24-alpine \
  sh -c 'corepack enable >/dev/null 2>&1 && pnpm install --prod --frozen-lockfile --config.confirmModulesPurge=false >/dev/null'
chown -R root:root /opt/mums.flower && chmod -R a+rX /opt/mums.flower
install -d -o 65534 -g 65534 -m 750 /var/lib/mums.flower
[ -f /etc/mums-flower.env ] || { install -m 600 /dev/null /etc/mums-flower.env; echo "created empty /etc/mums-flower.env"; }
install -m 644 deploy/mums-flower.service /etc/systemd/system/mums-flower.service
install -d -m 755 /etc/moshpit/templates
install -m 644 deploy/moshpit-template.conf /etc/moshpit/templates/mums.flower.conf
systemctl daemon-reload
systemctl enable --now mums-flower >/dev/null 2>&1 || true
systemctl restart mums-flower
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8811/healthz >/dev/null 2>&1; then echo "healthy after ${i}s"; exit 0; fi
  sleep 1
done
journalctl -u mums-flower -n 40 --no-pager
exit 1
REMOTE
