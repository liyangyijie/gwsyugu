#!/bin/bash
set -e

# 配置
LOG_FILE="cleanup.log"
MAX_LOG_SIZE_MB=50

# 检查是否开启 Deep Mode
DEEP_MODE=false
if [[ "$1" == "--deep" ]]; then
    DEEP_MODE=true
fi

# 日志函数
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 获取根分区可用空间
get_disk_space() {
    df -h / | tail -1 | awk '{print $4}'
}

log "========================================"
if [ "$DEEP_MODE" = true ]; then
    log "🧹 开始系统深度清理任务 (Deep Mode)..."
    log "⚠️  注意: 将删除所有未使用镜像和缓存，下次构建可能变慢。"
else
    log "🧹 开始系统日常清理任务..."
fi
log "========================================"

DISK_BEFORE=$(get_disk_space)
log "📉 清理前可用空间: $DISK_BEFORE"

# ---------------------------------------------------------
# 1. Docker 深度清理
# ---------------------------------------------------------
if command -v docker &> /dev/null; then
    if docker info >/dev/null 2>&1; then
        log "🐳 检测到 Docker 正在运行，开始清理..."

        # 1.1 清理已停止的容器
        log "   - 清理已停止的容器..."
        docker container prune -f > /dev/null

        # 1.2 清理未使用的网络
        log "   - 清理未使用的网络..."
        docker network prune -f > /dev/null

        # 1.3 清理镜像 (差异化逻辑)
        if [ "$DEEP_MODE" = true ]; then
            log "   - [Deep] 清理所有未被使用的镜像 (包括基础镜像)..."
            docker image prune -a -f > /dev/null
        else
            log "   - [Normal] 清理悬空镜像 (Dangling)..."
            docker image prune -f > /dev/null
        fi

        # 1.4 清理构建缓存 (差异化逻辑)
        if [ "$DEEP_MODE" = true ]; then
            log "   - [Deep] 清理所有构建缓存..."
            docker builder prune -a -f > /dev/null
        else
            log "   - [Normal] 清理 24小时前的构建缓存..."
            docker builder prune -f --filter "until=24h" > /dev/null
        fi

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
        SIZE=$(du -m server.log | cut -f1)
    else
        SIZE=$(du -m server.log | cut -f1)
    fi

    if [ "$SIZE" -gt "$MAX_LOG_SIZE_MB" ]; then
        log "📄 server.log 大小 (${SIZE}MB) 超过限制 (${MAX_LOG_SIZE_MB}MB)，正在轮转..."
        # 保留最后 5000 行
        tail -n 5000 server.log > server.log.tmp && mv server.log.tmp server.log
        log "✅ server.log 已截断，保留最后 5000 行"
    else
        log "✅ server.log 大小正常 (${SIZE}MB)"
    fi
fi

# ---------------------------------------------------------
# 4. Next.js 缓存 (可选)
# ---------------------------------------------------------
if [ -d ".next/cache" ]; then
    log "⚡️ 清理 .next/cache 临时缓存..."
    rm -rf .next/cache
    log "✅ .next/cache 已清理"
fi

# ---------------------------------------------------------
# 5. Systemd Journal 日志清理 (Linux Only)
# ---------------------------------------------------------
if command -v journalctl &> /dev/null; then
    log "📜 清理 Systemd Journal 日志..."
    if [ "$DEEP_MODE" = true ]; then
        # Deep模式：保留最近2天，限制50MB
        journalctl --vacuum-time=2d > /dev/null 2>&1 || true
        journalctl --vacuum-size=50M > /dev/null 2>&1 || true
        log "✅ [Deep] Systemd Journal 已清理 (保留2天/50MB)"
    else
        # 日常模式：保留7天，限制100MB
        journalctl --vacuum-time=7d > /dev/null 2>&1 || true
        journalctl --vacuum-size=100M > /dev/null 2>&1 || true
        log "✅ [Normal] Systemd Journal 已清理 (保留7天/100MB)"
    fi
fi

# ---------------------------------------------------------
# 总结
# ---------------------------------------------------------
DISK_AFTER=$(get_disk_space)
log "📈 清理后可用空间: $DISK_AFTER"
log "🎉 所有清理任务已完成！"
log "========================================"
