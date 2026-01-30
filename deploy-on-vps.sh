#!/bin/bash
set -e

# =================配置区域=================
REPO_URL="https://github.com/liyangyijie/gwsyugu.git"
APP_DIR="/root/gwsyugu-docker"
PORT=3000
# =========================================

echo "🚀 开始 VPS 自动化部署..."

# 1. 检查并添加 Swap (解决内存不足问题)
# 确保至少有 1GB 的 Swap
SWAP_SIZE=$(free -m | grep Swap | awk '{print $2}')
if [ "$SWAP_SIZE" -lt 1000 ]; then
    echo "⚠️ 检测到 Swap 不足 (当前: ${SWAP_SIZE}MB)，正在处理..."

    # 如果已经有 swapfile 但太小，先关闭并删除
    if [ -f /swapfile ]; then
        echo "🔄 删除旧的 swapfile..."
        swapoff /swapfile || true
        rm -f /swapfile
    fi

    echo "📦 创建 1GB 虚拟内存..."
    dd if=/dev/zero of=/swapfile bs=1M count=1024
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile

    # 更新 /etc/fstab (防止重复添加)
    if ! grep -q "/swapfile" /etc/fstab; then
        echo "/swapfile none swap sw 0 0" >> /etc/fstab
    fi

    echo "✅ Swap 创建完成 (1GB)。"
else
    echo "✅ Swap 空间充足 (当前: ${SWAP_SIZE}MB)。"
fi

# 2. 安装 Docker (如果未安装)
if ! command -v docker &> /dev/null; then
    echo "🐳 正在安装 Docker..."
    curl -fsSL https://get.docker.com | bash
    echo "✅ Docker 安装完成。"
fi

# 3. 拉取/更新代码
if [ -d "$APP_DIR" ]; then
    echo "📂 更新代码..."
    cd "$APP_DIR"
    # 强制重置代码以确保与远程一致 (修复本地文件缺失或冲突)
    git fetch --all
    git reset --hard origin/main
else
    echo "📂 克隆代码..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# 检查关键文件是否存在
if [ ! -f "prisma/schema.prisma" ]; then
    echo "❌ 错误: prisma/schema.prisma 文件缺失！请检查仓库内容。"
    ls -R prisma
    exit 1
fi

# 4. 准备环境配置
# 如果没有 .env，创建一个默认的
if [ ! -f .env ]; then
    echo "⚙️ 创建 .env 文件..."
    # ⚠️ 关键设置：容器内的 DATABASE_URL 必须是绝对路径 /app/prisma/dev.db
    # 这样 Prisma Client 和 Migrate 才能找到正确的文件
    echo 'DATABASE_URL="file:/app/prisma/dev.db"' > .env
fi

# 确保 prisma 目录存在 (用于挂载数据库)
mkdir -p prisma

# 5. 构建镜像 (使用 Dockerfile)
echo "🏗️ 开始构建 Docker 镜像 (这可能需要几分钟)..."
docker build -t gwsyugu:latest .

# 6. 停止并删除旧容器
if [ "$(docker ps -aq -f name=gwsyugu-app)" ]; then
    echo "🛑 停止旧容器..."
    docker rm -f gwsyugu-app
fi

# 7. 启动新容器
echo "🚀 启动容器..."
# -v $(pwd)/prisma:/app/prisma: 将宿主机的 prisma 目录挂载进容器，确保 dev.db 数据持久化
# -v $(pwd)/.env:/app/.env: 挂载 .env 文件
docker run -d \
  --name gwsyugu-app \
  --restart unless-stopped \
  -p 127.0.0.1:$PORT:3000 \
  -v $(pwd)/prisma:/app/prisma \
  -v $(pwd)/.env:/app/.env \
  gwsyugu:latest

echo "🎉 部署成功！"
echo "服务已启动在 127.0.0.1:$PORT (不直接暴露公网)"
