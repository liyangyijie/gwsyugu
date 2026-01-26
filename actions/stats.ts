'use server'
import prisma from '@/lib/prisma'

export async function getDashboardStats() {
    try {
        const units = await prisma.unit.findMany()
        let totalBalance = 0
        let arrearsCount = 0
        let arrearsAmount = 0

        units.forEach((u: any) => {
            const bal = Number(u.accountBalance)
            totalBalance += bal
            if (bal < 0) {
                arrearsCount++
                arrearsAmount += Math.abs(bal)
            }
        })

        return {
            success: true,
            data: {
                totalBalance,
                arrearsCount,
                arrearsAmount,
                unitCount: units.length
            }
        }
    } catch (error) {
        return { success: false, error: 'Failed' }
    }
}
