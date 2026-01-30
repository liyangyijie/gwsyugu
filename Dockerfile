# Stage 1: Base - 安装依赖的基础环境
FROM node:20-alpine AS base
WORKDIR /app
# 安装 libc6-compat 以支持某些 native modules
RUN apk add --no-cache libc6-compat

# Stage 2: Deps - 安装所有依赖 (包括 devDependencies)
FROM base AS deps
COPY package.json package-lock.json ./
# 强制使用 npm ci 保证版本一致性
RUN npm ci

# Stage 3: Builder - 编译项目
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Debug: List copied files
RUN find /app -maxdepth 3

# Explicitly copy schema to ensure it's there (redundant if COPY . . works but safe)
# COPY prisma/schema.prisma ./prisma/

# 设置环境变量，确保 Prisma 生成正确的 schema
ENV DATABASE_URL="file:./dev.db"

# 生成 Prisma Client (Linux musl 版本)
# 显式指定 schema 路径，避免 prisma.config.js 干扰
RUN ls -la /app/prisma && npx prisma generate --schema=./prisma/schema.prisma

# 优化 Node.js 内存限制
ENV NODE_OPTIONS="--max-old-space-size=2048"

# 构建 Next.js 项目 (Standalone)
RUN npm run build

# Stage 4: Runner - 最终运行环境
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# 禁用 Next.js 的遥测数据收集
ENV NEXT_TELEMETRY_DISABLED=1
# 明确设置数据库 URL，供 Prisma 使用
ENV DATABASE_URL="file:/app/prisma/dev.db"

# 创建非 root 用户提高安全性
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制 public 文件夹
COPY --from=builder /app/public ./public

# 自动创建 .next 文件夹并设置权限
RUN mkdir .next
RUN chown nextjs:nodejs .next

# 复制构建产物 (Standalone)
# 注意：Standalone 输出已经包含了 server.js 和精简后的 node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 复制 Prisma 目录用于迁移 (及 dev.db 如果需要的话，但通常建议挂载)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# 复制 Prisma 配置文件 (JS格式)，确保 npx prisma migrate deploy 可以读取
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.js ./prisma.config.js

# 切换到非 root 用户
# ⚠️ 注意：为了解决挂载 SQLite 文件的权限问题 (SQLITE_CANTOPEN)，暂时使用 root 运行
# USER nextjs

# 暴露端口
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动脚本：检查数据库并启动
# 显式导出环境变量 (使用绝对路径)，确保 Prisma migrate 能够读取到
# ⚠️ 关键逻辑修正：即使 dev.db 存在，也必须运行 migrate deploy 以确保表结构是最新的
CMD ["sh", "-c", "export DATABASE_URL=file:/app/prisma/dev.db && echo '🚀 Running migrations...' && npx prisma migrate deploy && echo '✅ Migrations complete.' && node server.js"]
