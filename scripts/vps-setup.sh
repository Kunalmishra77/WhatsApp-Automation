#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  AGENTIX — Complete VPS Setup Script
#  Run in Hostinger browser terminal as root after creating .env.production
#  See README: run `bash /tmp/create-env.sh` first to create env file
# ═══════════════════════════════════════════════════════════════════
set -e

APP_DIR="/var/www/agentix"
LOG_DIR="/var/log/agentix"
REPO_URL="https://github.com/Kunalmishra77/WhatsApp-Automation.git"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     AGENTIX VPS Setup Starting...         ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Check env file exists
if [ ! -f "/tmp/agentix.env" ]; then
    echo "❌  /tmp/agentix.env not found!"
    echo "   Run the env creation command first, then re-run this script."
    exit 1
fi

# ── 1. System update ─────────────────────────────────────────────
echo "▶ [1/9] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl git nginx postgresql-client ufw

# ── 2. Install Node.js 20 ────────────────────────────────────────
echo "▶ [2/9] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
apt-get install -y nodejs > /dev/null 2>&1
echo "   Node $(node -v) | npm $(npm -v)"

# ── 3. Install PM2 ───────────────────────────────────────────────
echo "▶ [3/9] Installing PM2..."
npm install -g pm2 > /dev/null 2>&1
echo "   PM2 $(pm2 -v)"

# ── 4. Create directories ────────────────────────────────────────
echo "▶ [4/9] Creating directories..."
mkdir -p "$APP_DIR" "$LOG_DIR"

# ── 5. Clone repository ──────────────────────────────────────────
echo "▶ [5/9] Cloning repository..."
if [ -d "$APP_DIR/.git" ]; then
    echo "   Repo exists — pulling latest..."
    cd "$APP_DIR" && git pull origin main
else
    if git clone "$REPO_URL" "$APP_DIR" 2>/dev/null; then
        echo "   Cloned (public)"
    else
        echo "   Private repo — enter GitHub credentials:"
        read -p "   GitHub username: " GH_USER
        read -s -p "   GitHub Personal Access Token: " GH_TOKEN
        echo ""
        git clone "https://${GH_USER}:${GH_TOKEN}@github.com/Kunalmishra77/WhatsApp-Automation.git" "$APP_DIR"
    fi
fi

cd "$APP_DIR"

# ── 6. Copy env file ─────────────────────────────────────────────
echo "▶ [6/9] Copying environment variables..."
cp /tmp/agentix.env "$APP_DIR/.env.production"
chmod 600 "$APP_DIR/.env.production"
echo "   .env.production created ✓"

# ── 7. Install deps & build ──────────────────────────────────────
echo "▶ [7/9] Installing dependencies and building..."
echo "   (Takes 3-5 minutes — please wait...)"
npm install 2>&1 | tail -3
echo "   Building Next.js..."
NODE_ENV=production npm run build 2>&1 | tail -5

# ── 8. Configure PM2 ────────────────────────────────────────────
echo "▶ [8/9] Starting app with PM2..."
cat > "$APP_DIR/ecosystem.config.js" << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'agentix',
    script: 'node_modules/.bin/next',
    args: 'start -p 3000',
    cwd: '/var/www/agentix',
    instances: 2,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1500M',
    env_file: '/var/www/agentix/.env.production',
    env: { NODE_ENV: 'production', PORT: 3000 },
    error_file: '/var/log/agentix/error.log',
    out_file:   '/var/log/agentix/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }],
};
PM2EOF

pm2 delete agentix 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | grep "^sudo" | bash 2>/dev/null || true

# ── 9. Configure Nginx ──────────────────────────────────────────
echo "▶ [9/9] Configuring Nginx..."
cp "$APP_DIR/nginx/agentix.conf" /etc/nginx/sites-available/agentix
ln -sf /etc/nginx/sites-available/agentix /etc/nginx/sites-enabled/agentix
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx && systemctl enable nginx

# ── Cron jobs (hourly scheduled campaigns!) ──────────────────────
echo "▶ Setting up cron jobs..."
CRON_SECRET=$(grep "^CRON_SECRET=" "$APP_DIR/.env.production" | cut -d= -f2)
crontab -l 2>/dev/null | grep -v agentix || true > /tmp/existing_cron

cat >> /tmp/existing_cron << CRONEOF
# ── Agentix cron jobs ──────────────────────────────────────────
0 * * * *  curl -s "http://localhost:3000/api/cron/run-scheduled-campaigns?secret=${CRON_SECRET}" >> /var/log/agentix/cron.log 2>&1
*/30 * * * * curl -s "http://localhost:3000/api/cron/process-follow-up-sequences?secret=${CRON_SECRET}" >> /var/log/agentix/cron.log 2>&1
0 */2 * * * curl -s "http://localhost:3000/api/cron/check-sla-breaches?secret=${CRON_SECRET}" >> /var/log/agentix/cron.log 2>&1
0 * * * *  curl -s "http://localhost:3000/api/cron/time-triggers?secret=${CRON_SECRET}" >> /var/log/agentix/cron.log 2>&1
30 3 * * * curl -s "http://localhost:3000/api/cron/daily-digest?secret=${CRON_SECRET}" >> /var/log/agentix/cron.log 2>&1
0 2 * * * curl -s "http://localhost:3000/api/cron/cleanup-flow-sessions?secret=${CRON_SECRET}" >> /var/log/agentix/cron.log 2>&1
0 6 * * * curl -s "http://localhost:3000/api/cron/process-campaign-queue?secret=${CRON_SECRET}" >> /var/log/agentix/cron.log 2>&1
CRONEOF
crontab /tmp/existing_cron
rm /tmp/existing_cron

# ── Firewall ─────────────────────────────────────────────────────
echo "▶ Configuring firewall..."
ufw --force reset > /dev/null
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw --force enable > /dev/null

# ── Apply DB Migrations ──────────────────────────────────────────
echo "▶ Applying database migrations..."
DB_URL=$(grep "^SUPABASE_DB_URL=" "$APP_DIR/.env.production" | cut -d= -f2-)
if [ -n "$DB_URL" ]; then
    for f in "$APP_DIR"/database/migrations/*.sql; do
        echo "   $(basename $f)..."
        psql "$DB_URL" -f "$f" --quiet 2>&1 | grep -v "already exists" || true
    done
    echo "   Migrations done ✓"
else
    echo "   ⚠ SUPABASE_DB_URL not found — run migrations manually"
fi

# ── Done ─────────────────────────────────────────────────────────
VPS_IP=$(curl -s ifconfig.me 2>/dev/null || echo "76.13.250.173")
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  ✅  AGENTIX IS LIVE!                                         ║"
echo "║                                                               ║"
echo "║  🌐  URL:  http://${VPS_IP}                                  ║"
echo "║                                                               ║"
echo "║  📊  PM2 status:    pm2 status                               ║"
echo "║  📋  App logs:      pm2 logs agentix --lines 50              ║"
echo "║  🌐  Nginx errors:  tail -f /var/log/nginx/agentix_error.log ║"
echo "║  🚀  Deploy update: bash /var/www/agentix/scripts/deploy.sh  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
pm2 status
