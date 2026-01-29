'use server'
import prisma from '@/lib/prisma'

export async function getDashboardStats() {
    try {
        const units = await prisma.unit.findMany({
            include: { prediction: true }
        })
        let totalBalance = 0
        let arrearsCount = 0
        let arrearsAmount = 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const warningUnits: any[] = []

        units.forEach((u) => {
            const bal = Number(u.accountBalance)
            totalBalance += bal
            if (bal < 0) {
                arrearsCount++
                arrearsAmount += Math.abs(bal)
            }

            if (u.prediction) {
                try {
                    const predData = JSON.parse(u.prediction.data)
                    // Warning threshold: less than 15 days? Or 30?
                    // Let's say 30 days is warning.
                    if (predData.remainingDays < 30) {
                        warningUnits.push({
                            id: u.id,
                            name: u.name,
                            remainingDays: predData.remainingDays,
                            estimatedDate: predData.estimatedDate
                        })
                    }
                } catch {
                    // ignore parse error
                }
            }
        })

        // Sort by remaining days (ascending)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warningUnits.sort((a: any, b: any) => a.remainingDays - b.remainingDays)

        return {
            success: true,
            data: {
                totalBalance,
                arrearsCount,
                arrearsAmount,
                unitCount: units.length,
                warningUnits
            }
        }
    } catch {
        return { success: false, error: 'Failed' }
    }
}
