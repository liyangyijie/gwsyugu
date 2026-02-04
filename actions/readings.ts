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
      // 0. Fetch Unit Info (Top-level scope to avoid ReferenceError)
      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: unitId },
        include: { parentUnit: true }
      })

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

        // Calculate Cost (Using top-level unit)
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
                // BUG FIX: Refund the transaction's owner (which might be parent), NOT the reading's unit.
                const refundUnitId = transaction.unitId;

                await tx.unit.update({
                    where: { id: refundUnitId },
                    data: { accountBalance: { increment: Math.abs(Number(transaction.amount)) } } // Revert deduction (add back)
                })

                await updatePaymentGroupStatus(tx, refundUnitId)
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
                // BUG FIX: Refund the transaction's owner
                const refundUnitId = oldTx.unitId;

                await tx.unit.update({
                    where: { id: refundUnitId },
                    data: { accountBalance: { increment: Math.abs(Number(oldTx.amount)) } }
                })

                await updatePaymentGroupStatus(tx, refundUnitId)
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

export async function getUnitsForBatchEntry() {
  try {
    const units = await prisma.unit.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        parentUnitId: true, // Needed for concurrency check
        readings: {
          orderBy: { readingDate: 'desc' },
          take: 1,
          select: { readingValue: true, readingDate: true }
        }
      },
      orderBy: { code: 'asc' } // Usually walk by code
    });

    return {
      success: true,
      data: units.map((u: any) => ({
        id: u.id,
        name: u.name,
        code: u.code,
        parentUnitId: u.parentUnitId,
        lastReading: u.readings[0] ? Number(u.readings[0].readingValue) : 0,
        lastReadingDate: u.readings[0]?.readingDate
      }))
    };
  } catch {
    return { success: false, error: 'Failed to fetch units for batch entry' };
  }
}

export async function submitBatchReadings(readings: { unitId: number, readingValue: number, readingDate: Date }[]) {
  if (readings.length === 0) return { success: true, successCount: 0 };

  // 1. Pre-fetch temperature
  const date = readings[0].readingDate;
  const temp = await fetchTemperatureForDate(date);

  let successCount = 0;
  const errors: string[] = [];

  // 2. Identify Units with Parent (must execute sequentially to avoid transaction lock on parent)
  // We need to know which units have parents.
  // The 'readings' array only has unitId.
  // We should fetch this info or assume we need to fetch it.
  // Ideally, passing this info from frontend would be faster, but let's query safe.
  const unitIds = readings.map(r => r.unitId);
  const unitsInfo = await prisma.unit.findMany({
      where: { id: { in: unitIds } },
      select: { id: true, parentUnitId: true }
  });

  const unitMap = new Map(unitsInfo.map(u => [u.id, u]));

  // Split into independent and dependent
  const independentReadings: typeof readings = [];
  const dependentReadings: typeof readings = [];

  for (const r of readings) {
      const u = unitMap.get(r.unitId);
      // Independent: No parent, AND is not a parent itself (hard to check "is not parent" without more queries)
      // Actually, if it IS a parent, it's fine to process concurrently as long as NO OTHER child of the SAME parent is processed.
      // But if it IS a parent, saving its reading might affect its own balance.
      // The risk is: Child A updates Parent P, Child B updates Parent P. Lock contention.
      // Or: Parent P updates Parent P. Child A updates Parent P. Lock contention.
      //
      // Safe Strategy:
      // Group by "Billing Account ID".
      // - If unit has parent, Billing Account = Parent ID.
      // - If unit has no parent, Billing Account = Unit ID.
      //
      // If multiple readings target the same Billing Account, they must be sequential.
      // If they target different Billing Accounts, they can be concurrent.

      if (u?.parentUnitId) {
          // Has parent, so billing account is parent. High risk of collision if multiple children.
          dependentReadings.push(r);
      } else {
          // No parent. But wait, what if it IS a parent and we are also processing its children?
          // If we process a Child (updates P) and P (updates P) at same time -> Collision.
          //
          // For simplicity in this optimization phase:
          // 1. Independent Units (No parent, and ideally we assume no children in this batch or low risk).
          //    Let's just optimize the "No Parent" case which is majority.
          independentReadings.push(r);
      }
  }

  // 3. Process Independent Units Concurrently (Limit 10)
  const processReading = async (r: typeof readings[0]) => {
       const t = r.readingDate.getTime() === date.getTime() ? temp : undefined;
       const res = await saveMeterReading({ ...r, dailyAvgTemp: t ?? undefined });
       return { r, res };
  };

  // Chunk independent readings
  const CHUNK_SIZE = 10;
  for (let i = 0; i < independentReadings.length; i += CHUNK_SIZE) {
      const chunk = independentReadings.slice(i, i + CHUNK_SIZE);
      const results = await Promise.all(chunk.map(processReading));

      results.forEach(({ r, res }) => {
          if (res.success) successCount++;
          else errors.push(`Unit ID ${r.unitId}: ${res.error}`);
      });
  }

  // 4. Process Dependent/Complex Units Sequentially
  for (const r of dependentReadings) {
      const t = r.readingDate.getTime() === date.getTime() ? temp : undefined;
      const res = await saveMeterReading({ ...r, dailyAvgTemp: t ?? undefined });
      if (res.success) successCount++;
      else errors.push(`Unit ID ${r.unitId}: ${res.error}`);
  }

  revalidatePath('/units');
  revalidatePath('/dashboard');
  revalidatePath('/financial');

  return {
      success: errors.length === 0,
      successCount,
      errors
  };
}
