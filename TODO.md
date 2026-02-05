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

- [x] **Optimize Batch Import/Entry**
  - **Target**: `app/actions/data-management.ts` (`importReadings`), `app/actions/readings.ts` (`submitBatchReadings`)
  - **Status**: Completed. Implemented concurrent processing (chunk size: 10) for independent units and sequential processing for shared accounts to ensure data integrity. Also implemented parallel weather fetching.

## 🎨 Frontend Experience

- [ ] **Virtual Scrolling for Large Lists**
  - **Target**: `UnitList.tsx` (Mobile Card View), `SnapshotView.tsx`
  - **Solution**: Implement virtual scrolling to only render visible DOM nodes, improving performance on low-end devices when viewing thousands of units.
  - **Note**: Server-side pagination is already implemented, so this is low priority.

- [x] **Loading States**
  - **Target**: Dashboard, Snapshot View
  - **Status**: Completed. Implemented Skeleton screens (`loading.tsx`) for Dashboard and Snapshots pages.

## 🛡️ Code Quality & Maintenance

- [x] **Strict Typing**
  - **Status**: Completed. Fixed all ESLint errors, removed explicit `any` usage in critical paths, and enabled strict TypeScript build checks.

- [x] **Unit Tests**
  - **Target**: `app/actions/snapshot.ts`
  - **Status**: Completed. Added Vitest + mock tests for `getUnitBalancesAtDate` covering normal cases and arrears logic.
