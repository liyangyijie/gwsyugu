'use server'

import prisma from '@/lib/prisma'
import dayjs from 'dayjs'

export async function getUnitBalancesAtDate(dateStr: string) {
    // Force end of day to include all transactions effective on that day
    // Using string "YYYY-MM-DD" ensures we target the specific calendar day regardless of timezone.
    // e.g. "2026-01-15" -> End of Jan 15th (which covers all transactions on that day)
    const safeDate = dayjs(dateStr).endOf('day').toDate();

    try {
        // Fetch all units
        const units = await prisma.unit.findMany({
            orderBy: { code: 'asc' },
            select: { id: true, name: true, code: true, initialBalance: true, parentUnitId: true }
        });

        // Optimized: Now that DEDUCTION transactions have correct dates (synced with readingDate),
        // we can aggregate all transactions directly by date.
        const transactionSums = await prisma.accountTransaction.groupBy({
            by: ['unitId'],
            where: {
                type: { not: 'INITIAL' }, // Exclude INITIAL as we add unit.initialBalance separately
                date: { lte: safeDate }
            },
            _sum: {
                amount: true
            }
        });

        const balanceChanges = new Map<number, number>();

        for (const item of transactionSums) {
             balanceChanges.set(item.unitId, Number(item._sum.amount || 0));
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
