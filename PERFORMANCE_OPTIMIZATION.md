# 项目性能审计与优化报告 (Performance Audit & Optimization Report)

**文档日期**: 2026-01-31
**分析对象**: 核心预测逻辑、统计计算、数据库模型

---

## 1. 核心发现 (Key Findings)

通过对代码的深度分析，我们发现系统在**数据量增长（如单位 > 1000 或 读数 > 10000）** 后，可能面临以下严重的性能瓶颈。最关键的问题在于**串行计算**和**缺乏数据库索引**。

### 1.1 严重瓶颈 (Critical Bottlenecks)

1.  **"一键计算"的串行阻塞**:
    *   **位置**: `actions/prediction.ts` -> `calculateBatchParams`
    *   **问题**: 目前使用 `for...of` 循环**串行 (Sequentially)** 处理每个单位的预测。
    *   **影响**: 如果计算一个单位耗时 200ms，计算 500 个单位将导致前端等待 **100秒**，这会直接导致 HTTP 请求超时（Vercel 默认限制 10s/60s）。
    *   **证据**:
        ```typescript
        for (const id of unitIds) {
            await calculateUnitParams(id) // 等待上一个完成才开始下一个
            await getPrediction(id, true)
        }
        ```

2.  **仪表盘统计的 N+1 问题与全量加载**:
    *   **位置**: `actions/stats.ts` -> `getDashboardStats`
    *   **问题**: 每次刷新仪表盘，都会一次性加载数据库中**所有单位**及其关联的预测数据 (`JSON.parse` 解析大字符串)。
    *   **影响**: 随着单位数量增加，内存占用线性飙升，解析 JSON 的 CPU 开销也会阻塞 Node.js 事件循环。

3.  **数据库索引缺失**:
    *   **位置**: `prisma/schema.prisma`
    *   **问题**: `MeterReading` 表中的 `unitId` 和 `readingDate` 字段没有显式索引。
    *   **影响**: 预测逻辑频繁按 `readingDate` 排序查询历史记录。无索引会导致全表扫描 (Full Table Scan)，查询速度随数据量指数级下降。

---

## 2. 优化方案 (Optimization Strategy)

我们建议分阶段实施以下优化：

### 第一阶段：数据库性能 (Database Tuning) - 立即执行
**目标**: 提升单次查询速度。

*   **操作**: 为 `MeterReading` 表添加复合索引。
*   **Schema 修改**:
    ```prisma
    model MeterReading {
      // ... 现有字段
      @@index([unitId, readingDate]) // 优化历史记录查询
      @@index([isBilled])            // 优化未结账查询
    }
    ```

### 第二阶段：并发计算 (Concurrency) - 建议尽快执行
**目标**: 解决“一键计算”超时问题。

*   **策略**: 将串行循环改为并发执行 (`Promise.all` + 批处理)。
*   **代码调整 (`actions/prediction.ts`)**:
    ```typescript
    // 优化前：串行
    for (const id of unitIds) { await process(id); }

    // 优化后：分批并发 (Batch Concurrency)
    const BATCH_SIZE = 10;
    for (let i = 0; i < unitIds.length; i += BATCH_SIZE) {
        const batch = unitIds.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(id => process(id)));
    }
    ```
    *收益*: 预计计算速度提升 **5-10倍**。

### 第三阶段：统计逻辑重构 (Architecture Refactor) - 长期规划
**目标**: 降低仪表盘负载。

*   **策略**: 避免在“读取时”进行繁重的计算（On-Demand Calculation）。
*   **方案**:
    1.  引入 `SystemStats` 缓存表。
    2.  每次“一键计算”或“数据变更”后，异步更新这个缓存表中的 `totalBalance` 和 `arrearsCount`。
    3.  仪表盘直接读取缓存表，无需遍历所有单位。

---

## 3. 具体实施代码 (Code Implementation)

### 3.1 修正 `prisma/schema.prisma` (已实施)

我们已在 `MeterReading` 和 `Unit` 表中添加了以下索引，并通过 Migration `20260131035250_init` 成功应用：

```prisma
model MeterReading {
  // ...
  // 已添加索引
  @@index([unitId, readingDate])
  @@index([isBilled])
}

model Unit {
  // ...
  // 已添加索引
  @@index([parentUnitId])
}
```

### 3.2 优化 `calculateBatchParams` (已实施)

`app/actions/prediction.ts` 已重构为并发模式（Batch Size: 10）。这将大幅提升批量计算的速度。

### 3.3 部署脚本优化 (已实施)

为了确保这些数据库变更能在生产环境生效，我们升级了部署流程：
1.  `deploy-on-vps.sh`: 增加了自动迁移步骤 (`prisma migrate deploy`)。
2.  `Dockerfile`: 更新了启动命令以支持自动迁移。

### 3.4 前端性能与体验优化 (Frontend & UX) - 已实施

**目标**: 解决大数据量下的页面卡顿和数据实时性问题。

*   **服务端分页 (Server-Side Pagination)**:
    *   **位置**: `app/app/units/UnitList.tsx` & `actions/unit.ts`
    *   **策略**: 将原来的客户端全量过滤改为服务端分页查询 (`skip/take`)。
    *   **收益**: 页面加载时间从线性增长优化为常数时间 (O(1))。

*   **强制动态渲染 (Force Dynamic Rendering)**:
    *   **位置**: Page Components
    *   **策略**: 使用 `export const dynamic = 'force-dynamic'` 禁用 SSG。
    *   **收益**: 确保用户总是看到最新的数据库状态，避免了静态缓存导致的“数据缺失”假象。

### 3.5 逻辑修正与算法优化 (Logic Correction & Algorithm Optimization) - 已实施

**目标**: 修复余额快照的时间逻辑一致性问题，并优化计算性能。

*   **问题**:
    1.  **逻辑不一致**: 历史余额快照使用“录入时间”而非“读数时间”，导致与结算报表不一致。
    2.  **计算复杂度高**: 快照计算采用复杂的联表查询和双重循环过滤，性能随数据量线性下降。

*   **解决方案**:
    1.  **数据迁移**: 执行 `scripts/fix-transaction-dates.js`，将所有历史 `DEDUCTION` 交易的日期同步为对应的 `readingDate`。
    2.  **逻辑简化**: `getUnitBalancesAtDate` (snapshot.ts) 现在直接基于 `transaction.date` 进行聚合 (O(N))，无需再进行复杂的 `relatedReading` 关联查询。
    3.  **一致性保证**: 新的读数录入 (`saveMeterReading`) 强制将交易日期设置为读数日期。

*   **收益**:
    *   **准确性**: 快照与结算报表逻辑完全一致。
    *   **性能**: 快照计算速度提升，减少了数据库 JOIN 操作。

---

## 4. 结论 (Conclusion)

所有的**高优先级**性能优化任务（索引、并发计算）均已完成并部署。

**当前状态**:
*   ✅ **数据库索引**: 已添加。
*   ✅ **并发计算**: 已实现。
*   ✅ **部署流程**: 已更新以支持自动迁移。

系统现在已准备好处理更大规模的数据（千级单位、万级读数），预计“一键计算”的响应速度将提升 5-10 倍。

**建议优先级**:
1.  **中**: 仪表盘缓存 (仅在数据量非常巨大、并发用户增多时考虑)。
