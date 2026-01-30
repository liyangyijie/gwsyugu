# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [2026-01-30] Mobile Optimization & Security

### Added
- **Mobile Responsive Layout**: Implemented Drawer navigation for mobile/tablet devices using `MainLayout`.
- **Card View for Mobile**: Unit list switches to card view on small screens for better readability.
- **Responsive Dashboard**: Optimized statistic grids and charts for mobile view.
- **Mobile Details View**: Adjusted Unit Detail page to stack information and allow scrolling tabs on mobile.
- **Password Protection**: Implemented site-wide password protection using `jose` and Middleware (configure via `PASSWORD` env var).

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
