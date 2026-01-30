'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { updatePaymentGroupStatus } from './transactions'

interface ImportUnitData {
  name: string
  code?: string
  contactInfo?: string
  area?: number | string
  unitPrice?: number | string
  initialBalance?: number | string
  baseTemp?: number | string
  paymentParent?: string
}

export async function importUnits(unitsData: ImportUnitData[]) {
  try {
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    // Pre-processing: Aggregate Balances & Map Parents
    const balanceMap = new Map<string, number>()
    const parentMap = new Map<string, string>()

    for (const data of unitsData) {
        if (!data.name) continue

        // Balance Aggregation
        // If paymentParent is set, this initial balance belongs to Parent.
        // If not, it belongs to self.
        const targetName = data.paymentParent ? String(data.paymentParent) : String(data.name)
        const amount = data.initialBalance ? Number(data.initialBalance) : 0
        if (amount !== 0) {
            balanceMap.set(targetName, (balanceMap.get(targetName) || 0) + amount)
        }

        // Parent Mapping
        if (data.paymentParent) {
            parentMap.set(String(data.name), String(data.paymentParent))
        }
    }

    // Pass 1: Create/Update Units (Basic Info)
    for (const data of unitsData) {
      try {
        if (!data.name) throw new Error('Unit name is required')

        const existingUnit = await prisma.unit.findUnique({
          where: { name: String(data.name) }
        })

        if (existingUnit) {
          // Update existing unit (ignore balance/parent for now)
          await prisma.unit.update({
            where: { id: existingUnit.id },
            data: {
              code: data.code ? String(data.code) : undefined,
              contactInfo: data.contactInfo ? String(data.contactInfo) : undefined,
              area: data.area ? Number(data.area) : undefined,
              unitPrice: data.unitPrice ? Number(data.unitPrice) : undefined,
              baseTemp: data.baseTemp ? Number(data.baseTemp) : undefined,
            }
          })
        } else {
          // Create new unit (Balance = 0 initially)
          await prisma.unit.create({
            data: {
              name: String(data.name),
              code: data.code ? String(data.code) : null,
              contactInfo: data.contactInfo ? String(data.contactInfo) : null,
              area: data.area ? Number(data.area) : null,
              unitPrice: data.unitPrice ? Number(data.unitPrice) : 88.0,
              baseTemp: data.baseTemp ? Number(data.baseTemp) : 15.0,
              initialBalance: 0,
              accountBalance: 0,
            }
          })
        }
        successCount++
      } catch (error) {
        errorCount++
        errors.push(`Row ${data.name || 'unknown'}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Pass 2: Link Parents
    for (const [childName, parentName] of parentMap) {
        try {
            // Check Hierarchy Depth: Parent cannot be a child of another unit
            const parent = await prisma.unit.findUnique({
                where: { name: parentName },
                include: { parentUnit: true }
            })

            if (parent) {
                if (parent.parentUnitId) {
                    errors.push(`Hierarchy Error: Unit '${parentName}' is already a child of '${parent.parentUnit?.name}'. Max hierarchy depth is 1 (Parent->Child).`)
                    continue
                }

                // Check if Parent is also a Child in the current import batch
                if (parentMap.has(parentName)) {
                     errors.push(`Hierarchy Error: Unit '${parentName}' is being set as a child of '${parentMap.get(parentName)}' in this batch. Max hierarchy depth is 1.`)
                     continue
                }

                await prisma.unit.update({
                    where: { name: childName },
                    data: { parentUnitId: parent.id }
                })
            } else {
                errors.push(`Linking Error: Parent unit '${parentName}' not found for child '${childName}'`)
            }
        } catch (e) {
            errors.push(`Linking Error '${childName}': ${e}`)
        }
    }

    // Pass 3: Set Initial Balances (Aggregated)
    for (const [unitName, amount] of balanceMap) {
        try {
            const unit = await prisma.unit.findUnique({ where: { name: unitName } })
            if (unit) {
                await prisma.$transaction(async (tx) => {
                    // Check if INITIAL transaction exists
                    const initTx = await tx.accountTransaction.findFirst({
                        where: { unitId: unit.id, type: 'INITIAL' }
                    })

                    if (!initTx) {
                        // Create INITIAL transaction and set balance
                        // Note: We add to existing balance because we initialized to 0 in create,
                        // or kept existing in update. Ideally for initial import, it's 0.
                        await tx.unit.update({
                            where: { id: unit.id },
                            data: {
                                accountBalance: { increment: amount },
                                initialBalance: amount
                            }
                        })

                        await tx.accountTransaction.create({
                            data: {
                                unitId: unit.id,
                                type: 'INITIAL',
                                amount: amount,
                                balanceAfter: Number(unit.accountBalance) + amount, // approx
                                summary: '初始余额 (批量归集)',
                                remarks: '导入自动创建'
                            }
                        })
                    }
                })
            }
        } catch (e) {
            errors.push(`Balance Error '${unitName}': ${e}`)
        }
    }

    revalidatePath('/units')
    revalidatePath('/dashboard')
    revalidatePath('/financial')
    return { success: true, successCount, errorCount, errors }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

import { fetchTemperatureForDate } from '@/lib/weather'

interface ImportReadingData {
  unitName: string
  readingDate: string | Date
  readingValue: number | string
  dailyAvgTemp?: number | string
  remarks?: string
}

export async function importReadings(readingsData: ImportReadingData[]) {
  try {
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

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
        await prisma.$transaction(async (tx) => {
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
                if (!currentUnit) throw new Error('Unit not found during transaction')
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
                // Determine Billing Unit (Parent or Self)
                const currentUnit = await tx.unit.findUnique({ where: { id: unit.id } })
                if (!currentUnit) throw new Error('Unit not found')

                const billingUnitId = currentUnit.parentUnitId ? currentUnit.parentUnitId : currentUnit.id

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
                        summary: `${readingDate.toISOString().slice(0, 10)} 抄表扣费 (导入)`,
                        relatedReadingId: reading.id,
                        remarks: currentUnit.parentUnitId ? `来源: ${currentUnit.name} (用量: ${heatUsage.toFixed(2)} GJ)` : `用量: ${heatUsage.toFixed(2)} GJ`,
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
      } catch (error) {
        errorCount++
        errors.push(`Row ${data.unitName} - ${data.readingDate}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    revalidatePath('/units')
    revalidatePath('/dashboard')
    revalidatePath('/financial')
    return { success: true, successCount, errorCount, errors }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function getAllUnitsForExport() {
  const units = await prisma.unit.findMany({
    orderBy: { name: 'asc' },
    include: { parentUnit: true }
  })
  return units
}

export async function getReadingsForExport() {
  const readings = await prisma.meterReading.findMany({
    orderBy: { readingDate: 'desc' },
    include: {
      unit: {
        select: { name: true }
      }
    }
  })
  return readings
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
