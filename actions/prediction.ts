'use server'

import prisma from '@/lib/prisma'
import * as ss from 'simple-statistics'
import { revalidatePath } from 'next/cache'
import dayjs from 'dayjs'

// const HEATING_START_DATE = '2025-11-15'; // Removed fixed date

import { fetchTemperatureForDate, fetchWeather } from '@/lib/weather'

export async function calculateUnitParams(unitId: number) {
  try {
    // 0. Get Location Settings (Moved up for auto-heal)
    const cityConfig = await getCitySetting()
    const cityInfo = cityConfig.data || { name: '淄博 (默认)', lat: 36.81, lon: 118.05 }

    // 1. Auto-heal: Check for readings with missing temperature and fetch them
    const incompleteReadings = await prisma.meterReading.findMany({
        where: { unitId, dailyAvgTemp: null },
        take: 20 // Limit batch size for performance
    })

    if (incompleteReadings.length > 0) {
        // console.log(`Auto-healing ${incompleteReadings.length} readings for unit ${unitId}`)
        for (const r of incompleteReadings) {
            // Pass lat/lon to avoid repeated config lookups
            const temp = await fetchTemperatureForDate(r.readingDate, cityInfo.lat, cityInfo.lon)
            if (temp !== null) {
                await prisma.meterReading.update({
                    where: { id: r.id },
                    data: { dailyAvgTemp: temp }
                })
            }
        }
    }

    const readings = await prisma.meterReading.findMany({
      where: {
        unitId,
        dailyAvgTemp: { not: null },
        heatUsage: { not: null } // Usage must be calculated (non-null)
      },
      orderBy: { readingDate: 'asc' }
    })

    if (readings.length < 3) return { success: false, error: '数据不足 (至少需要3次有效抄表记录)' }

    // First reading is the start, but we can't calculate interval for it.
    // So we use it as the start point for the next reading.
    let lastDate = dayjs(readings[0].readingDate)

    // Fetch historical weather for parameter calculation
    const start = lastDate;
    const today = dayjs();
    const pastDays = Math.max(0, today.diff(start, 'day') + 5);
    const weatherData = await fetchWeather(cityInfo.lat, cityInfo.lon, 14, pastDays);
    const tempMap = new Map<string, number>();
    weatherData.forEach((w) => tempMap.set(dayjs(w.date).format('YYYY-MM-DD'), w.temp));
    const data: number[][] = []
    // Start loop from second reading
    for (let i = 1; i < readings.length; i++) {
        const r = readings[i]
        const currentDate = dayjs(r.readingDate)

        // Skip if date is invalid or unordered (shouldn't happen with DB sort)
        if (currentDate.isBefore(lastDate)) continue;

        const days = currentDate.diff(lastDate, 'day')
        if (days > 0) {
            const dailyHeat = Number(r.heatUsage) / days

            // Calculate average temperature for this specific interval
            let tempSum = 0;
            let tempCount = 0;
            for (let j = 0; j < days; j++) {
                const d = lastDate.add(j + 1, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                const temp = tempMap.get(dateStr);

                if (temp !== undefined) {
                    tempSum += temp;
                    tempCount++;
                }
            }

            // Use calculated average temp from weather API if available (more precise than reading snapshot)
            // Fallback to reading's dailyAvgTemp if no weather data found
            const intervalAvgTemp = tempCount > 0 ? tempSum / tempCount : Number(r.dailyAvgTemp);

            data.push([intervalAvgTemp, dailyHeat])
        }
        lastDate = currentDate
    }

    if (data.length < 3) return { success: false, error: 'Not enough valid interval data' }

    // Linear Regression: y = mx + b
    // y = DailyHeat, x = Temp
    const regression = ss.linearRegression(data)
    const line = ss.linearRegressionLine(regression)
    const r2 = ss.rSquared(data, line)

    // Requirement Formula: DailyHeat = BaseHeat + (BaseTemp - Temp) * Coeff
    // DailyHeat = BaseHeat + BaseTemp*Coeff - Coeff*Temp
    // Compare with y = b + mx
    // m = -Coeff  => Coeff = -m
    // b = BaseHeat + BaseTemp*Coeff  => BaseHeat = b - BaseTemp*Coeff

    // Default BaseTemp = 15
    const baseTemp = 15.0
    const coeff = -regression.m
    const baseHeat = regression.b - (baseTemp * coeff)

    // Update Unit
    await prisma.unit.update({
      where: { id: unitId },
      data: {
        tempCoeff: coeff,
        baseHeat: baseHeat,
        baseTemp: baseTemp,
      }
    })

    revalidatePath(`/units/${unitId}`)
    return { success: true, data: { coeff, baseHeat, r2 } }

  } catch (error) {
    console.error(error)
    return { success: false, error: 'Calculation failed' }
  }
}

// Open-Meteo API for historical/forecast weather
import { getCitySetting } from './settings'


export async function getPrediction(unitId: number, forceRefresh: boolean = false) {
  try {
    // 1. Get Unit Params
    const unit = await prisma.unit.findUnique({
        where: { id: unitId },
        include: { childUnits: true, parentUnit: true }
    })

    if (!unit) return { success: false, error: 'Unit not found' }

    // Case A: Child Unit -> Delegate to Parent for Forecast, but keep Self History
    if (unit.parentUnitId) {
        const parentPred = await getPrediction(unit.parentUnitId, forceRefresh)

        // Fetch Self History
        const selfHistory = []
        try {
             // 1.5 Get Historical Readings (Self)
            const readings = await prisma.meterReading.findMany({
                where: {
                    unitId,
                    dailyAvgTemp: { not: null },
                    heatUsage: { not: null }
                },
                orderBy: { readingDate: 'asc' }
            })

            // Re-use history generation logic (simplified/extracted ideally, but inline for now)
            if (readings.length > 0) {
                 const cityConfig = await getCitySetting()
                 const cityInfo = cityConfig.data || { name: '淄博 (默认)', lat: 36.81, lon: 118.05 }

                 // Fetch past weather for history context
                 const start = dayjs(readings[0].readingDate)
                 const today = dayjs()
                 const pastDays = Math.max(0, today.diff(start, 'day') + 5)
                 const weatherData = await fetchWeather(cityInfo.lat, cityInfo.lon, 14, pastDays)
                 const tempMap = new Map<string, number>()
                 weatherData.forEach((w) => tempMap.set(dayjs(w.date).format('YYYY-MM-DD'), w.temp))

                 let lastDate = start
                 for (let i = 1; i < readings.length; i++) {
                    const r = readings[i]
                    const currentDate = dayjs(r.readingDate)
                    if (currentDate.isBefore(start)) continue
                    if (Number(r.heatUsage) <= 0) continue

                    const days = currentDate.diff(lastDate, 'day')
                    if (days > 0) {
                        const totalActualHeat = Number(r.heatUsage)
                        const avgDaily = totalActualHeat / days
                        for (let j = 0; j < days; j++) {
                             const d = lastDate.add(j + 1, 'day')
                             const dateStr = d.format('YYYY-MM-DD')
                             let temp = tempMap.get(dateStr)
                             if (temp === undefined) temp = Number(r.dailyAvgTemp)

                             selfHistory.push({
                                date: dateStr,
                                temp: temp,
                                dailyHeat: avgDaily, // Simplified strict average for display robustness
                                type: 'history'
                             })
                        }
                    }
                    lastDate = currentDate
                 }
            }
        } catch (e) {
            console.error('Child history fetch failed', e)
        }

        if (parentPred.success) {
            return {
                ...parentPred,
                data: {
                    ...parentPred.data,
                    history: selfHistory.length > 0 ? selfHistory : parentPred.data.history, // Prefer self history
                    isChild: true,
                    parentName: unit.parentUnit?.name,
                    unitName: unit.name
                }
            }
        }
        return parentPred
    }

    // Case B: Parent or Standalone
    // Aggregate Params
    let totalBaseHeat = unit.baseHeat || 0
    let totalTempCoeff = unit.tempCoeff || 0
    let hasParams = (unit.baseHeat !== null && unit.tempCoeff !== null)
    let incompleteData = false

    if (unit.childUnits.length > 0) {
        for (const child of unit.childUnits) {
            totalBaseHeat += child.baseHeat || 0
            totalTempCoeff += child.tempCoeff || 0
            if (child.baseHeat !== null) hasParams = true // At least one unit has params
            else incompleteData = true
        }
    }

    if (!hasParams) {
        return { success: false, error: 'Unit parameters not set (please calculate params for self or children)' }
    }

    // 1. Check Cache
    if (!forceRefresh) {
        const cache = await prisma.unitPrediction.findUnique({ where: { unitId } });
        if (cache) {
            try {
                const cachedData = JSON.parse(cache.data);
                // Check if balance matches roughly
                if (Math.abs(cachedData.currentBalance - Number(unit.accountBalance)) < 0.01) {
                    return { success: true, data: cachedData };
                }
            } catch {
                // Ignore cache error
            }
        }
    }

    // ... (rest of the logic)

    // 1.5 Get Historical Readings (Self Only for History Chart - Limitation accepted)
    const readings = await prisma.meterReading.findMany({
        where: {
            unitId,
            dailyAvgTemp: { not: null },
            heatUsage: { not: null }
        },
        orderBy: { readingDate: 'asc' }
    })

    // 2. Get Location Settings
    const cityConfig = await getCitySetting()
    const cityInfo = cityConfig.data || { name: '淄博 (默认)', lat: 36.81, lon: 118.05 }

    // 3. Real Weather Forecast + History
    // Calculate needed past days
    let start = dayjs();
    if (readings.length > 0) {
        start = dayjs(readings[0].readingDate);
    } else {
        // If no readings (e.g. Pure Parent wallet), start from today
        start = dayjs().subtract(1, 'day');
    }

    const today = dayjs();
    const pastDays = Math.max(0, today.diff(start, 'day') + 5);

    const weatherData = await fetchWeather(cityInfo.lat, cityInfo.lon, 14, pastDays);

    // Map date -> temp
    const tempMap = new Map<string, number>();
    weatherData.forEach((w) => tempMap.set(dayjs(w.date).format('YYYY-MM-DD'), w.temp));

    // Generate History Points (Dense)
    const history: any[] = [];
    let lastDate = start;

    // Only generate history if we have readings
    if (readings.length > 0) {
        // Start loop from second reading
        for (let i = 1; i < readings.length; i++) {
            // ... (existing history logic)
            // Copying existing logic manually is risky if I can't see it all.
            // I'll use the original code structure but replace the 'unit.baseHeat' access with local variables.
            // But wait, history logic uses `unit.baseHeat` for theoretical distribution?
            // Yes: `let demand = baseHeat + (baseTemp - temp) * tempCoeff;`
            // For History (Self), we should use SELF params?
            // Yes, history chart compares Actual Self Usage vs Theoretical Self Usage.
            // So use `unit.baseHeat` (Self) not Total.
            // If Self has no params (Pure Parent), history chart might be empty or invalid.
            // That's acceptable.

            // I'll keep history logic using `unit.baseHeat` / `unit.tempCoeff` (Self).
            // But I need to preserve the code block I am replacing.

            // The Edit tool replaces a block. I need to be careful.
            // My previous Read showed:
            // Lines 140-144: Param check.
            // Lines 147-160: Cache check.
            // Lines 165-172: Get Readings.
            // Lines 175-176: Location.
            // Lines 180: `if (readings.length === 0)` -> Return error.
            // I should change this: If readings.length === 0, we can still do Forecast (if children exist).

            // So I need to rewrite from line 139 to end of function mostly.

            // ...
        }
    }


    // Start loop from second reading
    for (let i = 1; i < readings.length; i++) {
        const r = readings[i];
        const currentDate = dayjs(r.readingDate);

        if (currentDate.isBefore(start)) continue;
        if (Number(r.heatUsage) <= 0) continue;

        const days = currentDate.diff(lastDate, 'day');
        if (days > 0) {
            // Calculate heat usage distribution based on temperature
            // Use existing coefficients or temporary ones if not yet calculated
            const baseTemp = unit.baseTemp ? Number(unit.baseTemp) : 15.0;
            const tempCoeff = unit.tempCoeff ? Number(unit.tempCoeff) : 0;
            const baseHeat = unit.baseHeat ? Number(unit.baseHeat) : 0;

            // First pass: Calculate theoretical heat demand for each day based on temperature
            // Q_theory = Base + (15 - T) * K
            const dailyDemands: number[] = [];
            let totalDemand = 0;

            for (let j = 0; j < days; j++) {
                const d = lastDate.add(j + 1, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                let temp = tempMap.get(dateStr);
                if (temp === undefined) temp = Number(r.dailyAvgTemp);

                // If we have valid coefficients, calculate weighted demand
                if (unit.tempCoeff && unit.baseHeat) {
                    let demand = baseHeat + (baseTemp - temp) * tempCoeff;
                    if (demand < 0) demand = 0; // Heat cannot be negative
                    // Ensure a minimum base demand to avoid division by zero if all days are warm
                    // and to distribute some heat even on warm days if total usage > 0
                    if (demand === 0 && Number(r.heatUsage) > 0) demand = 0.1;

                    dailyDemands.push(demand);
                    totalDemand += demand;
                } else {
                    // Fallback: Even distribution if no coefficients yet
                    dailyDemands.push(1);
                    totalDemand += 1;
                }
            }

            // Second pass: Distribute actual total usage proportional to theoretical demand
            const totalActualHeat = Number(r.heatUsage);

            for (let j = 0; j < days; j++) {
                const d = lastDate.add(j + 1, 'day');
                const dateStr = d.format('YYYY-MM-DD');
                let temp = tempMap.get(dateStr);
                if (temp === undefined) temp = Number(r.dailyAvgTemp);

                // Proportional allocation: ActualDayHeat = TotalActual * (DayTheory / TotalTheory)
                // If totalDemand is 0 (unlikely with fallback), default to even split
                const dailyShare = totalDemand > 0 ? dailyDemands[j] / totalDemand : (1 / days);
                const distributedHeat = totalActualHeat * dailyShare;

                history.push({
                    date: dateStr,
                    temp: temp,
                    dailyHeat: distributedHeat,
                    type: 'history'
                });
            }
        }
        lastDate = currentDate;
    }

    // 4. Forecast Logic
    // Filter weatherData for future
    const forecast = weatherData.filter((w) => dayjs(w.date).isAfter(today.subtract(1, 'day')));

    // If API fails or we need more days (API usually gives 7-14 days free), extend it
    // ... existing logic ...
    const currentLength = forecast.length

    // Extend to 120 days
    for (let i = currentLength; i < 120; i++) {
        const date = new Date()
        date.setDate(new Date().getDate() + i) // Fix: relative to today
        // Simulate temp: cold in Jan/Feb, getting warmer
        // Simple curve
        const month = date.getMonth() // 0-11
        let temp = 0
        if (month === 0) temp = -5 // Jan
        else if (month === 1) temp = -2 // Feb
        else if (month === 2) temp = 5 // Mar
        else temp = 10

        // Add random variation
        temp += (Math.random() * 4 - 2)

        forecast.push({ date, temp })
    }

    // 4. Iterate Balance
    let currentBalance = Number(unit.accountBalance)
    let remainingDays = 0
    let estimatedDate = null
    const predictionLog = []

    // Calculate Monthly Averages for display
    const monthlyTemps: {[key: string]: {sum: number, count: number}} = {}

    for (const day of forecast) {
        let totalDailyCost = 0
        let totalDailyHeat = 0

        // 1. Calculate Self Load & Cost
        if (unit.baseHeat !== null && unit.tempCoeff !== null) {
            let selfHeat = Number(unit.baseHeat) + (Number(unit.baseTemp) - day.temp) * Number(unit.tempCoeff)
            if (selfHeat < 0) selfHeat = 0
            totalDailyHeat += selfHeat
            totalDailyCost += selfHeat * Number(unit.unitPrice)
        }

        // 2. Calculate Children Load & Cost
        if (unit.childUnits && unit.childUnits.length > 0) {
            for (const child of unit.childUnits) {
                if (child.baseHeat !== null && child.tempCoeff !== null) {
                    let childHeat = Number(child.baseHeat) + (Number(child.baseTemp) - day.temp) * Number(child.tempCoeff)
                    if (childHeat < 0) childHeat = 0
                    totalDailyHeat += childHeat
                    totalDailyCost += childHeat * Number(child.unitPrice)
                }
            }
        }

        currentBalance -= totalDailyCost

        predictionLog.push({
            date: dayjs(day.date).format('YYYY-MM-DD'),
            temp: day.temp.toFixed(1),
            heat: totalDailyHeat.toFixed(2),
            cost: totalDailyCost.toFixed(2),
            balance: currentBalance.toFixed(2)
        })

        if (currentBalance <= 0 && !estimatedDate) {
            estimatedDate = day.date
        }

        if (currentBalance > 0) {
            remainingDays++
        }

        // Monthly Stats
        const monthKey = dayjs(day.date).format('YYYY-MM')
        if (!monthlyTemps[monthKey]) monthlyTemps[monthKey] = { sum: 0, count: 0 }
        monthlyTemps[monthKey].sum += day.temp
        monthlyTemps[monthKey].count += 1
    }

    if (!estimatedDate && currentBalance > 0) {
        // Balance lasts more than 120 days
        const lastDay = new Date()
        lastDay.setDate(new Date().getDate() + 120)
        estimatedDate = lastDay
    }

    // Format monthly stats
    const monthlyStats = Object.keys(monthlyTemps).map(k => ({
        month: k,
        avgTemp: (monthlyTemps[k].sum / monthlyTemps[k].count).toFixed(1)
    }))

    // 5. Cache the Result
    const resultData = {
        currentBalance: Number(unit.accountBalance),
        remainingDays,
        incompleteData,
        estimatedDate: estimatedDate ? (estimatedDate instanceof Date ? estimatedDate.toISOString().slice(0, 10) : new Date(estimatedDate).toISOString().slice(0, 10)) : null,
        log: predictionLog,
        history,
        cityInfo,
        monthlyStats
    };

    await prisma.unitPrediction.upsert({
        where: { unitId },
        update: { data: JSON.stringify(resultData) },
        create: { unitId, data: JSON.stringify(resultData) }
    });

    return {
        success: true,
        data: resultData
    }

  } catch (error) {
    console.error('Prediction Error:', error);
    return { success: false, error: 'Prediction failed: ' + (error instanceof Error ? error.message : String(error)) }
  }
}

export async function calculateBatchParams(unitIds: number[]) {
    try {
        let successCount = 0
        let failCount = 0

        for (const id of unitIds) {
            // Call existing single calc logic
            // Note: calculateUnitParams requires min 3 valid readings.
            // We run it sequentially to avoid DB lock/congestion on heavy calc? No, linear regression is fast.
            // Sequential is fine for stability.
            const res = await calculateUnitParams(id)
            if (res.success) successCount++
            else failCount++
        }

        revalidatePath('/units')
        return { success: true, successCount, failCount }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function calculateAllUnitsParams() {
    try {
        const units = await prisma.unit.findMany({ select: { id: true } })
        const unitIds = units.map((u) => u.id)
        return await calculateBatchParams(unitIds)
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
}

