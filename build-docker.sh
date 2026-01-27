#!/bin/bash
set -e

echo "🐳 开始构建 Docker 镜像..."

# 1. 询问 Docker Hub 用户名
read -p "请输入您的 Docker Hub 用户名 (如果不想推送只本地构建，请直接回车): " DOCKER_USER

IMAGE_NAME="gwsyugu-app"
TAG="latest"

if [ -n "$DOCKER_USER" ]; then
    FULL_IMAGE_NAME="$DOCKER_USER/$IMAGE_NAME:$TAG"
else
    FULL_IMAGE_NAME="$IMAGE_NAME:$TAG"
fi

# 2. 构建镜像 (针对 linux/amd64 架构，适配大多数 VPS)
echo "🏗️ 正在构建镜像 (目标架构: linux/amd64)..."
# 注意：如果您是 M1/M2 Mac，--platform linux/amd64 会稍微慢一点，但这对 VPS 是必须的
docker build --platform linux/amd64 -t $FULL_IMAGE_NAME .

echo "✅ 构建成功: $FULL_IMAGE_NAME"

# 3. 选择交付方式
echo "------------------------------------------------"
echo "请选择如何交付到 VPS:"
echo "1) 推送到 Docker Hub (推荐，VPS 上只需 docker run)"
echo "2) 导出为 tar 文件 (手动上传，适合 VPS 网络差)"
echo "3) 仅退出"
read -p "请输入选项 [1-3]: " CHOICE

if [ "$CHOICE" == "1" ]; then
    if [ -z "$DOCKER_USER" ]; then
        echo "❌ 未提供用户名，无法推送。"
        exit 1
    fi
    echo "📤 正在推送镜像到 Docker Hub..."
    docker push $FULL_IMAGE_NAME
    echo "✅ 推送完成！"
    echo "🚀 在 VPS 上运行以下命令即可启动："
    echo "docker run -d -p 3000:3000 -v \$(pwd)/prisma:/app/prisma --name gwsyugu $FULL_IMAGE_NAME"

elif [ "$CHOICE" == "2" ]; then
    echo "💾 正在保存镜像为 image.tar..."
    docker save -o image.tar $FULL_IMAGE_NAME
    echo "✅ 保存完成: image.tar"
    echo "📝 部署步骤:"
    echo "1. 上传 image.tar 到 VPS"
    echo "2. 加载镜像: docker load -i image.tar"
    echo "3. 启动: docker run -d -p 3000:3000 -v \$(pwd)/prisma:/app/prisma --name gwsyugu $FULL_IMAGE_NAME"
fi
