import { expect, test, vi, describe, beforeEach } from 'vitest'
import { getUnitBalancesAtDate } from '../snapshot'
import prisma from '@/lib/prisma'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    unit: {
      findMany: vi.fn(),
    },
    accountTransaction: {
      groupBy: vi.fn(),
    },
  },
}))

describe('getUnitBalancesAtDate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('should calculate balances correctly using simple aggregation', async () => {
    const mockDate = '2026-01-15'

    // Mock Units
    const mockUnits = [
      { id: 1, name: 'Unit 1', code: '001', initialBalance: 100, parentUnitId: null },
      { id: 2, name: 'Unit 2', code: '002', initialBalance: 50, parentUnitId: 1 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.unit.findMany).mockResolvedValue(mockUnits as any)

    // Mock Transactions Aggregation
    const mockSums = [
      { unitId: 1, _sum: { amount: 150 } },
      { unitId: 2, _sum: { amount: -10 } },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.accountTransaction.groupBy).mockResolvedValue(mockSums as any)

    const result = await getUnitBalancesAtDate(mockDate)

    expect(result.success).toBe(true)
    const data = result.data!

    // Unit 1: 100 + 150 = 250
    expect(data[0].id).toBe(1)
    expect(data[0].balance).toBe(250)
    expect(data[0].status).toBe('正常')

    // Unit 2: 50 - 10 = 40
    // Parent ID is 1. Parent Balance is 250.
    expect(data[1].id).toBe(2)
    expect(data[1].balance).toBe(40)
    expect(data[1].status).toBe('正常') // Status derived from Parent
  })

  test('should handle arrears correctly', async () => {
      const mockDate = '2026-01-15'
      const mockUnits = [{ id: 1, name: 'Unit 1', initialBalance: 0, parentUnitId: null }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.unit.findMany).mockResolvedValue(mockUnits as any)

      const mockSums = [{ unitId: 1, _sum: { amount: -10 } }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(prisma.accountTransaction.groupBy).mockResolvedValue(mockSums as any)

      const result = await getUnitBalancesAtDate(mockDate)
      expect(result.data![0].status).toBe('欠费')
      expect(result.data![0].balance).toBe(-10)
  })
})
