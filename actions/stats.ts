'use server'
import prisma from '@/lib/prisma'

export async function getDashboardStats() {
    try {
        const units = await prisma.unit.findMany({
            select: {
                id: true,
                name: true,
                parentUnitId: true,
                accountBalance: true,
                prediction: {
                    select: { data: true }
                },
                parentUnit: {
                    select: {
                        id: true,
                        accountBalance: true,
                        prediction: {
                            select: { data: true }
                        }
                    }
                }
            }
        })
        let totalBalance = 0
        let arrearsCount = 0
        let arrearsAmount = 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const warningUnits: any[] = []

        // Set to track processed parent IDs to avoid double counting balance
        // const processedAccountIds = new Set<number>()

        units.forEach((u) => {
            // Determine effective balance
            const effectiveBalance = Number(u.parentUnit ? u.parentUnit.accountBalance : u.accountBalance)

            // For total balance summation, we must only sum UNIQUE accounts.
            // If u is child, its account is the parent. We should sum parent's balance only once.
            // But 'units' includes both parent and child.
            // Logic:
            // - If u is Independent (no parent): Sum u.accountBalance.
            // - If u is Parent (has children? we don't know easily here, but it acts as independent account): Sum u.accountBalance.
            // - If u is Child (has parent): Do NOT sum (parent is already summed or will be).

            // Wait, if u is Parent, it is just a unit with no parentUnitId (usually).
            // So: if (!u.parentUnitId) -> Add to totalBalance.
            if (!u.parentUnitId) {
                totalBalance += effectiveBalance
            }

            // Arrears Calculation:
            // If the ACCOUNT is in arrears, then the UNIT is in arrears.
            // If A (Parent) is -100. B (Child) uses A.
            // A is in arrears. B is in arrears.
            // We should count BOTH as "Arrears Units" because 2 units are affected.
            // But we should be careful about "Arrears Amount".
            // If we sum A's -100 and B's (effective) -100, we get -200 arrears. This duplicates the debt.

            // Correct logic for Amount:
            // Only sum arrears amount from independent accounts (parents/independents).
            if (!u.parentUnitId) {
                 if (effectiveBalance < 0) {
                    arrearsAmount += Math.abs(effectiveBalance)
                 }
            }

            // Correct logic for Count:
            // If effective balance < 0, this unit is in trouble.
            if (effectiveBalance < 0) {
                arrearsCount++
            }

            // Prediction Warning Logic
            // For Child units, prefer Parent's prediction data if available
            // This ensures shared accounts show consistent warnings
            const predictionSource = (u.parentUnit && u.parentUnit.prediction) ? u.parentUnit.prediction : u.prediction;

            if (predictionSource) {
                try {
                    const predData = JSON.parse(predictionSource.data)
                    // Warning threshold: less than 30 days
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
