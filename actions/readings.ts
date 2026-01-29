'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { fetchTemperatureForDate } from '@/lib/weather'
import { updatePaymentGroupStatus } from './transactions'

// Helper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serializeReading = (r: any) => ({
  ...r,
  readingValue: Number(r.readingValue),
  heatUsage: r.heatUsage ? Number(r.heatUsage) : null,
  costAmount: r.costAmount ? Number(r.costAmount) : null,
})

export async function saveMeterReading(data: {
  unitId: number
  readingDate: Date
  readingValue: number
  dailyAvgTemp?: number // Optional now, will try to fetch if missing
  remarks?: string
}) {
  const { unitId, readingDate, readingValue, remarks } = data
  let { dailyAvgTemp } = data

  try {
    // 0. Auto-fetch temperature if not provided
    if (dailyAvgTemp === undefined || dailyAvgTemp === null) {
      const fetchedTemp = await fetchTemperatureForDate(readingDate)
      if (fetchedTemp !== null) {
        dailyAvgTemp = fetchedTemp
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Find Previous Reading (closest before this date)
      const prevReading = await tx.meterReading.findFirst({
        where: {
          unitId,
          readingDate: { lt: readingDate },
        },
        orderBy: { readingDate: 'desc' },
      })

      let heatUsage = 0
      let costAmount = 0

      if (prevReading) {
        heatUsage = Number(readingValue) - Number(prevReading.readingValue)

        // Prevent negative usage if new reading is lower (meter swap or error?)
        // For now, allow it but warn? Or strictly:
        if (heatUsage < 0) heatUsage = 0

        // Calculate Cost
        const unit = await tx.unit.findUniqueOrThrow({
            where: { id: unitId },
            include: { parentUnit: true }
        })
        costAmount = heatUsage * Number(unit.unitPrice)
      }

      // 2. Create Reading
      const reading = await tx.meterReading.create({
        data: {
          unitId,
          readingDate,
          readingValue,
          dailyAvgTemp: dailyAvgTemp ?? null, // Can still be null if fetch fails
          heatUsage,
          costAmount,
          isBilled: false,
          remarks,
        },
      })

      // 3. Billing Logic
      if (costAmount > 0) {
        const billingUnitId = unit.parentUnitId ? unit.parentUnitId : unit.id

        // Deduct from Balance
        const updatedUnit = await tx.unit.update({
          where: { id: billingUnitId },
          data: {
            accountBalance: { decrement: costAmount },
          },
        })

        // Update Status (Cascade)
        await updatePaymentGroupStatus(tx, billingUnitId)

        // Create Transaction
        await tx.accountTransaction.create({
          data: {
            unitId: billingUnitId,
            type: 'DEDUCTION',
            amount: -costAmount,
            balanceAfter: updatedUnit.accountBalance,
            summary: `${readingDate.toISOString().slice(0, 10)} 抄表扣费`,
            relatedReadingId: reading.id,
            remarks: unit.parentUnitId ? `来源: ${unit.name} (用量: ${heatUsage.toFixed(2)} GJ)` : `用量: ${heatUsage.toFixed(2)} GJ`,
          },
        })

        // Update Reading Billed Status
        await tx.meterReading.update({
          where: { id: reading.id },
          data: { isBilled: true },
        })
      }

      return reading
    })

    revalidatePath(`/units/${unitId}`)
    revalidatePath('/dashboard')
    revalidatePath('/financial')
    return { success: true, data: serializeReading(result) }
  } catch (error) {
    console.error('Failed to save reading:', error)
    return { success: false, error: 'Failed to save reading' }
  }
}

export async function deleteReading(readingId: number) {
    try {
        await prisma.$transaction(async (tx) => {
            // Check if it's the latest reading
            const reading = await tx.meterReading.findUnique({ where: { id: readingId } })
            if (!reading) throw new Error('Reading not found')

            const latestReading = await tx.meterReading.findFirst({
                where: { unitId: reading.unitId },
                orderBy: { readingDate: 'desc' }
            })

            if (latestReading && latestReading.id !== readingId) {
                throw new Error('只能删除最后一次抄表记录')
            }

            // Find transaction
            const transaction = await tx.accountTransaction.findFirst({
                where: { relatedReadingId: readingId }
            })

            // Revert Balance
            if (transaction) {
                await tx.unit.update({
                    where: { id: reading.unitId },
                    data: { accountBalance: { increment: Math.abs(Number(transaction.amount)) } } // Revert deduction (add back)
                })
                await updatePaymentGroupStatus(tx, reading.unitId)
                await tx.accountTransaction.delete({ where: { id: transaction.id } })
            }

            // Delete Reading
            await tx.meterReading.delete({ where: { id: readingId } })

            return true
        })

        revalidatePath('/units')
        revalidatePath('/dashboard')
        revalidatePath('/financial')
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateReading(readingId: number, data: { readingValue: number }) {
    try {
        await prisma.$transaction(async (tx) => {
            // Check if latest
            const reading = await tx.meterReading.findUnique({ where: { id: readingId } })
            if (!reading) throw new Error('Reading not found')

            const latestReading = await tx.meterReading.findFirst({
                where: { unitId: reading.unitId },
                orderBy: { readingDate: 'desc' }
            })

            if (latestReading && latestReading.id !== readingId) {
                throw new Error('只能修改最后一次抄表记录')
            }

            // Re-calculate everything?
            // Simplest way: Delete + Re-create logic manually
            // 1. Revert Old Transaction
            const oldTx = await tx.accountTransaction.findFirst({ where: { relatedReadingId: readingId } })
            if (oldTx) {
                await tx.unit.update({
                    where: { id: reading.unitId },
                    data: { accountBalance: { increment: Math.abs(Number(oldTx.amount)) } }
                })
                await updatePaymentGroupStatus(tx, reading.unitId)
                await tx.accountTransaction.delete({ where: { id: oldTx.id } })
            }

            // 2. Calc New Usage
            const prevReading = await tx.meterReading.findFirst({
                where: {
                    unitId: reading.unitId,
                    readingDate: { lt: reading.readingDate },
                },
                orderBy: { readingDate: 'desc' },
            })

            let heatUsage = 0
            let costAmount = 0

            if (prevReading) {
                heatUsage = Number(data.readingValue) - Number(prevReading.readingValue)
                if (heatUsage < 0) heatUsage = 0
                const unit = await tx.unit.findUnique({ where: { id: reading.unitId }, include: { parentUnit: true } })
                if (!unit) throw new Error('Unit not found')
                costAmount = heatUsage * Number(unit.unitPrice)
            }

            // 3. Update Reading
            await tx.meterReading.update({
                where: { id: readingId },
                data: {
                    readingValue: data.readingValue,
                    heatUsage,
                    costAmount,
                    isBilled: costAmount > 0
                }
            })

            // 4. Create New Transaction
            if (costAmount > 0) {
                // Need to re-fetch unit if not fetched above (in case heatUsage was 0 before but now >0, unlikely as we only enter if prevReading)
                // Actually `unit` variable scope is inside `if (prevReading)`.
                // If `prevReading` is false (first reading), heatUsage is 0, costAmount is 0.
                // So we only care if costAmount > 0, which implies unit was fetched.
                // But wait, `unit` is scoped.
                // Let's refetch unit for billing if needed.
                const unitForBilling = await tx.unit.findUnique({ where: { id: reading.unitId }, include: { parentUnit: true } })
                if (!unitForBilling) throw new Error('Unit not found')

                const billingUnitId = unitForBilling.parentUnitId ? unitForBilling.parentUnitId : unitForBilling.id

                const updatedUnit = await tx.unit.update({
                    where: { id: billingUnitId },
                    data: { accountBalance: { decrement: costAmount } }
                })

                await updatePaymentGroupStatus(tx, billingUnitId)

                await tx.accountTransaction.create({
                    data: {
                        unitId: billingUnitId,
                        type: 'DEDUCTION',
                        amount: -costAmount,
                        balanceAfter: updatedUnit.accountBalance,
                        summary: `${reading.readingDate.toISOString().slice(0, 10)} 抄表扣费 (修改)`,
                        relatedReadingId: reading.id,
                        remarks: unitForBilling.parentUnitId ? `来源: ${unitForBilling.name} (修正用量: ${heatUsage.toFixed(2)} GJ)` : `修正用量: ${heatUsage.toFixed(2)} GJ`
                    }
                })
            }
        })

        revalidatePath('/units')
        revalidatePath('/dashboard')
        revalidatePath('/financial')
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function getUnitReadings(unitId: number) {
  try {
    const readings = await prisma.meterReading.findMany({
      where: { unitId },
      orderBy: { readingDate: 'desc' },
    })
    return { success: true, data: readings.map(serializeReading) }
  } catch {
    return { success: false, error: 'Failed to fetch readings' }
  }
}
