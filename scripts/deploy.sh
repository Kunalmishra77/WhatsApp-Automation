#!/bin/bash
# Agentix — VPS deployment script
# Run this after every git push to update production
# Usage: bash /var/www/agentix/scripts/deploy.sh

set -e  # Exit on any error

APP_DIR="/var/www/agentix"
LOG_FILE="/var/log/agentix/deploy.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') ── Starting deployment" | tee -a "$LOG_FILE"

cd "$APP_DIR"

# 1. Pull latest code
echo "▶ Pulling latest code..."
git pull origin main 2>&1 | tee -a "$LOG_FILE"

# 2. Install/update dependencies
echo "▶ Installing dependencies..."
npm install --omit=dev 2>&1 | tee -a "$LOG_FILE"

# 3. Build Next.js
echo "▶ Building app (this takes ~3 minutes)..."
npm run build 2>&1 | tee -a "$LOG_FILE"

# 4. Reload PM2 (zero-downtime restart with cluster mode)
echo "▶ Reloading PM2..."
pm2 reload agentix --update-env 2>&1 | tee -a "$LOG_FILE"

echo "$(date '+%Y-%m-%d %H:%M:%S') ── Deployment complete ✓" | tee -a "$LOG_FILE"
echo "▶ Status:"
pm2 status agentix
