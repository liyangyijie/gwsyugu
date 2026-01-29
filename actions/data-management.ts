'use server'

import prisma from '@/lib/prisma'
import { Unit } from '@prisma/client'
import { revalidatePath } from 'next/cache'

export async function importUnits(unitsData: any[]) {
  try {
    let successCount = 0
    let errorCount = 0
    let errors: string[] = []

    for (const data of unitsData) {
      try {
        // Validate required fields
        if (!data.name) {
          throw new Error('Unit name is required')
        }

        // Check if unit exists
        const existingUnit = await prisma.unit.findUnique({
          where: { name: String(data.name) }
        })

        if (existingUnit) {
          // Update existing unit
          const initialBalance = data.initialBalance !== undefined ? Number(data.initialBalance) : undefined

          await prisma.$transaction(async (tx: any) => {
            // Update Unit Fields
            await tx.unit.update({
              where: { id: existingUnit.id },
              data: {
                code: data.code ? String(data.code) : undefined,
                contactInfo: data.contactInfo ? String(data.contactInfo) : undefined,
                area: data.area ? Number(data.area) : undefined,
                unitPrice: data.unitPrice ? Number(data.unitPrice) : undefined,
                baseTemp: data.baseTemp ? Number(data.baseTemp) : undefined,
                // Only update initialBalance if provided. Note: accountBalance is usually dynamic so we don't overwrite it blindly on update unless we are resetting?
                // Let's assume re-import might want to fix initialBalance
                initialBalance: initialBalance
              }
            })

            // Check if INITIAL transaction exists
            // If data.initialBalance is provided and > 0, we ensure there is an INITIAL transaction
            if (initialBalance !== undefined && initialBalance !== 0) {
                 const initTx = await tx.accountTransaction.findFirst({
                     where: {
                         unitId: existingUnit.id,
                         type: 'INITIAL'
                     }
                 })

                 if (!initTx) {
                     // Create missing INITIAL transaction (Retroactive fix)
                     // Note: We don't change accountBalance here to avoid messing up running balance logic,
                     // or we assume if no initial tx existed, maybe the balance wasn't set correctly?
                     // Safe approach: Create transaction record only for reporting, but don't touch accountBalance (assuming user managed it or it's 0)
                     // OR: If accountBalance is 0 (or close), maybe we should set it?
                     // Let's just create the record so it appears in reports.
                     await tx.accountTransaction.create({
                        data: {
                          unitId: existingUnit.id,
                          type: 'INITIAL',
                          amount: initialBalance,
                          balanceAfter: initialBalance, // This might be inaccurate if there are other txs, but for INITIAL it represents the start state
                          summary: '初始余额 (补录)',
                          remarks: '导入修复自动创建',
                        }
                      })
                 }
            }
          })
        } else {
          // Create new unit with transaction
          await prisma.$transaction(async (tx: any) => {
            const initialBalance = data.initialBalance ? Number(data.initialBalance) : 0

            const newUnit = await tx.unit.create({
              data: {
                name: String(data.name),
                code: data.code ? String(data.code) : null,
                contactInfo: data.contactInfo ? String(data.contactInfo) : null,
                area: data.area ? Number(data.area) : null,
                unitPrice: data.unitPrice ? Number(data.unitPrice) : 88.0,
                baseTemp: data.baseTemp ? Number(data.baseTemp) : 15.0,
                initialBalance: initialBalance,
                accountBalance: initialBalance,
              }
            })

            // Create Initial Transaction
            await tx.accountTransaction.create({
              data: {
                unitId: newUnit.id,
                type: 'INITIAL',
                amount: initialBalance,
                balanceAfter: initialBalance,
                summary: '初始余额',
                remarks: '批量导入自动创建',
              }
            })
          })
        }
        successCount++
      } catch (error: any) {
        errorCount++
        errors.push(`Row ${data.name || 'unknown'}: ${error.message}`)
      }
    }

    revalidatePath('/units')
    revalidatePath('/dashboard')
    revalidatePath('/financial')
    revalidatePath('/units')
    revalidatePath('/dashboard')
    revalidatePath('/financial')
    return { success: true, successCount, errorCount, errors }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

import { fetchTemperatureForDate } from '@/lib/weather'

export async function importReadings(readingsData: any[]) {
  try {
    let successCount = 0
    let errorCount = 0
    let errors: string[] = []

    // Sort readings by date ascending to ensure correct billing sequence
    readingsData.sort((a, b) => new Date(a.readingDate).getTime() - new Date(b.readingDate).getTime())

    for (const data of readingsData) {
      try {
        // ... (validation) ...
        if (!data.unitName || !data.readingDate || !data.readingValue) {
          throw new Error('Missing required fields (unitName, readingDate, readingValue)')
        }

        // Find Unit
        const unit = await prisma.unit.findUnique({
          where: { name: String(data.unitName) }
        })

        if (!unit) {
          throw new Error(`Unit '${data.unitName}' not found`)
        }

        const readingDate = new Date(data.readingDate)
        const readingValue = Number(data.readingValue)

        // Auto-fetch temperature if missing
        let dailyAvgTemp = data.dailyAvgTemp ? Number(data.dailyAvgTemp) : null
        if (dailyAvgTemp === null) {
            const fetchedTemp = await fetchTemperatureForDate(readingDate)
            if (fetchedTemp !== null) {
                dailyAvgTemp = fetchedTemp
            }
        }

        // Use transaction for billing logic (Same as saveMeterReading)
        await prisma.$transaction(async (tx: any) => {
            // ... (rest of logic) ...
            // 1. Find Previous Reading (closest before this date)
            const prevReading = await tx.meterReading.findFirst({
                where: {
                    unitId: unit.id,
                    readingDate: { lt: readingDate },
                },
                orderBy: { readingDate: 'desc' },
            })

            let heatUsage = 0
            let costAmount = 0

            if (prevReading) {
                heatUsage = readingValue - Number(prevReading.readingValue)
                if (heatUsage < 0) heatUsage = 0
                // Re-fetch unit inside transaction to get latest price/balance
                const currentUnit = await tx.unit.findUnique({ where: { id: unit.id } })
                costAmount = heatUsage * Number(currentUnit.unitPrice)
            }

            // 2. Create Reading
            const reading = await tx.meterReading.create({
                data: {
                    unitId: unit.id,
                    readingDate,
                    readingValue,
                    dailyAvgTemp, // Use the fetched/provided temp
                    heatUsage,
                    costAmount,
                    isBilled: false, // Will set to true if billed
                    remarks: data.remarks ? String(data.remarks) : '批量导入',
                },
            })

            // 3. Billing Logic
            if (costAmount > 0) {
                const updatedUnit = await tx.unit.update({
                    where: { id: unit.id },
                    data: {
                        accountBalance: { decrement: costAmount },
                    },
                })

                // Update Status if negative
                if (Number(updatedUnit.accountBalance) < 0) {
                    await tx.unit.update({ where: { id: unit.id }, data: { status: 'ARREARS' } })
                }

                // Create Transaction
                await tx.accountTransaction.create({
                    data: {
                        unitId: unit.id,
                        type: 'DEDUCTION',
                        amount: -costAmount,
                        balanceAfter: updatedUnit.accountBalance,
                        summary: `${readingDate.toISOString().slice(0, 10)} 抄表扣费 (导入)`,
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
        })

        successCount++
      } catch (error: any) {
        errorCount++
        errors.push(`Row ${data.unitName} - ${data.readingDate}: ${error.message}`)
      }
    }

    revalidatePath('/units')
    revalidatePath('/dashboard')
    revalidatePath('/financial')
    return { success: true, successCount, errorCount, errors }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getAllUnitsForExport() {
  const units = await prisma.unit.findMany({
    orderBy: { name: 'asc' }
  })
  return units
}

export async function getFinancialReportForExport() {
  // Get all transactions with unit info
  const transactions = await prisma.accountTransaction.findMany({
    include: {
      unit: {
        select: {
          name: true,
          code: true
        }
      }
    },
    orderBy: { date: 'desc' }
  })
  return transactions
}
