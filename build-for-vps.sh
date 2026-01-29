#!/bin/bash
set -e

# Configuration - 请修改为您的 VPS IP
VPS_USER="root"
VPS_HOST="YOUR_VPS_IP"
REMOTE_DIR="/root/gwsyugu-docker"

echo "🚀 Deploying to VPS ($VPS_HOST)..."

# 1. Upload deploy script (ensuring latest version on remote)
echo "📂 Uploading deploy script..."
ssh $VPS_USER@$VPS_HOST "mkdir -p $REMOTE_DIR"
scp deploy-on-vps.sh $VPS_USER@$VPS_HOST:$REMOTE_DIR/deploy-on-vps.sh

# 2. Trigger remote deployment
echo "⚡ Triggering remote deployment..."
ssh $VPS_USER@$VPS_HOST "chmod +x $REMOTE_DIR/deploy-on-vps.sh && $REMOTE_DIR/deploy-on-vps.sh"

echo "✅ Remote deployment triggered."
