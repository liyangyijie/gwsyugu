#!/bin/bash

# 错误中断机制
set -e

echo "🚀 开始构建适用于低配置 VPS 的部署包..."

# 1. 清理旧的构建文件
echo "🧹 清理缓存..."
rm -rf .next
rm -rf deploy_dist
rm -f deploy.tar.gz

# 2. 生成 Prisma 客户端 (包含 Linux 二进制文件)
echo "💎 生成 Prisma Client (适配 Linux)..."
# 确保 schema.prisma 中已经配置了 binaryTargets = ["native", "linux-musl-openssl-3.0.x", "linux-musl"]
npx prisma generate

# 3. 编译项目
echo "🏗️ 编译 Next.js 项目..."
npm run build

# 4. 组装部署包
echo "📦 组装文件..."
mkdir -p deploy_dist

# 4.1 复制独立运行包 (核心逻辑 + node_modules + 隐藏文件)
cp -r .next/standalone/. deploy_dist/

# ⚠️ 关键修复：删除本地平台的 native modules (如 better-sqlite3)
# 这些预编译的二进制文件是 macOS 版的，不能在 Linux 上运行
# 我们需要在 VPS 上利用 npm install 重新安装它们（仅安装生产依赖，内存占用小）
# 注意：Standalone 模式下，node_modules 可能位于根目录，也可能位于 .next/server/ 或其他位置
# 我们主要清理根目录下的，因为 start.sh 会在那里安装
rm -rf deploy_dist/node_modules/better-sqlite3
rm -rf deploy_dist/node_modules/@prisma/adapter-better-sqlite3
# 同时尝试清理 .next 内部可能存在的副本 (如果有)
find deploy_dist -name "better-sqlite3" -type d -exec rm -rf {} + 2>/dev/null || true

# 4.2 复制静态资源 (Standalone 模式不包含静态资源，必须手动复制)
# 注意：.next 目录在步骤 4.1 中可能已被复制（取决于 standalone 结构），这里确保 static 存在
mkdir -p deploy_dist/.next/static
cp -r .next/static/* deploy_dist/.next/static/
cp -r public deploy_dist/public

# 4.3 复制 Prisma 目录 (用于数据库迁移)
cp -r prisma deploy_dist/prisma

# 生成一个简化的 prisma.config.js (CommonJS)，移除 TS 和 dotenv 依赖
# 因为 Standalone 模式下不支持直接运行 TS 配置文件，且 prisma 包可能未完全安装
# 我们这里直接生成 JS 文件
cat > deploy_dist/prisma.config.js << 'EOF'
const config = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
};

module.exports = {
  default: config,
  config,
};
EOF

# 4.4 创建启动脚本
cat > deploy_dist/start.sh << 'EOF'
#!/bin/bash
export PORT=3000
export HOSTNAME="0.0.0.0"

# 明确设置 DATABASE_URL 环境变量，确保 Prisma 能读取
export DATABASE_URL="file:./prisma/dev.db"

# 同时也写入 .env 文件作为备份
if [ ! -f ".env" ]; then
    echo "DATABASE_URL=\"file:./prisma/dev.db\"" > .env
fi

# 检查依赖并安装 native modules (修复 better-sqlite3 ELF 错误)
# 注意：必须先删除可能存在的残留文件，确保全新安装
if [ ! -d "node_modules/better-sqlite3" ] || [ ! -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    echo "🔧 正在安装 Linux 平台依赖 (better-sqlite3)..."

    # 强制清理可能存在的损坏文件
    rm -rf node_modules/better-sqlite3
    rm -rf node_modules/@prisma/adapter-better-sqlite3

    # 仅安装 better-sqlite3 和适配器，跳过其他已存在的包
    # ⚠️ 关键修正：必须显式安装到当前 node_modules，防止 npm 破坏 .next/standalone 的依赖结构
    # 同时安装 @prisma/client 以确保版本匹配（虽然 standalone 里有，但 npm install 可能会清理未声明的包）
    # 补充：安装 @prisma/debug 以解决 engines postinstall 脚本的依赖缺失问题
    npm install better-sqlite3 @prisma/adapter-better-sqlite3 @prisma/debug --no-save --omit=dev
fi

# 检查是否需要初始化数据库
if [ ! -f "prisma/dev.db" ]; then
    echo "⚠️ 未检测到数据库文件，正在尝试初始化..."
    # 尝试使用 npx (如果服务器有安装) 或直接提示
    if command -v npx &> /dev/null; then
        npx prisma migrate deploy
    else
        echo "❌ 服务器未安装 npx，无法自动迁移数据库。"
        echo "💡 请手动上传本地的 prisma/dev.db 文件到 prisma/ 目录下。"
    fi
fi

echo "🚀 启动服务 (端口: $PORT)..."
node server.js
EOF

chmod +x deploy_dist/start.sh

# 5. 压缩打包
echo "🗜️ 压缩 deploy.tar.gz..."
tar -czf deploy.tar.gz -C deploy_dist .

# 6. 清理临时目录
rm -rf deploy_dist

echo "✅ 构建完成！"
echo "📂 生成文件: deploy.tar.gz"
echo "---------------------------------------------------"
echo "📝 部署步骤:"
echo "1. 将 deploy.tar.gz 上传到 VPS"
echo "2. 解压: tar -xzf deploy.tar.gz"
echo "3. 运行: ./start.sh"
echo "---------------------------------------------------"
