#!/usr/bin/env bash
# configure.sh — Replace all placeholders using values from .env
# Usage: bash scripts/configure.sh
set -euo pipefail

if [ ! -f .env ]; then echo ".env not found. Copy .env.example first."; exit 1; fi
source .env

FILES=(
  kamailio/cfg/kamailio.cfg
  asterisk/conf/pjsip.conf
  asterisk/conf/extensions.conf
  asterisk/conf/cdr_mysql.conf
  asterisk/conf/manager.conf
  asterisk/conf/ari.conf
  rtpengine/rtpengine.conf
  db/init/03_seed.sql
)

for f in "${FILES[@]}"; do
  sed -i \
    -e "s/KAMAILIO_DOMAIN_PLACEHOLDER/${DOMAIN}/g" \
    -e "s/DB_USER_PLACEHOLDER/${DB_USER}/g" \
    -e "s/DB_PASS_PLACEHOLDER/${DB_PASS}/g" \
    -e "s/DB_HOST_PLACEHOLDER/mysql/g" \
    -e "s/REDIS_PASS_PLACEHOLDER/${REDIS_PASS}/g" \
    -e "s/VOCALLABS_IP_PLACEHOLDER/${VOCALLABS_IP}/g" \
    -e "s/VOCALLABS_PORT_PLACEHOLDER/${VOCALLABS_PORT}/g" \
    -e "s/VOCALLABS_USER_PLACEHOLDER/${VOCALLABS_USER}/g" \
    -e "s/VOCALLABS_PASS_PLACEHOLDER/${VOCALLABS_PASS}/g" \
    -e "s/VOCALLABS_PREFIX_PLACEHOLDER/${VOCALLABS_PREFIX}/g" \
    -e "s/VOCALLABS_CALLER_ID2_PLACEHOLDER/${VOCALLABS_CALLER_ID2}/g" \
    -e "s/VOCALLABS_CALLER_ID_PLACEHOLDER/${VOCALLABS_CALLER_ID}/g" \
    -e "s/ASTERISK_IP_PLACEHOLDER/127.0.0.1/g" \
    -e "s/PUBLIC_IP_PLACEHOLDER/${PUBLIC_IP}/g" \
    -e "s/AMI_USER_PLACEHOLDER/${AMI_USER:-amiuser}/g" \
    -e "s/AMI_PASS_PLACEHOLDER/${AMI_PASS}/g" \
    -e "s/ARI_USER_PLACEHOLDER/${ARI_USER:-ariuser}/g" \
    -e "s/ARI_PASS_PLACEHOLDER/${ARI_PASS}/g" \
    "$f"
  echo "Configured: $f"
done

echo ""
echo "All placeholders replaced. Run: docker compose up -d --build"
