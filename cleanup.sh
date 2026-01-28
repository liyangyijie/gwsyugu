#!/bin/bash

echo "🧹 开始清理 Docker 缓存和未使用的镜像..."

# 1. 清理悬空的镜像 (dangling images) - 构建过程中产生的中间层
echo "1. 清理悬空镜像 (Dangling images)..."
docker image prune -f

# 2. 清理构建缓存 (Build cache) - 释放构建过程中产生的缓存
echo "2. 清理构建缓存 (Build cache)..."
docker builder prune -f

# 3. 清理 npm 缓存 (如果有)
if command -v npm &> /dev/null; then
    echo "3. 清理 host 主机 npm 缓存..."
    npm cache clean --force
fi

# 4. (可选) 清理项目临时文件 (如果存在)
if [ -d ".next" ]; then
    echo "4. 清理 .next 构建缓存..."
    rm -rf .next
fi

echo "✅ 清理完成！"
echo "当前磁盘使用情况："
df -h
