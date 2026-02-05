# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
- [12:35] [Removed] financial: Completely removed "Snapshot Query" feature (UI and Backend) to simplify the system, as requested. Users should use "Export Settlement Report" for historical reconciliation
- [12:30] [Fix] transactions: Implemented server-side pagination and filtering for Financial List to ensure all records (including historical Initial Balances) are visible
- [12:30] [Feat] FinancialList.tsx: Added Transaction Type and Date Range filters
- [11:45] [Docs] USER_GUIDE.md: Updated user manual with instructions for "Initial Balance Date", "0 vs Empty" logic in Excel import, and Virtual Scrolling performance notes
- [11:40] [Fix] data-management.ts: Fixed Excel import logic to allow `0` as a valid reading while skipping empty values (null/undefined/'')
- [11:15] [Test] data-management.test.ts: Added unit tests for `importUnits` to verify custom initial balance date logic and prevent regressions
- [11:15] [Feat] data-management.ts: Added support for `initialBalanceDate` in Unit Import, allowing historical initial balances to be set with correct dates instead of defaulting to import time
- [10:30] [Fix] data-management.ts: Fixed a bug in `importReadings` where transaction date defaulted to system time instead of reading date. Now explicitly sets `date` to ensure historical accuracy
- [10:00] [Fix] snapshot.ts: Fixed a critical timezone bug where snapshots for "Day X" excluded transactions from that day due to UTC offset. Now using explicit date strings to ensure local time "End of Day" is calculated correctly
- [16:00] [Test] snapshot.test.ts: Added Vitest unit tests for `getUnitBalancesAtDate` to verify snapshot logic and prevent regressions
- [15:45] [UI] Loading States: Implemented Skeleton screens for Dashboard and Snapshot pages to improve perceived performance
- [15:00] [Fix] snapshot.ts: Fixed snapshot date discrepancy by migrating historical transactions to match readingDate and simplifying aggregation logic to O(N)
- [20:15] [Feat] financial: Added "Monthly Balance Snapshot" view (`/financial/snapshots`) to query historical balances based on effective dates (reading date), ensuring accurate snapshots regardless of entry time
- [20:00] [Feat] readings: Added "Batch Reading Entry" feature (/readings/batch) supporting bulk data entry with auto-fetched weather data and client-side validation
- [18:00] [Fix] Export: Refined settlement report logic. Implemented "Replay Balance" algorithm based on effective dates (Deduction uses Reading Date) to solve balance mismatches caused by delayed data entry. Also forced end-of-day boundary for accurate snapshots
- [17:30] [Feature] Financial: Added "Settlement Report Export" feature. Supports generating Excel reports with custom date ranges, auto-calculating usage based on closest readings, and snapshotting historical balances
- [16:50] [UI] PredictionTab.tsx: Optimized prediction chart label to dynamically show "预测合计用热" for shared accounts and "预测用热" for single units
- [16:45] [Feat] units: Implemented server-side pagination, sorting, and searching for the Unit List to improve performance with large datasets
- [16:30] [Fix] pages: Forced dynamic rendering for `/units`, `/dashboard`, and `/financial` to prevent stale data issue after deployment (SSG -> SSR)
- [16:15] [Fix] deploy-on-vps.sh: Fixed database persistence issue by forcing `DATABASE_URL` env var and auto-moving `dev.db` to `prisma/` folder
- [16:00] [Feat] UnitList.tsx: Added client-side sorting for Unit Name, Code, and Account Balance columns in the Unit Management table
- [15:30] [Fix] PredictionTab.tsx: Updated prediction chart label to "预测用热 (账户合计)" to clarify it includes shared unit usage
- [15:00] [Refactor] codebase: Fixed all ESLint errors (any types, unused vars) and enabled strict TypeScript build checks
- [12:15] [Feature] Deployment: Updated deploy-on-vps.sh, Dockerfile, and build-for-vps.sh to support automated git-based deployment and improve safety
- [12:05] [Perf] prediction.ts: Refactored batch prediction to use concurrent processing (chunk size: 10) for 5-10x speedup
- [11:55] [Fix] prisma.config.js: Fixed database URL configuration to prevent read-only file system errors during migration
- [11:55] [Perf] schema.prisma: Added database indexes for `MeterReading` and `Unit` to optimize queries

## [2026-01-30] Mobile Optimization & Security

### Added
- **Mobile Responsive Layout**: Implemented Drawer navigation for mobile/tablet devices using `MainLayout`.
- **Card View for Mobile**: Unit list switches to card view on small screens for better readability.
- **Responsive Dashboard**: Optimized statistic grids and charts for mobile view.
- **Mobile Details View**: Adjusted Unit Detail page to stack information and allow scrolling tabs on mobile.
- **Password Protection**: Implemented site-wide password protection using `jose` and Middleware (configure via `PASSWORD` env var).

### Fixed
- **Shared Account Arrears**: Fixed a bug where child units in shared accounts were incorrectly shown as "in arrears" on the dashboard even if the parent account had sufficient funds.
- **Transaction Refund**: Fixed a critical bug in `deleteReading` and `updateReading` where refunds were credited to the child unit instead of the paying parent unit, causing balance corruption.
- **UI Components**: Fixed `Statistic` component style props to be compatible with Ant Design 5 (replaced `styles` with `valueStyle`), resolving console errors and styling issues.
- **Unit Deletion**: Fixed foreign key constraint errors when deleting units by cleaning up associated predictions and unlinking child units.
- **Reading Entry**: Fixed a `ReferenceError` when saving readings by optimizing unit data fetching scope.
- **Shared Account Warning**: Fixed a bug where child units in shared accounts displayed stale prediction warnings (interpretable as arrears) on the dashboard, by forcing the use of the parent unit's prediction data.
- **Import Billing**: Fixed a critical bug in `importReadings` where shared account logic was ignored, causing child units to be billed directly instead of the parent.

## [2026-01-29] Shared Account Optimization & Export Enhancements

### Added
- **Export Readings**: New feature in Settings to export all historical meter readings in an Excel format compatible with re-import.
- **Shared Account UI**: Added visual indicators for "Shared Balance" on unit details and warnings when recharging child units.
- **Unit Management**: Added ability to link/unlink Parent Units in the "Edit Unit" modal, with automatic fund merging logic.
- **Import Template**: Updated downloadable template to include "Shared Account (Parent Unit Name)" column.

### Changed
- **Prediction Logic**: Updated prediction algorithm to aggregate daily costs of Parent and all Child units for accurate "Days Left" estimation.
- **Export Units**: Optimized unit export to include the "Shared Account" column for round-trip compatibility.
- **Import Logic**: Enhanced `importUnits` to enforce max hierarchy depth (1) and aggregate initial balances.
- **Status Cascading**: Implemented automatic status updates (Normal/Arrears) for Child units when Parent status changes.

### Fixed
- **Dashboard Warnings**: Fixed an issue where dashboard prediction warnings for shared account units would not update after recalculation due to stale cache.
