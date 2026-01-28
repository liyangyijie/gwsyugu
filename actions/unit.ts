'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// Helper to serialize Decimal to number
const serializeUnit = (unit: any) => {
  if (!unit) return null
  return {
    ...unit,
    unitPrice: Number(unit.unitPrice),
    accountBalance: Number(unit.accountBalance),
    initialBalance: Number(unit.initialBalance),
    // Handle nested arrays if present
    readings: unit.readings?.map((r: any) => ({
      ...r,
      readingValue: Number(r.readingValue),
      heatUsage: r.heatUsage ? Number(r.heatUsage) : null,
      costAmount: r.costAmount ? Number(r.costAmount) : null,
    })),
    transactions: unit.transactions?.map((t: any) => ({
      ...t,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
    }))
  }
}

export async function createUnit(data: {
  name: string
  code?: string
  contactInfo?: string
  area?: number
  unitPrice: number
  initialBalance: number
  baseTemp?: number
  remarks?: string
}) {
  const { initialBalance, ...rest } = data

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      // Create Unit
      const unit = await tx.unit.create({
        data: {
          ...rest,
          accountBalance: initialBalance,
          initialBalance: initialBalance,
        },
      })

      // Create Initial Balance Transaction
      await tx.accountTransaction.create({
        data: {
          unitId: unit.id,
          type: 'INITIAL',
          amount: initialBalance,
          balanceAfter: initialBalance,
          summary: '初始余额',
          remarks: '创建单位时设置',
        },
      })

      return unit
    })

    revalidatePath('/units')
    revalidatePath('/dashboard')
    revalidatePath('/financial')
    return { success: true, data: serializeUnit(result) }
  } catch (error: any) {
    console.error('Failed to create unit:', error)
    if (error.code === 'P2002') {
        return { success: false, error: '单位名称已存在，请使用其他名称' }
    }
    return { success: false, error: 'Failed to create unit' }
  }
}

export async function getUnits() {
  try {
    const units = await prisma.unit.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return { success: true, data: units.map(serializeUnit) }
  } catch (error) {
    console.error('Failed to fetch units:', error)
    return { success: false, error: 'Failed to fetch units' }
  }
}

export async function getUnitById(id: number) {
  try {
    const unit = await prisma.unit.findUnique({
      where: { id },
      include: {
        readings: { orderBy: { readingDate: 'desc' }, take: 20 },
        transactions: { orderBy: { date: 'desc' }, take: 20 },
      },
    })
    if (!unit) return { success: false, error: 'Unit not found' }
    return { success: true, data: serializeUnit(unit) }
  } catch (error) {
    return { success: false, error: 'Failed to fetch unit' }
  }
}

export async function updateUnit(id: number, data: any) {
    try {
        const unit = await prisma.unit.update({
            where: { id },
            data,
        })
        revalidatePath(`/units/${id}`)
        revalidatePath('/units')
        return { success: true, data: serializeUnit(unit) }
    } catch (error) {
        return { success: false, error: 'Failed to update unit' }
    }
}

export async function deleteUnit(id: number) {
    try {
        await prisma.$transaction(async (tx: any) => {
            // Delete Transactions first (Foreign Key constraints usually, though Prisma handles relations if configured, explicit is safer here for clarity)
            await tx.accountTransaction.deleteMany({
                where: { unitId: id }
            })

            // Delete Readings
            await tx.meterReading.deleteMany({
                where: { unitId: id }
            })

            // Delete Unit
            await tx.unit.delete({
                where: { id }
            })
        })

        revalidatePath('/units')
        return { success: true }
    } catch (error: any) {
        console.error('Delete unit error:', error)
        return { success: false, error: '删除失败: ' + error.message }
    }
}
