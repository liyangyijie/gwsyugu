#!/bin/bash
set -e

# 配置
LOG_FILE="cleanup.log"
MAX_LOG_SIZE_MB=50

# 日志函数
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 获取根分区可用空间
get_disk_space() {
    df -h / | tail -1 | awk '{print $4}'
}

log "========================================"
log "🧹 开始系统深度清理任务..."
log "========================================"

DISK_BEFORE=$(get_disk_space)
log "📉 清理前可用空间: $DISK_BEFORE"

# ---------------------------------------------------------
# 1. Docker 深度清理
# ---------------------------------------------------------
if command -v docker &> /dev/null; then
    if docker info >/dev/null 2>&1; then
        log "🐳 检测到 Docker 正在运行，开始清理..."

        # 1.1 清理已停止的容器 (Stopped Containers)
        log "   - 清理已停止的容器..."
        docker container prune -f > /dev/null

        # 1.2 清理未使用的网络 (Unused Networks)
        log "   - 清理未使用的网络..."
        docker network prune -f > /dev/null

        # 1.3 清理悬空镜像 (Dangling Images - <none>)
        log "   - 清理悬空镜像..."
        docker image prune -f > /dev/null

        # 1.4 清理构建缓存 (Build Cache)
        # 保留最近 24 小时的缓存，避免下次构建过慢；清理旧的缓存释放空间
        log "   - 清理 24小时前的构建缓存..."
        docker builder prune -f --filter "until=24h" > /dev/null

        log "✅ Docker 清理完成"
    else
        log "⚠️ Docker 未运行，跳过 Docker 清理"
    fi
else
    log "ℹ️ 未安装 Docker，跳过"
fi

# ---------------------------------------------------------
# 2. NPM 缓存清理
# ---------------------------------------------------------
if command -v npm &> /dev/null; then
    log "📦 清理 npm 缓存..."
    npm cache clean --force > /dev/null 2>&1
    log "✅ npm 缓存已清理"
fi

# ---------------------------------------------------------
# 3. 日志文件维护
# ---------------------------------------------------------
if [ -f "server.log" ]; then
    # 获取文件大小 (MB)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        SIZE=$(du -m server.log | cut -f1)
    else
        # Linux
        SIZE=$(du -m server.log | cut -f1)
    fi

    if [ "$SIZE" -gt "$MAX_LOG_SIZE_MB" ]; then
        log "📄 server.log 大小 (${SIZE}MB) 超过限制 (${MAX_LOG_SIZE_MB}MB)，正在轮转..."
        # 保留最后 5000 行，重置文件
        tail -n 5000 server.log > server.log.tmp && mv server.log.tmp server.log
        log "✅ server.log 已截断，保留最后 5000 行"
    else
        log "✅ server.log 大小正常 (${SIZE}MB)"
    fi
fi

# ---------------------------------------------------------
# 4. Next.js 缓存 (可选，谨慎清理)
# ---------------------------------------------------------
# 注意：清理 .next 会导致下次构建变慢，通常仅在遇到缓存问题时清理
# 这里我们仅清理 cache 目录下的临时文件，保留构建产物
if [ -d ".next/cache" ]; then
    log "⚡️ 清理 .next/cache 临时缓存..."
    rm -rf .next/cache
    log "✅ .next/cache 已清理"
fi

# ---------------------------------------------------------
# 总结
# ---------------------------------------------------------
DISK_AFTER=$(get_disk_space)
log "📈 清理后可用空间: $DISK_AFTER"
log "🎉 所有清理任务已完成！"
log "========================================"
