#!/bin/bash
set -e

# ================= 配置区域 =================
IMAGE_NAME="liyangyijie/gwsyugu:latest"
CONTAINER_NAME="gwsyugu"
APP_DIR="/root/gwsyugu-docker"
PORT=3000
# ===========================================

echo "🚀 开始安装/部署 GWSYUGU 系统 (Docker Image 模式)..."

# 1. 基础环境检查与准备
echo "🛠️  [1/6] 检查系统环境..."

# 1.1 检查并添加 Swap (确保至少 1GB)
SWAP_SIZE=$(free -m | grep Swap | awk '{print $2}')
if [ "$SWAP_SIZE" -lt 1000 ]; then
    echo "⚠️  检测到 Swap 不足 (当前: ${SWAP_SIZE}MB)，正在自动创建 1GB Swap..."
    if [ -f /swapfile ]; then
        swapoff /swapfile || true
        rm -f /swapfile
    fi
    dd if=/dev/zero of=/swapfile bs=1M count=1024
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q "/swapfile" /etc/fstab; then
        echo "/swapfile none swap sw 0 0" >> /etc/fstab
    fi
    echo "✅ Swap 创建完成。"
else
    echo "✅ Swap 空间充足。"
fi

# 1.2 安装 Docker (如果未安装)
if ! command -v docker &> /dev/null; then
    echo "🐳 正在安装 Docker..."
    curl -fsSL https://get.docker.com | bash
    echo "✅ Docker 安装完成。"
fi

# 2. 准备项目目录
echo "📂 [2/6] 准备应用目录: $APP_DIR"
mkdir -p "$APP_DIR/prisma"
cd "$APP_DIR"

# 3. 配置文件设置
echo "⚙️  [3/6] 配置环境变量..."

# 检查 .env 是否存在，不存在则创建并询问密码
if [ ! -f .env ]; then
    echo "未找到配置文件，正在创建..."
    echo 'DATABASE_URL="file:/app/prisma/dev.db"' > .env

    # 交互式询问访问密码
    read -p "🔑 请设置系统访问密码 (用于登录网站): " SITE_PASSWORD
    if [ -z "$SITE_PASSWORD" ]; then
        echo "❌ 密码不能为空！"
        exit 1
    fi
    echo "PASSWORD=\"$SITE_PASSWORD\"" >> .env
    echo "✅ .env 配置文件已生成。"
else
    echo "✅ 检测到现有配置文件，跳过配置。"
fi

# 4. 拉取最新镜像
echo "⬇️  [4/6] 拉取最新镜像: $IMAGE_NAME..."
docker pull "$IMAGE_NAME"

# 5. 数据库迁移
echo "🔄 [5/6] 执行数据库迁移..."
# 确保 dev.db 存在（如果不存在，Prisma 会创建）
# 使用临时容器执行迁移，确保宿主机的 prisma/dev.db 结构是最新的
docker run --rm \
  -v $(pwd)/prisma:/app/prisma \
  -v $(pwd)/.env:/app/.env \
  "$IMAGE_NAME" \
  npx prisma migrate deploy

echo "✅ 数据库迁移完成。"

# 6. 启动服务
echo "🚀 [6/6] 启动服务容器..."

# 停止并删除旧容器
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
    docker rm -f $CONTAINER_NAME > /dev/null
fi

# 启动新容器
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p 3000:3000 \
  -v $(pwd)/prisma:/app/prisma \
  -v $(pwd)/.env:/app/.env \
  "$IMAGE_NAME"

echo "=================================================="
echo "🎉 安装/更新成功！"
echo "🌐 访问地址: http://<服务器IP>:3000"
echo "📂 数据目录: $APP_DIR/prisma"
echo "📜 查看日志: docker logs -f $CONTAINER_NAME"
echo "=================================================="
