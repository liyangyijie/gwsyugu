'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serializeTransaction = (t: any) => ({
  ...t,
  amount: Number(t.amount),
  balanceAfter: Number(t.balanceAfter),
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serializeUnit = (u: any) => ({
  ...u,
  accountBalance: Number(u.accountBalance),
  initialBalance: Number(u.initialBalance),
  unitPrice: Number(u.unitPrice),
  // Add other decimal fields if necessary
})

// Helper to update status for a payment group (Cascade Update)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updatePaymentGroupStatus(tx: any, unitId: number) {
    const unit = await tx.unit.findUnique({ where: { id: unitId } })
    if (!unit) return

    // Find Root (Billing Unit)
    const billingUnitId = unit.parentUnitId ? unit.parentUnitId : unit.id

    // We need the balance of the billing unit
    const billingUnit = unit.parentUnitId
        ? await tx.unit.findUnique({ where: { id: billingUnitId } })
        : unit

    if (!billingUnit) return

    const newStatus = Number(billingUnit.accountBalance) < 0 ? 'ARREARS' : 'NORMAL'

    // Update Root
    await tx.unit.update({
        where: { id: billingUnitId },
        data: { status: newStatus }
    })

    // Update all children
    await tx.unit.updateMany({
        where: { parentUnitId: billingUnitId },
        data: { status: newStatus }
    })
}

export async function rechargeUnit(unitId: number, amount: number, date: Date, remarks?: string) {
  try {
    // Check Shared Account
    const targetUnit = await prisma.unit.findUnique({ where: { id: unitId } })
    if (targetUnit?.parentUnitId) {
        return rechargeUnit(targetUnit.parentUnitId, amount, date, `代充值: ${targetUnit.name} - ${remarks || ''}`)
    }

    const result = await prisma.$transaction(async (tx) => {
        // Update Balance
        const updatedUnit = await tx.unit.update({
            where: { id: unitId },
            data: { accountBalance: { increment: amount } },
        })

        // Check Status (Cascade)
        await updatePaymentGroupStatus(tx, unitId)

        // Create Transaction
        await tx.accountTransaction.create({
            data: {
                unitId,
                type: 'RECHARGE',
                date,
                amount,
                balanceAfter: updatedUnit.accountBalance,
                summary: '预付款充值',
                remarks,
            }
        })

        return updatedUnit
    })

        revalidatePath(`/units/${unitId}`)
    revalidatePath('/dashboard')
    revalidatePath('/financial')
    return { success: true, data: serializeUnit(result) }
  } catch (error) {
    console.error(error)
    return { success: false, error: 'Recharge failed' }
  }
}

export async function adjustBalance(unitId: number, type: 'ADD' | 'SUBTRACT', amount: number, date: Date, reason: string) {
    const adjustmentAmount = type === 'ADD' ? amount : -amount

    try {
        const targetUnit = await prisma.unit.findUnique({ where: { id: unitId } })
        if (targetUnit?.parentUnitId) {
            return adjustBalance(targetUnit.parentUnitId, type, amount, date, `代调整: ${targetUnit.name} - ${reason}`)
        }

        const result = await prisma.$transaction(async (tx) => {
            const updatedUnit = await tx.unit.update({
                where: { id: unitId },
                data: { accountBalance: { increment: adjustmentAmount } },
            })

            // Update Status check (Cascade)
            await updatePaymentGroupStatus(tx, unitId)

            await tx.accountTransaction.create({
                data: {
                    unitId,
                    type: 'ADJUSTMENT',
                    date,
                    amount: adjustmentAmount,
                    balanceAfter: updatedUnit.accountBalance,
                    summary: '余额调整',
                    remarks: reason,
                }
            })
            return updatedUnit
        })
        revalidatePath(`/units/${unitId}`)
        revalidatePath('/dashboard')
        revalidatePath('/financial')
        return { success: true, data: serializeUnit(result) }
    } catch {
        return { success: false, error: 'Adjustment failed' }
    }
}

export async function getAllTransactions(params: {
    page?: number;
    pageSize?: number;
    type?: string;
    startDate?: string;
    endDate?: string;
} = {}) {
    const { page = 1, pageSize = 50, type, startDate, endDate } = params;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (type) {
        where.type = type;
    }

    if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate);
        if (endDate) where.date.lte = new Date(endDate);
    }

    try {
        const [transactions, total] = await prisma.$transaction([
            prisma.accountTransaction.findMany({
                where,
                include: { unit: { select: { name: true } } },
                orderBy: { date: 'desc' },
                skip,
                take: pageSize
            }),
            prisma.accountTransaction.count({ where })
        ]);

        return {
            success: true,
            data: transactions.map(serializeTransaction),
            total,
            page,
            pageSize
        }
    } catch {
        return { success: false, error: 'Failed' }
    }
}

export async function deleteTransaction(transactionId: number) {
    try {
        await prisma.$transaction(async (tx) => {
            const transaction = await tx.accountTransaction.findUnique({
                where: { id: transactionId }
            })
            if (!transaction) throw new Error('Transaction not found')

            // Revert Balance
            // If it was a deduction (-amount), we add it back (+abs(amount))
            // If it was a recharge (+amount), we subtract it (-amount)
            // Ideally we just subtract the amount from the balance
            // e.g. Balance was 100, Tx +50 -> 150. Delete Tx -> 150 - 50 = 100.
            // Balance was 100, Tx -20 -> 80. Delete Tx -> 80 - (-20) = 100.
            // So operation is always: balance - amount

            await tx.unit.update({
                where: { id: transaction.unitId },
                data: { accountBalance: { decrement: transaction.amount } }
            })

            // Update Status check (Cascade)
            await updatePaymentGroupStatus(tx, transaction.unitId)

            // If it was a Reading Deduction, we might need to reset the reading status?
            // "relatedReadingId"
            if (transaction.relatedReadingId) {
                // If we delete the financial record of a reading, the reading becomes "Unbilled"?
                // Or do we disallow deleting reading-related transactions directly?
                // User requirement: "Financial details should also be deletable".
                // Assuming safety: Mark reading as not billed so it can be re-billed or deleted?
                await tx.meterReading.update({
                    where: { id: transaction.relatedReadingId },
                    data: { isBilled: false }
                })
            }

            await tx.accountTransaction.delete({
                where: { id: transactionId }
            })
        })

        revalidatePath('/financial')
        revalidatePath('/units')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
}
