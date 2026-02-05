# Project Structure

This document outlines the directory structure of the `gwsyugu` application (Next.js + Prisma).

## Root Directory (`app/`)

The main application code resides in the `app/` directory (which is also the Git root).

### 📂 Backend & Logic
- **`actions/`**: Next.js Server Actions (Business Logic).
  - `data-management.ts`: Import/Export logic.
  - `prediction.ts`: Usage prediction algorithms (Physics + Financial).
  - `unit.ts`: Unit CRUD and Shared Account logic.
  - `transactions.ts`: Financial transaction handling.
  - `readings.ts`: Meter reading management.
  - `stats.ts`: Dashboard statistics aggregation.
- **`lib/`**: Shared utilities.
  - `prisma.ts`: Prisma Client instance.
  - `weather.ts`: External Weather API integration.
- **`prisma/`**: Database configuration.
  - `schema.prisma`: Database schema definition (SQLite).
  - `dev.db`: Local SQLite database file.

### 📂 Frontend (App Router)
- **`app/`**: Next.js App Router pages.
  - **`dashboard/`**: Main dashboard (`page.tsx`) and actions (`DashboardActions.tsx`).
  - **`units/`**: Unit management.
    - `[id]/`: Individual unit details (`UnitDetailClient.tsx`).
  - **`readings/`**: Meter reading management.
    - `batch/`: Batch entry form (`BatchReadingForm.tsx`).
  - **`financial/`**: Financial transaction history.
  - **`settings/`**: System settings (`page.tsx`), Import/Export UI.
  - **`login/`**: Login page (Password protection).
  - **`api/`**: API Routes (e.g., for file downloads).
- **`components/`**: Reusable React components.
  - `unit/`: Unit-specific components (`FinancialTab.tsx`, `PredictionTab.tsx`).

### 📂 Configuration & Assets
- **`public/`**: Static files (favicons, images).
- **`docs/`**: User documentation.
  - `USER_GUIDE.md`: Comprehensive user manual.
- **`CHANGELOG.md`**: Project revision history.
- **`deployment_summary.md`**: Summary of recent deployments and testing instructions.
- **`deploy-on-vps.sh`**: Automated VPS deployment script (pulls code, migrates DB, restarts Docker).
- **`build-for-vps.sh`**: Local script to trigger remote deployment.
- **`Dockerfile`**: Container definition for production deployment.
- **`next.config.ts`**: Next.js configuration.
- **`package.json`**: Dependencies and scripts.

### 📂 External (Parent Directory)
Files located one level up (`../`) which control agent behavior:
- **`CLAUDE.md`**: Agent workflow protocols.
- **`rules/`**: Coding standards.
- **`specs/`**: Project specifications and task tracking.
