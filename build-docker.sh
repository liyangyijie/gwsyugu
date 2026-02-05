#!/bin/bash
set -e

# 配置
DOCKER_USER="liyangyijie"
IMAGE_NAME="gwsyugu"
TAG="latest"
FULL_IMAGE_NAME="$DOCKER_USER/$IMAGE_NAME:$TAG"

echo "🐳 开始构建 Docker 镜像..."
echo "📦 目标镜像: $FULL_IMAGE_NAME"

# 1. 构建镜像 (针对 linux/amd64 架构，适配 VPS)
echo "🏗️  正在构建镜像 (目标架构: linux/amd64)..."
# 注意：如果您是 M1/M2 Mac，--platform linux/amd64 会稍微慢一点，但这对 VPS 是必须的
docker build --platform linux/amd64 -t $FULL_IMAGE_NAME .

echo "✅ 构建成功: $FULL_IMAGE_NAME"

# 2. 推送到 Docker Hub
echo "------------------------------------------------"
echo "📤 准备推送到 Docker Hub..."

# 尝试登录 (如果尚未登录)
if ! docker system info | grep -q "Username"; then
    echo "⚠️  检测到未登录 Docker Hub"
    echo "请运行 'docker login' 进行登录，然后重新运行脚本。"
    # 这里不强制退出，因为可能只是本地没有显示 Login Succeeded 但实际能推
fi

echo "🚀 正在推送镜像..."
docker push $FULL_IMAGE_NAME

echo "✅ 推送完成！"
echo "------------------------------------------------"
echo "🌍 在 VPS 上部署/更新:"
echo "1. 拉取新镜像: docker pull $FULL_IMAGE_NAME"
echo "2. 停止旧容器: docker stop gwsyugu && docker rm gwsyugu"
echo "3. 启动新容器: docker run -d --restart=always -p 3000:3000 \\"
echo "   -v \$(pwd)/prisma:/app/prisma \\"
echo "   -e DATABASE_URL=\"file:/app/prisma/dev.db\" \\"
echo "   -e PASSWORD=\"您的密码\" \\"
echo "   --name gwsyugu $FULL_IMAGE_NAME"
echo "------------------------------------------------"
