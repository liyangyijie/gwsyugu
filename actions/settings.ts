'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { fetchTemperatureForDate } from '@/lib/weather'

export async function saveCitySetting(lat: number, lon: number, cityName: string) {
  try {
    // Ensure numbers
    const latNum = Number(lat)
    const lonNum = Number(lon)

    if (isNaN(latNum) || isNaN(lonNum)) {
        throw new Error('Invalid coordinates: lat/lon must be numbers')
    }

    if (!cityName) {
        // Allow empty city name, but maybe default it?
        // cityName = '未命名'
    }

    const value = JSON.stringify({ lat: latNum, lon: lonNum, name: cityName || '' })

    await prisma.systemSetting.upsert({
      where: { key: 'city_config' },
      update: { value },
      create: { key: 'city_config', value }
    })

    revalidatePath('/settings')
    return { success: true }
  } catch (error) {
    console.error('Save settings error:', error)
    return { success: false, error: 'Failed to save settings: ' + (error instanceof Error ? error.message : String(error)) }
  }
}

export async function getCitySetting() {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'city_config' }
    })

    if (setting) {
      return { success: true, data: JSON.parse(setting.value) }
    }
    // Default to Zibo
    return { success: true, data: { lat: 36.81, lon: 118.05, name: '淄博 (默认)' } }
  } catch {
    return { success: false, error: 'Failed to fetch settings' }
  }
}

export async function testWeather(lat: number, lon: number) {
  try {
    const today = new Date()
    const temp = await fetchTemperatureForDate(today, lat, lon)
    if (temp !== null) {
      return { success: true, temp }
    }
    return { success: false, error: 'API returned no data' }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
