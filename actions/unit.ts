'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Unit, MeterReading, AccountTransaction, Prisma } from '@prisma/client'

// Helper to serialize Decimal to number
type UnitWithRelations = Unit & {
  readings?: MeterReading[]
  transactions?: AccountTransaction[]
  parentUnit?: Unit | null
  childUnits?: Unit[]
}

const serializeUnit = (unit: UnitWithRelations | null) => {
  if (!unit) return null
  return {
    ...unit,
    unitPrice: Number(unit.unitPrice),
    accountBalance: Number(unit.accountBalance),
    initialBalance: Number(unit.initialBalance),
    // Handle nested arrays if present
    readings: unit.readings?.map((r) => ({
      ...r,
      readingValue: Number(r.readingValue),
      heatUsage: r.heatUsage ? Number(r.heatUsage) : null,
      costAmount: r.costAmount ? Number(r.costAmount) : null,
    })),
    transactions: unit.transactions?.map((t) => ({
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
    const result = await prisma.$transaction(async (tx) => {
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
  } catch (error) {
    console.error('Failed to create unit:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: '单位名称已存在，请使用其他名称' }
    }
    return { success: false, error: 'Failed to create unit' }
  }
}

export async function getUnits(params: {
  page?: number;
  pageSize?: number;
  query?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
} = {}) {
  const { page = 1, pageSize = 10, query = '', sortField, sortOrder } = params;
  const skip = (page - 1) * pageSize;

  const where: Prisma.UnitWhereInput = {};
  if (query) {
    where.OR = [
      { name: { contains: query } },
      { code: { contains: query } }
    ];
  }

  const orderBy: Prisma.UnitOrderByWithRelationInput = {};
  // If sorting by code, we handle it in memory for natural sort
  if (sortField && sortOrder && sortField !== 'code') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (orderBy as any)[sortField] = sortOrder;
  } else if (!sortField) {
    orderBy.createdAt = 'desc';
  }

  try {
    // Special handling for 'code' sorting (Natural Sort)
    if (sortField === 'code') {
        const [allUnits, total] = await prisma.$transaction([
            prisma.unit.findMany({ where }), // Fetch all matching query
            prisma.unit.count({ where })
        ]);

        // Natural Sort
        allUnits.sort((a, b) => {
            const codeA = a.code || '';
            const codeB = b.code || '';
            const cmp = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
            return sortOrder === 'asc' ? cmp : -cmp;
        });

        // Slice for Pagination
        const pagedUnits = allUnits.slice(skip, skip + pageSize);
        return { success: true, data: pagedUnits.map(serializeUnit), total, page, pageSize };
    }

    const [units, total] = await prisma.$transaction([
      prisma.unit.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
      }),
      prisma.unit.count({ where })
    ])
    return { success: true, data: units.map(serializeUnit), total, page, pageSize }
  } catch (error) {
    console.error('Failed to fetch units:', error)
    return { success: false, error: 'Failed to fetch units: ' + (error instanceof Error ? error.message : String(error)) }
  }
}

export async function getUnitById(id: number) {
  try {
    const unit = await prisma.unit.findUnique({
      where: { id },
      include: {
        readings: { orderBy: { readingDate: 'desc' }, take: 20 },
        transactions: { orderBy: { date: 'desc' }, take: 20 },
        parentUnit: true,
        childUnits: { select: { id: true, name: true } },
      },
    })
    if (!unit) return { success: false, error: 'Unit not found' }
    return { success: true, data: serializeUnit(unit) }
  } catch {
    return { success: false, error: 'Failed to fetch unit' }
  }
}

export async function updateUnit(id: number, data: Prisma.UnitUpdateInput & { parentUnitId?: number | null }) {
    const { parentUnitId, ...otherData } = data;

    // If parentUnitId is not involved in this update, use simple update
    if (parentUnitId === undefined) {
        try {
            const unit = await prisma.unit.update({
                where: { id },
                data: otherData,
            })
            revalidatePath(`/units/${id}`)
            revalidatePath('/units')
            return { success: true, data: serializeUnit(unit) }
        } catch {
            return { success: false, error: 'Failed to update unit' }
        }
    }

    // Handle Parent Change with Transaction
    try {
        const result = await prisma.$transaction(async (tx) => {
            const currentUnit = await tx.unit.findUnique({
                where: { id },
                include: { childUnits: true }
            });

            if (!currentUnit) throw new Error("Unit not found");

            // 1. Validation
            if (parentUnitId) {
                if (parentUnitId === id) throw new Error("无法将自己设为父单位");

                // Check if target is one of my children (Circular)
                const isMyChild = currentUnit.childUnits.some(c => c.id === parentUnitId);
                if (isMyChild) throw new Error("无法将子单位设为父单位 (循环依赖)");

                const targetParent = await tx.unit.findUnique({ where: { id: parentUnitId } });
                if (!targetParent) throw new Error("目标父单位不存在");

                // Check max depth (Target must not have a parent)
                if (targetParent.parentUnitId) throw new Error("目标单位已有所属父单位 (最多支持二级层级)");
            }

            // 2. Fund Transfer Logic (Only when Linking to a NEW parent)
            if (parentUnitId && parentUnitId !== currentUnit.parentUnitId) {
                const balanceToTransfer = Number(currentUnit.accountBalance);

                // Only transfer if there is a positive/negative balance
                if (balanceToTransfer !== 0) {
                    // Deduct from Child
                    await tx.accountTransaction.create({
                        data: {
                            unitId: id,
                            type: 'ADJUSTMENT',
                            amount: -balanceToTransfer,
                            balanceAfter: 0,
                            summary: '资金合并',
                            remarks: `绑定共用账户，余额转入 Parent ID: ${parentUnitId}`,
                        }
                    });

                    // Add to Parent
                    const parent = await tx.unit.findUnique({ where: { id: parentUnitId }});
                    const parentNewBalance = Number(parent!.accountBalance) + balanceToTransfer;

                    await tx.accountTransaction.create({
                        data: {
                            unitId: parentUnitId,
                            type: 'ADJUSTMENT',
                            amount: balanceToTransfer,
                            balanceAfter: parentNewBalance,
                            summary: '资金合并',
                            remarks: `子账户绑定转入，来源 Unit ID: ${id}`,
                        }
                    });

                    // Update Parent Balance
                    await tx.unit.update({
                        where: { id: parentUnitId },
                        data: { accountBalance: parentNewBalance }
                    });
                }
            }
            // Note: If Unlinking (parentUnitId === null), we don't transfer funds back automatically.
            // The child starts with 0 (or whatever it had, which should be 0).
            // The parent keeps the funds.

            // 3. Update the Unit
            const updatedUnit = await tx.unit.update({
                where: { id },
                data: {
                    ...otherData,
                    parentUnitId: parentUnitId,
                    // If we just linked (parentUnitId not null), balance is 0 (we transferred it).
                    // If we unlinked, balance is whatever it was (likely 0).
                    accountBalance: parentUnitId ? 0 : currentUnit.accountBalance
                }
            });

            return updatedUnit;
        });

        revalidatePath(`/units/${id}`)
        revalidatePath('/units')
        return { success: true, data: serializeUnit(result) }

    } catch (error) {
        console.error('Update unit failed:', error);
        return { success: false, error: '更新失败: ' + (error instanceof Error ? error.message : String(error)) }
    }
}

export async function getPotentialParents(currentUnitId: number) {
  try {
    const units = await prisma.unit.findMany({
      where: {
        id: { not: currentUnitId },
        parentUnitId: null
      },
      select: { id: true, name: true, code: true }
    })
    return { success: true, data: units }
  } catch {
    return { success: false, error: 'Failed to fetch parents' }
  }
}

export async function deleteUnit(id: number) {
    try {
        await prisma.$transaction(async (tx) => {
            // Delete Transactions first
            await tx.accountTransaction.deleteMany({
                where: { unitId: id }
            })

            // Delete Readings
            await tx.meterReading.deleteMany({
                where: { unitId: id }
            })

            // Delete Prediction
            await tx.unitPrediction.deleteMany({
                where: { unitId: id }
            })

            // Unlink Children (Set parentUnitId to null)
            await tx.unit.updateMany({
                where: { parentUnitId: id },
                data: { parentUnitId: null }
            })

            // Delete Unit
            await tx.unit.delete({
                where: { id }
            })
        })

        revalidatePath('/units')
        return { success: true }
    } catch (error) {
        console.error('Delete unit error:', error)
        return { success: false, error: '删除失败: ' + (error instanceof Error ? error.message : String(error)) }
    }
}

export async function deleteUnits(ids: number[]) {
    try {
        await prisma.$transaction(async (tx) => {
            // Bulk delete Logic
            // 1. Delete Transactions
            await tx.accountTransaction.deleteMany({
                where: { unitId: { in: ids } }
            })
            // 2. Delete Readings
            await tx.meterReading.deleteMany({
                where: { unitId: { in: ids } }
            })

            // 3. Delete Predictions
            await tx.unitPrediction.deleteMany({
                where: { unitId: { in: ids } }
            })

            // 4. Unlink Children
            await tx.unit.updateMany({
                where: { parentUnitId: { in: ids } },
                data: { parentUnitId: null }
            })

            // 5. Delete Units
            await tx.unit.deleteMany({
                where: { id: { in: ids } }
            })
        })

        revalidatePath('/units')
        revalidatePath('/dashboard')
        revalidatePath('/financial')
        return { success: true }
    } catch (error) {
        console.error('Batch delete error:', error)
        return { success: false, error: '批量删除失败: ' + (error instanceof Error ? error.message : String(error)) }
    }
}
