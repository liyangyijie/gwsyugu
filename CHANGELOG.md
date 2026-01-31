# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
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
