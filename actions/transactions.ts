'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

const serializeTransaction = (t: any) => ({
  ...t,
  amount: Number(t.amount),
  balanceAfter: Number(t.balanceAfter),
})

const serializeUnit = (u: any) => ({
  ...u,
  accountBalance: Number(u.accountBalance),
  initialBalance: Number(u.initialBalance),
  unitPrice: Number(u.unitPrice),
  // Add other decimal fields if necessary
})

export async function rechargeUnit(unitId: number, amount: number, date: Date, remarks?: string) {
  try {
    const result = await prisma.$transaction(async (tx: any) => {
        // Update Balance
        const updatedUnit = await tx.unit.update({
            where: { id: unitId },
            data: { accountBalance: { increment: amount } },
        })

        // Check Status (Remove ARREARS if positive)
        if (Number(updatedUnit.accountBalance) >= 0) {
            await tx.unit.update({ where: { id: unitId }, data: { status: 'NORMAL' } })
        }

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
    return { success: true, data: serializeUnit(result) }
  } catch (error) {
    console.error(error)
    return { success: false, error: 'Recharge failed' }
  }
}

export async function adjustBalance(unitId: number, type: 'ADD' | 'SUBTRACT', amount: number, date: Date, reason: string) {
    const adjustmentAmount = type === 'ADD' ? amount : -amount

    try {
        const result = await prisma.$transaction(async (tx: any) => {
            const updatedUnit = await tx.unit.update({
                where: { id: unitId },
                data: { accountBalance: { increment: adjustmentAmount } },
            })

            // Update Status check
            const newStatus = Number(updatedUnit.accountBalance) < 0 ? 'ARREARS' : 'NORMAL'
            await tx.unit.update({ where: { id: unitId }, data: { status: newStatus } })

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
        return { success: true, data: serializeUnit(result) }
    } catch (error) {
        return { success: false, error: 'Adjustment failed' }
    }
}

export async function getAllTransactions() {
    try {
        const transactions = await prisma.accountTransaction.findMany({
            include: { unit: { select: { name: true } } },
            orderBy: { date: 'desc' },
            take: 200
        })
        return { success: true, data: transactions.map(serializeTransaction) }
    } catch (error) {
        return { success: false, error: 'Failed' }
    }
}

export async function deleteTransaction(transactionId: number) {
    try {
        await prisma.$transaction(async (tx: any) => {
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
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
