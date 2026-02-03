'use server'

import prisma from '@/lib/prisma'
import dayjs from 'dayjs'

export async function getUnitBalancesAtDate(date: Date) {
    // Force end of day to include all transactions effective on that day
    const safeDate = dayjs(date).endOf('day').toDate();

    try {
        const [units, transactions] = await Promise.all([
            prisma.unit.findMany({
                orderBy: { code: 'asc' },
                select: { id: true, name: true, code: true, initialBalance: true, parentUnitId: true }
            }),
            prisma.accountTransaction.findMany({
                orderBy: { date: 'asc' },
                include: { relatedReading: true }
            })
        ]);

        const balanceMap = new Map<number, number>();

        // 1. Calculate balances for all units
        units.forEach(unit => {
            const unitTx = transactions.filter(t => t.unitId === unit.id);

            // Replay Logic based on Effective Date
            const effectiveTxs = unitTx.map(t => {
                let effectiveDate = t.date;
                // Fix: DEDUCTION should be effective on the Reading Date, not Entry Date
                if (t.type === 'DEDUCTION' && t.relatedReading) {
                    effectiveDate = t.relatedReading.readingDate;
                }
                return { ...t, effectiveDate };
            });

            // Filter transactions that effectively happened on or before the snapshot date
            // Exclude INITIAL transaction to avoid double counting with unit.initialBalance
            const validTxs = effectiveTxs.filter(t => t.effectiveDate <= safeDate && t.type !== 'INITIAL');

            // Calculate sum
            const balance = validTxs.reduce((sum, t) => sum + Number(t.amount), Number(unit.initialBalance));
            balanceMap.set(unit.id, balance);
        });

        // 2. Generate result with correct status (checking parent for shared accounts)
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
