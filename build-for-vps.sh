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

# 4.1 复制独立运行包 (核心逻辑 + node_modules)
cp -r .next/standalone/* deploy_dist/

# 4.2 复制静态资源 (Standalone 模式不包含静态资源，必须手动复制)
mkdir -p deploy_dist/.next
cp -r .next/static deploy_dist/.next/static
cp -r public deploy_dist/public

# 4.3 复制 Prisma 目录 (用于数据库迁移)
cp -r prisma deploy_dist/prisma

# 4.4 创建启动脚本
cat > deploy_dist/start.sh << 'EOF'
#!/bin/bash
export PORT=3000
export HOSTNAME="0.0.0.0"

# 创建 .env 文件以供 Prisma 使用
if [ ! -f ".env" ]; then
    echo "DATABASE_URL=\"file:./prisma/dev.db\"" > .env
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
