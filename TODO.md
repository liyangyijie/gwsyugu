# Project TODO & Performance Optimization Plan

This document tracks planned optimizations and technical debt reduction tasks.

## 🚀 Performance Optimization (High Priority)

- [x] **Refactor Financial Calculation Logic (O(N*M) -> O(N+M))**
  - **Target**: `app/actions/snapshot.ts`, `app/actions/export.ts`
  - **Status**: Completed. Implemented Map-based grouping for transactions and readings.

- [x] **Optimize Dashboard Statistics**
  - **Target**: `app/actions/stats.ts` (`getDashboardStats`)
  - **Status**: Completed. Optimized database query using `select` to fetch only required fields, reducing memory footprint.

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
