# Shared Account Optimization Design

## 1. Context
To improve robustness for units sharing a capital account (Parent-Child model), we need to optimize data consistency during Import, Daily Entry, and Prediction phases.

## 2. Optimization Strategies

### Phase 1: Data Import (Robustness)
*   **Constraint**: Strictly enforce a 2-layer hierarchy (Parent -> Children). No multi-level nesting (A -> B -> C).
*   **Balance Aggregation**:
    *   If a unit defines a `paymentParent`, its `initialBalance` provided in the import file must be aggregated to the Parent's `initialBalance`.
    *   Child unit's own `accountBalance` must be initialized to 0.

### Phase 2: Transaction & Status Synchronization (Consistency)
*   **Cascade Status Update**:
    *   Current Logic: Only updates the status of the unit triggering the deduction.
    *   New Logic: Whenever a billing unit (Parent) balance falls below 0 (ARREARS) or rises above 0 (NORMAL), **ALL** associated child units must update their status to match the Parent immediately.
    *   This ensures that if a Parent runs out of money, all its children are marked as ARREARS (risk of disconnection).

### Phase 3: Prediction Analysis (Accuracy)
*   **Aggregated Prediction Model**:
    *   Problem: Individual prediction for Child units shows "0 days left" (no balance) or Parent units shows "infinite days" (ignoring child consumption).
    *   Solution:
        $$
        \text{Days Left} = \frac{\text{Parent Current Balance}}{\sum (\text{Parent Daily Cost} + \text{All Children Daily Costs})}
        $$
    *   Logic:
        1.  Identify the `PaymentGroup` (Root Unit).
        2.  Sum up the predicted daily cost of the Root and all its Children.
        3.  Divide Root's Balance by this sum.
        4.  Apply this "Days Left" value to all units in the group.

## 3. UI/UX Improvements
*   **Virtual Balance**: When viewing a Child unit, display the Parent's balance as "Available Shared Balance".
*   **Entry Lock/Warning**: Warn users when charging a Child unit that funds go to the Parent.

## 4. Unit Management Optimization (New)
*   **Requirement**: Allow administrators to modify the Parent-Child relationship for existing units (Merge/Separate).
*   **UI Implementation**:
    *   In `UnitDetailClient` -> Edit Modal, add a "Shared Capital Account (Parent Unit)" selection field.
    *   Allow selecting an existing unit as Parent, or clearing it to make the unit independent.
*   **Backend Logic (`updateUnit`)**:
    *   **Linking (Independent -> Child)**:
        *   When Unit B (Balance $X$) is linked to Parent A:
        *   Transfer $X from Unit B to Parent A.
        *   Create `ADJUSTMENT` transaction for B: "Transfer to Parent A" (Amount: -$X).
        *   Create `ADJUSTMENT` transaction for A: "Transfer from Child B" (Amount: +$X).
        *   Set B's `paymentParentId` to A's ID.
    *   **Unlinking (Child -> Independent)**:
        *   When Unit B is unlinked from Parent A:
        *   B starts with 0 balance (or remains 0).
        *   A retains the funds. (Alternatively, admin can manually transfer funds back if needed).
        *   Set B's `paymentParentId` to `null`.
*   **Constraint**: Prevent circular dependency (A->B->A) and depth > 1 (A->B->C). Only allow selecting a Parent that does NOT have a Parent itself.
