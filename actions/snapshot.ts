'use server'

import prisma from '@/lib/prisma'
import dayjs from 'dayjs'

export async function getUnitBalancesAtDate(date: Date) {
    // Force end of day to include all transactions effective on that day
    const safeDate = dayjs(date).endOf('day').toDate();

    try {
        // Fetch all units
        const units = await prisma.unit.findMany({
            orderBy: { code: 'asc' },
            select: { id: true, name: true, code: true, initialBalance: true, parentUnitId: true }
        });

        // 1. Fetch Aggregated Transactions directly from DB
        // We need to sum up all transactions that happened BEFORE or ON the safeDate.
        // Special Case: DEDUCTION transactions should use their relatedReading.readingDate as effective date.
        // This makes SQL aggregation tricky because of the JOIN logic.
        // To optimize without overly complex raw SQL, we can fetch simplified transaction data
        // filtered by a broader date range and perform light-weight aggregation in memory,
        // OR rely on the fact that entry date is usually close to reading date.
        //
        // However, strictly following the logic: DEDUCTION effective date = Reading Date.
        // Let's iterate:
        // Option A: Raw SQL (Best Performance)
        // Option B: Two Queries (Readings + Other Transactions)

        // Let's go with Option B:
        // Group 1: Non-Deduction Transactions (RECHARGE, ADJUSTMENT) - Filter by tx.date
        const nonDeductionSums = await prisma.accountTransaction.groupBy({
            by: ['unitId'],
            where: {
                type: { notIn: ['INITIAL', 'DEDUCTION'] }, // Exclude INITIAL (base) and DEDUCTION (handled separately)
                date: { lte: safeDate }
            },
            _sum: {
                amount: true
            }
        });

        // Group 2: Deduction Transactions - We need to check the Reading Date
        // Since we can't easily join in groupBy, we have to fetch Deductions.
        // Optimization: Only fetch Deductions where readingDate <= safeDate.
        // This requires a join filter. Prisma supports relation filtering.
        const deductions = await prisma.accountTransaction.findMany({
            where: {
                type: 'DEDUCTION',
                relatedReading: {
                    readingDate: { lte: safeDate }
                }
            },
            select: {
                unitId: true,
                amount: true
            }
        });

        // Map sums to unitIds
        const balanceChanges = new Map<number, number>();

        // Process Non-Deductions
        for (const item of nonDeductionSums) {
            const current = balanceChanges.get(item.unitId) || 0;
            balanceChanges.set(item.unitId, current + Number(item._sum.amount || 0));
        }

        // Process Deductions
        for (const tx of deductions) {
            const current = balanceChanges.get(tx.unitId) || 0;
            balanceChanges.set(tx.unitId, current + Number(tx.amount));
        }

        // 2. Generate result
        const balanceMap = new Map<number, number>();

        // Compute Final Balance
        units.forEach(unit => {
            const initial = Number(unit.initialBalance);
            const change = balanceChanges.get(unit.id) || 0;
            balanceMap.set(unit.id, initial + change);
        });

        const data = units.map(unit => {
            const balance = balanceMap.get(unit.id) ?? 0;

            // Determine effective balance for status check
            let effectiveBalance = balance;
            if (unit.parentUnitId) {
                effectiveBalance = balanceMap.get(unit.parentUnitId) ?? 0;
            }

            return {
                id: unit.id,
                name: unit.name,
                code: unit.code,
                balance: balance,
                parentUnitId: unit.parentUnitId,
                status: effectiveBalance < 0 ? '欠费' : '正常'
            };
        });

        return { success: true, data };
    } catch (error) {
        console.error('Snapshot failed:', error);
        return { success: false, error: 'Failed to calculate snapshot' };
    }
}
