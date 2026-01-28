#!/bin/bash

echo "🧹 开始清理 Docker 缓存和未使用的镜像..."

# 1. 清理悬空的镜像 (dangling images) - 构建过程中产生的中间层
echo "1. 清理悬空镜像 (Dangling images)..."
docker image prune -f

# 2. 清理构建缓存 (Build cache) - 释放构建过程中产生的缓存
echo "2. 清理构建缓存 (Build cache)..."
docker builder prune -f

# 3. (可选) 清理所有停止的容器
# docker container prune -f

echo "✅ 清理完成！"
echo "当前磁盘使用情况："
df -h
