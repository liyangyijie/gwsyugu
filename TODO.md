# Project TODO & Performance Optimization Plan

This document tracks planned optimizations and technical debt reduction tasks.

## 🚀 Performance Optimization (High Priority)

- [ ] **Refactor Financial Calculation Logic (O(N*M) -> O(N+M))**
  - **Target**: `app/actions/snapshot.ts`, `app/actions/export.ts`
  - **Issue**: Current implementation iterates through *all* transactions for *every* unit (Nested Loop). With 1k units and 50k transactions, this is 50M operations.
  - **Solution**:
    1. Pre-fetch transactions and group them by `unitId` into a `Map<number, Transaction[]>` (Hash Map).
    2. Iterate units and lookup transactions in O(1) time.
    3. Apply DB-level filtering (e.g., `where: { date: { lte: snapshotDate } }`) to reduce data transfer.

- [ ] **Optimize Dashboard Statistics**
  - **Target**: `app/actions/stats.ts` (`getDashboardStats`)
  - **Issue**: Fetches all Unit objects into memory to calculate sums using JavaScript `reduce`.
  - **Solution**: Use Prisma Aggregations (`prisma.unit.aggregate`) to calculate `_sum` and `_count` directly in the database.

## ⚡️ Batch Processing & Scalability

- [ ] **Optimize Batch Import/Entry**
  - **Target**: `app/actions/data-management.ts` (`importReadings`), `app/actions/readings.ts` (`submitBatchReadings`)
  - **Issue**: Processes records sequentially in a single large transaction or loop. Large files may cause timeouts or database locks.
  - **Solution**:
    1. **Chunking**: Process records in batches of 50-100 items per transaction.
    2. **Parallel Weather Fetching**: Extract unique dates first, fetch all weather data in parallel, then process records.

## 🎨 Frontend Experience

- [ ] **Virtual Scrolling for Large Lists**
  - **Target**: `UnitList.tsx` (Mobile Card View), `SnapshotView.tsx`
  - **Solution**: Implement virtual scrolling to only render visible DOM nodes, improving performance on low-end devices when viewing thousands of units.

- [ ] **Loading States**
  - **Target**: Dashboard, Snapshot View
  - **Solution**: Replace simple spinners with Skeleton screens to improve perceived performance.

## 🛡️ Code Quality & Maintenance

- [ ] **Strict Typing**
  - Reduce usage of `any` type in `actions/` files and UI components.
  - Define strict interfaces for `ImportUnitData`, `Transaction`, etc.

- [ ] **Unit Tests**
  - Add tests for critical financial logic (`snapshot.ts`, `export.ts`) to ensure "Replay Balance" algorithm remains accurate during refactoring.
