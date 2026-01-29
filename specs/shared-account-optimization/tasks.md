# Implementation Plan - Shared Account Optimization

- [x] 1. Enhance `importUnits` Logic (Backend)
  - Enforce max depth = 1 (Parent -> Child only).
  - Logic to aggregate Child `initialBalance` into Parent.
  - _File: `app/actions/data-management.ts`_

- [x] 2. Implement Cascading Status Updates (Backend)
  - Create helper `updatePaymentGroupStatus(billingUnitId)`.
  - Apply in `rechargeUnit`, `adjustBalance`, `saveMeterReading`, `updateReading`, `deleteTransaction`.
  - _Files: `app/actions/transactions.ts`, `app/actions/readings.ts`_

- [x] 3. Implement Aggregated Prediction Logic (Backend)
  - Update prediction algorithm to sum up daily costs of the entire Payment Group.
  - Handle `incompleteData` flag.
  - Support Child viewing Parent forecast + Self history.
  - _File: `app/actions/prediction.ts`_

- [x] 4. Update UI for Shared Accounts (Frontend)
  - Show "Shared Balance" on Unit Details.
  - Handle `incompleteData` warning in prediction view.
  - Warn users when recharging child units.
  - _Files: `app/app/units/[id]/UnitDetailClient.tsx`, `app/app/components/unit/FinancialTab.tsx`, `app/app/components/unit/PredictionTab.tsx`_

- [x] 5. Update Unit Import Template (Frontend)
  - Add '共用账户(父单位名称)' column to template.
  - Map column to `paymentParent` during import.
  - _File: `app/settings/page.tsx`_
