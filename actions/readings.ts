'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { fetchTemperatureForDate } from '@/lib/weather'

// Helper
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

    const result = await prisma.$transaction(async (tx: any) => {
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
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } })
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
        // Deduct from Balance
        const updatedUnit = await tx.unit.update({
          where: { id: unitId },
          data: {
            accountBalance: { decrement: costAmount },
          },
        })

        // Update Status if negative
        if (Number(updatedUnit.accountBalance) < 0) {
            await tx.unit.update({
                where: { id: unitId },
                data: { status: 'ARREARS' }
            })
        }

        // Create Transaction
        await tx.accountTransaction.create({
          data: {
            unitId,
            type: 'DEDUCTION',
            amount: -costAmount,
            balanceAfter: updatedUnit.accountBalance,
            summary: `${readingDate.toISOString().slice(0, 10)} 抄表扣费`,
            relatedReadingId: reading.id,
            remarks: `用量: ${heatUsage.toFixed(2)} GJ`,
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
        const result = await prisma.$transaction(async (tx: any) => {
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
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function updateReading(readingId: number, data: { readingValue: number }) {
    try {
        await prisma.$transaction(async (tx: any) => {
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
                const unit = await tx.unit.findUnique({ where: { id: reading.unitId } })
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
                const updatedUnit = await tx.unit.update({
                    where: { id: reading.unitId },
                    data: { accountBalance: { decrement: costAmount } }
                })

                await tx.accountTransaction.create({
                    data: {
                        unitId: reading.unitId,
                        type: 'DEDUCTION',
                        amount: -costAmount,
                        balanceAfter: updatedUnit.accountBalance,
                        summary: `${reading.readingDate.toISOString().slice(0, 10)} 抄表扣费 (修改)`,
                        relatedReadingId: reading.id,
                        remarks: `修正用量: ${heatUsage.toFixed(2)} GJ`
                    }
                })
            }
        })

        revalidatePath('/units')
        revalidatePath('/dashboard')
        revalidatePath('/financial')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getUnitReadings(unitId: number) {
  try {
    const readings = await prisma.meterReading.findMany({
      where: { unitId },
      orderBy: { readingDate: 'desc' },
    })
    return { success: true, data: readings.map(serializeReading) }
  } catch (error) {
    return { success: false, error: 'Failed to fetch readings' }
  }
}
