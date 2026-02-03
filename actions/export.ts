'use server'

import prisma from '@/lib/prisma'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'

export async function exportSettlementReport(startDate: Date, endDate: Date) {
    // Force endDate to end of day to include all transactions of that day
    const safeEndDate = dayjs(endDate).endOf('day').toDate();
    // Start date is usually 00:00:00, but ensuring it won't hurt
    const safeStartDate = dayjs(startDate).startOf('day').toDate();

    try {
        // 1. Fetch Data (Optimized: Single query per table)
        const [units, transactions, readings] = await Promise.all([
            prisma.unit.findMany({ orderBy: { id: 'asc' } }),
            prisma.accountTransaction.findMany({
                orderBy: { date: 'asc' },
                include: { relatedReading: true } // Crucial for Effective Date logic
            }),
            prisma.meterReading.findMany({
                orderBy: { readingDate: 'asc' }
            })
        ]);

        // 2. Process Data in Memory
        const rows = units.map(unit => {
            const unitTx = transactions.filter(t => t.unitId === unit.id);
            const unitReadings = readings.filter(r => r.unitId === unit.id);

            // A. Total Recharge (Initial + RECHARGE type)
            // EXCLUDE ADJUSTMENT to avoid double counting shared accounts
            // Only count 'RECHARGE' (Real money) and Initial Balance
            const rechargeSum = unitTx
                .filter(t => t.type === 'RECHARGE')
                .reduce((sum, t) => sum + Number(t.amount), 0);
            const totalRecharge = Number(unit.initialBalance) + rechargeSum;

            // B. End Balance (Replay Logic based on Effective Date)
            // Logic:
            // 1. If DEDUCTION -> Use relatedReading.readingDate as effective date
            // 2. Others -> Use transaction.date
            // 3. Filter all transactions where effectiveDate <= safeEndDate
            // 4. Sum initialBalance + all filtered amounts
            const effectiveTxs = unitTx.map(t => {
                let effectiveDate = t.date;
                // Fix: DEDUCTION should be effective on the Reading Date, not Entry Date
                if (t.type === 'DEDUCTION' && t.relatedReading) {
                    effectiveDate = t.relatedReading.readingDate;
                }
                return { ...t, effectiveDate };
            });

            const validTxs = effectiveTxs.filter(t => t.effectiveDate <= safeEndDate);

            const endBalance = validTxs.reduce((sum, t) => sum + Number(t.amount), Number(unit.initialBalance));

            // C. Start Reading (>= startDate, find closest FUTURE)
            // User: "初始日数据后找最近的真实抄表数"
            // Filter readings >= startDate, sort ASC (earliest first)
            const startR = unitReadings
                .filter(r => r.readingDate >= safeStartDate)
                .sort((a, b) => a.readingDate.getTime() - b.readingDate.getTime())[0];

            let startNote = '';
            if (!startR) {
                startNote = '无起始日后抄表数据';
            } else if (startR.readingDate > safeStartDate) {
                // If it's not exactly on the start date
                startNote = `起始数取自${dayjs(startR.readingDate).format('YYYY-MM-DD')}`;
            }

            // D. End Reading (<= endDate, find closest PAST)
            // User: "截止日数据则前找"
            // Filter readings <= endDate, sort DESC (latest first)
            const endR = unitReadings
                .filter(r => r.readingDate <= safeEndDate)
                .sort((a, b) => b.readingDate.getTime() - a.readingDate.getTime())[0];

            let endNote = '';
            if (!endR) {
                endNote = '无截止日前抄表数据';
            } else if (endR.readingDate < safeEndDate) {
                // If it's not exactly on the end date
                endNote = `截止数取自${dayjs(endR.readingDate).format('YYYY-MM-DD')}`;
            }

            // E. Calculation
            let usage = null;
            let cost = null;

            if (startR && endR) {
                // Ensure Start <= End logically
                if (startR.readingDate <= endR.readingDate) {
                    usage = Number(endR.readingValue) - Number(startR.readingValue);
                    cost = usage * Number(unit.unitPrice);
                } else {
                    startNote += '(起始日期晚于截止日期)';
                }
            }

            // F. Remarks
            const remarks = [startNote, endNote].filter(Boolean).join('; ');

            return {
                name: unit.name,
                totalRecharge: totalRecharge,
                endBalance: endBalance,
                startRead: startR ? Number(startR.readingValue) : null,
                endRead: endR ? Number(endR.readingValue) : null,
                usage: usage,
                cost: cost,
                remarks: remarks
            };
        });

        // 3. Generate Excel
        const worksheet = XLSX.utils.json_to_sheet(rows.map((row, index) => ({
            '序号': index + 1,
            '单位名称': row.name,
            '账户总充费额': row.totalRecharge, // 包含初始 + 充值 (不含转账)
            '截止日账户余额': row.endBalance,  // 基于抄表日重算
            '起始日抄表数': row.startRead,
            '截止日抄表数': row.endRead,
            '结算数': row.usage,
            '结算金额': row.cost,
            '备注': row.remarks
        })));

        // Adjust column widths
        worksheet['!cols'] = [
            { wch: 6 },  // 序号
            { wch: 20 }, // 单位名称
            { wch: 15 }, // 总充费
            { wch: 15 }, // 截止余额
            { wch: 15 }, // 起始数
            { wch: 15 }, // 截止数
            { wch: 10 }, // 结算数
            { wch: 12 }, // 结算金额
            { wch: 40 }  // 备注
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "结算报表");

        // Write to base64 string
        const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

        return { success: true, data: base64 };

    } catch (error) {
        console.error('Export failed:', error);
        return { success: false, error: '导出失败: ' + (error instanceof Error ? error.message : String(error)) };
    }
}
