#!/bin/bash
set -e

# Configuration - 请修改为您的 VPS IP
VPS_USER="root"
VPS_HOST="YOUR_VPS_IP"
# 上传到临时目录，避免被 git reset 覆盖 (如果放在仓库目录下会被覆盖)
REMOTE_SCRIPT_DIR="/tmp"

echo "🚀 Deploying to VPS ($VPS_HOST)..."

# 1. Upload deploy script (ensuring latest version on remote)
echo "📂 Uploading deploy script..."
scp deploy-on-vps.sh $VPS_USER@$VPS_HOST:$REMOTE_SCRIPT_DIR/deploy-on-vps.sh

# 2. Trigger remote deployment
echo "⚡ Triggering remote deployment..."
ssh $VPS_USER@$VPS_HOST "chmod +x $REMOTE_SCRIPT_DIR/deploy-on-vps.sh && $REMOTE_SCRIPT_DIR/deploy-on-vps.sh"

echo "✅ Remote deployment triggered."
