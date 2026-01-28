# 技术总结：VPS 低内存环境部署与 Prisma 7 适配踩坑记录

本文档记录了在低配置 VPS（1GB 内存）上部署 Next.js + Prisma 7 + SQLite 项目时遇到的关键问题及解决方案。

## 1. 内存不足 (OOM) 导致构建失败

### 问题现象
在 `docker build` 过程中，执行 `npm run build` 时进程被系统杀死 (Exit Code 137 / SIGKILL)。
日志显示：
```bash
npm error code SIGKILL
npm error command failed
```

### 解决方案

#### 1.1 增加 Swap 交换空间
VPS 物理内存不足时，必须增加虚拟内存。
**操作**：在部署脚本中自动检测并创建 3GB Swap。
```bash
# deploy-on-vps.sh
dd if=/dev/zero of=/swapfile bs=1M count=3072
mkswap /swapfile
swapon /swapfile
```

#### 1.2 优化 Node.js 内存限制
默认情况下 Node.js 可能不会充分利用可用内存（包括 Swap）。
**操作**：在 `Dockerfile` 构建阶段增加环境变量。
```dockerfile
# 允许构建进程使用更多内存
ENV NODE_OPTIONS="--max-old-space-size=4096"
```

#### 1.3 降低构建负载 (生产环境)
Next.js 默认在构建时会运行 ESLint 和 TypeScript 类型检查，这非常消耗内存。
**操作**：修改 `next.config.ts`，仅在生产构建时跳过检查（假定 CI/本地已通过检查）。
```typescript
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // ...
};
```

---

## 2. Prisma 7 配置与 Docker 运行时兼容性

### 问题现象
Prisma 7 引入了新的配置文件机制，导致在 Docker 运行时出现两个问题：
1. **构建报错**：`prisma/schema.prisma` 中保留 `datasource.url` 会与配置文件冲突。
2. **运行报错**：`Error: The datasource.url property is required`。原因是 Docker 生产镜像 (`runner` stage) 是纯 Node.js 环境，缺少 TypeScript 运行时，无法加载 `prisma.config.ts`。

### 解决方案

#### 2.1 迁移配置文件格式
**操作**：将 `prisma.config.ts` 替换为 `prisma.config.js` (CommonJS)，移除对 `dotenv` 和 `ts-node` 的依赖。
```javascript
// prisma.config.js
module.exports = {
  // ...
  datasource: {
    // 提供默认回退值，防止环境变量未加载导致崩溃
    url: process.env.DATABASE_URL || "file:/app/prisma/dev.db",
  },
};
```

#### 2.2 修正 schema.prisma
**操作**：移除 schema 文件中的 `url` 属性，完全由配置文件管理。
```prisma
// prisma/schema.prisma
datasource db {
  provider = "sqlite"
  // url = env("DATABASE_URL")  <-- 删除此行
}
```

#### 2.3 确保配置文件入镜像
**操作**：在 `Dockerfile` 的 Runner 阶段显式复制配置文件。
```dockerfile
# 必须复制 JS 版本的配置文件
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.js ./prisma.config.js
```

#### 2.4 环境变量双重保障
**操作**：在 `Dockerfile` 中显式声明环境变量，确保 Prisma CLI 即使未读取到 `.env` 文件也能找到数据库。
```dockerfile
ENV DATABASE_URL="file:/app/prisma/dev.db"
```

---

## 3. 总结
在资源受限的环境下部署现代全栈应用，关键在于：
1. **以时间换空间**：利用 Swap 防止 OOM。
2. **精简构建流程**：跳过非必要的检查步骤。
3. **运行时纯粹化**：生产环境尽量避免依赖 TypeScript 运行时，配置文件优先使用 `.js` 或 `.json`。
