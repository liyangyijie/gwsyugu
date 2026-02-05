import { expect, test, vi, describe, beforeEach } from 'vitest'
import { importUnits } from '../data-management'
import prisma from '@/lib/prisma'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    unit: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    accountTransaction: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('importUnits', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Mock transaction to just run the callback with the prisma mock
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        return cb(prisma)
    })
  })

  test('should use initialBalanceDate when provided', async () => {
    const importData = [{
      name: 'Test Unit',
      initialBalance: 100,
      initialBalanceDate: '2025-01-01'
    }]

    // Pass 1: Create Unit
    // findUnique -> null (Unit doesn't exist)
    vi.mocked(prisma.unit.findUnique).mockResolvedValueOnce(null)

    // Pass 3: Set Balance
    // findUnique -> Unit exists (found by name)
    vi.mocked(prisma.unit.findUnique).mockResolvedValueOnce({ id: 1, name: 'Test Unit', accountBalance: 0 } as any)

    // Inside Transaction:
    // findFirst (initTx) -> null (No initial transaction yet)
    vi.mocked(prisma.accountTransaction.findFirst).mockResolvedValueOnce(null)

    const result = await importUnits(importData)

    expect(result.success).toBe(true)

    // Check if accountTransaction.create was called with correct date
    expect(prisma.accountTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
            type: 'INITIAL',
            amount: 100,
            date: new Date('2025-01-01')
        })
    }))
  })

  test('should fallback to default date when initialBalanceDate is missing', async () => {
    const importData = [{
      name: 'Test Unit 2',
      initialBalance: 200
    }]

    // Pass 1: Create Unit
    // findUnique -> null
    vi.mocked(prisma.unit.findUnique).mockResolvedValueOnce(null)

    // Pass 3: Set Balance
    // findUnique -> Unit exists
    vi.mocked(prisma.unit.findUnique).mockResolvedValueOnce({ id: 2, name: 'Test Unit 2', accountBalance: 0 } as any)

    // Inside Transaction:
    // findFirst (initTx) -> null
    vi.mocked(prisma.accountTransaction.findFirst).mockResolvedValueOnce(null)

    const result = await importUnits(importData)
    expect(result.success).toBe(true)

    // Check if accountTransaction.create was called WITHOUT a specific date (or with undefined)
    // My implementation passes `date: undefined` if missing.
    // However, expect.objectContaining handles undefined checks differently depending on implementation.
    // Let's check the call arguments directly.

    const callArgs = vi.mocked(prisma.accountTransaction.create).mock.calls[0][0]
    const createdData = (callArgs as any).data

    expect(createdData.amount).toBe(200)
    expect(createdData.date).toBeUndefined()
  })
})
