import prisma from '@/lib/prisma'
import dayjs from 'dayjs'

async function getConfig() {
    try {
        const s = await prisma.systemSetting.findUnique({ where: { key: 'city_config' } })
        if (s) return JSON.parse(s.value)
    } catch {
        // console.error("Config fetch failed")
    }
    return { lat: 36.81, lon: 118.05 } // Default Zibo
}

export async function fetchWeather(lat?: number, lon?: number, days: number = 7, pastDays: number = 0) {
    if (!lat || !lon) {
        const config = await getConfig()
        lat = lat || config.lat
        lon = lon || config.lon
    }

    const today = dayjs().startOf('day')
    const startDate = today.subtract(pastDays, 'day')
    const endDate = today.add(days, 'day')

    // 1. Fetch from DB Cache first
    const dbWeather = await prisma.dailyWeather.findMany({
        where: {
            date: {
                gte: startDate.format('YYYY-MM-DD'),
                lte: endDate.format('YYYY-MM-DD')
            }
        }
    })

    const weatherMap = new Map<string, number>()
    dbWeather.forEach(w => weatherMap.set(w.date, w.temp))

    const missingDates: string[] = []
    let currentDate = startDate
    const totalDays = pastDays + days + 1;

    for (let i = 0; i < totalDays; i++) {
        const dateStr = currentDate.format('YYYY-MM-DD')
        if (!weatherMap.has(dateStr)) {
            missingDates.push(dateStr)
        }
        currentDate = currentDate.add(1, 'day')
    }

    // 2. If missing data, fetch from API
    // Optimization: If many missing, fetch a range.
    if (missingDates.length > 0) {
        // Simple strategy: Fetch whole range from API if there are gaps to keep logic simple
        // In prod, could identify sub-ranges.

        try {
             // For past dates far behind, use Archive API if needed, but Forecast API usually covers recent 90 days.
             // If pastDays is large, might need Archive API logic. For now assuming <90 days.
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&start_date=${startDate.format('YYYY-MM-DD')}&end_date=${endDate.format('YYYY-MM-DD')}`)
            const data = await res.json()

            if (data.daily && data.daily.time) {
                 const upserts = data.daily.time.map((time: string, index: number) => {
                    const max = data.daily.temperature_2m_max[index]
                    const min = data.daily.temperature_2m_min[index]
                    if (max === null || min === null) return null;
                    const avg = (max + min) / 2
                    return {
                        date: time,
                        temp: avg,
                        minTemp: min,
                        maxTemp: max
                    }
                }).filter((x: any) => x !== null)

                // Save to DB
                for (const w of upserts) {
                    await prisma.dailyWeather.upsert({
                        where: { date: w.date },
                        update: { temp: w.temp, minTemp: w.minTemp, maxTemp: w.maxTemp },
                        create: { date: w.date, temp: w.temp, minTemp: w.minTemp, maxTemp: w.maxTemp }
                    })
                    weatherMap.set(w.date, w.temp)
                }
            }
        } catch (e) {
            console.error('Weather API Error:', e)
        }
    }

    // 3. Construct result
    const result = []
    currentDate = startDate
    for (let i = 0; i < totalDays; i++) {
        const dateStr = currentDate.format('YYYY-MM-DD')
        const temp = weatherMap.get(dateStr)
        if (temp !== undefined) {
             result.push({ date: currentDate.toDate(), temp })
        }
        currentDate = currentDate.add(1, 'day')
    }
    return result
}

// Fetch historical weather for a specific date (DB First)
export async function fetchTemperatureForDate(date: Date, lat?: number, lon?: number) {
    if (!lat || !lon) {
        const config = await getConfig()
        lat = lat || config.lat
        lon = lon || config.lon
    }

    const dateStr = date.toISOString().slice(0, 10)

    // Check DB
    const cache = await prisma.dailyWeather.findUnique({ where: { date: dateStr } })
    if (cache) return cache.temp

    // Fetch from API
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&start_date=${dateStr}&end_date=${dateStr}`)
        const data = await res.json()

        if (data.daily && data.daily.time && data.daily.time.length > 0) {
            const max = data.daily.temperature_2m_max[0]
            const min = data.daily.temperature_2m_min[0]
             if (max !== null && min !== null) {
                const avg = (max + min) / 2
                // Cache it
                await prisma.dailyWeather.upsert({
                    where: { date: dateStr },
                    update: { temp: avg, minTemp: min, maxTemp: max },
                    create: { date: dateStr, temp: avg, minTemp: min, maxTemp: max }
                })
                return avg
            }
        }
        return null
    } catch (e) {
        console.error('Fetch Temp Error:', e)
        return null
    }
}
