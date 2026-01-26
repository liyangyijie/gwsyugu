'use client'

import React, { useState, useEffect } from 'react'
import { Upload, Button, message, Card, Table, Tabs, Statistic, Alert, Input, Form, InputNumber, Divider, App } from 'antd'
import { UploadOutlined, DownloadOutlined, FileExcelOutlined, EnvironmentOutlined, ExperimentOutlined, SaveOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { importUnits, importReadings, getAllUnitsForExport, getFinancialReportForExport } from '@/actions/data-management'
import { getCitySetting, saveCitySetting, testWeather } from '@/actions/settings'

export default function DataManagementPage() {
  const [loading, setLoading] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)

  // Use message hook
  const [messageApi, contextHolder] = message.useMessage();

  // City Settings State
  const [cityForm] = Form.useForm()
  const [weatherTestResult, setWeatherTestResult] = useState<string | null>(null)

  useEffect(() => {
      // Load settings on mount
      getCitySetting().then(res => {
          if (res.success && res.data) {
              cityForm.setFieldsValue(res.data)
          }
      })
  }, [])

  // -- City Logic --
  const handleSaveCity = async (values: any) => {
      setLoading(true)
      const res = await saveCitySetting(values.lat, values.lon, values.name)
      setLoading(false)
      if (res.success) {
          messageApi.success('系统设置已保存')
      } else {
          messageApi.error('保存失败')
      }
  }

  const handleTestWeather = async () => {
      const values = cityForm.getFieldsValue()
      if (!values.lat || !values.lon) {
          messageApi.warning('请先输入经纬度')
          return
      }
      setLoading(true)
      const res = await testWeather(values.lat, values.lon)
      setLoading(false)
      if (res.success && typeof res.temp === 'number') {
          setWeatherTestResult(`连接成功！当前气温: ${res.temp.toFixed(1)}°C`)
          messageApi.success('测试成功')
      } else {
          setWeatherTestResult(`测试失败: ${res.error || '未知错误'}`)
          messageApi.error('测试失败')
      }
  }

  const handleGetLocation = () => {
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
              (position) => {
                  cityForm.setFieldsValue({
                      lat: position.coords.latitude,
                      lon: position.coords.longitude
                  })
                  messageApi.success('已获取当前位置')
              },
              (error) => messageApi.error('获取位置失败: ' + error.message)
          )
      } else {
          messageApi.error('浏览器不支持地理位置')
      }
  }

  // -- Import Logic --
  const handleImportUnits = async (file: File) => {
    setLoading(true)
    setImportResult(null)
    try {
      const data = await parseExcel(file)
      // Map Chinese headers
      const mappedData = data.map((row: any) => ({
        name: row['单位名称'] || row['name'],
        code: row['编号'] || row['code'],
        contactInfo: row['联系方式'] || row['contactInfo'],
        area: row['面积'] || row['area'],
        unitPrice: row['单价'] || row['unitPrice'],
        baseTemp: row['基准温度'] || row['baseTemp'],
        initialBalance: row['初始余额'] || row['initialBalance'],
      })).filter((r: any) => r.name) // Filter empty rows

      const result = await importUnits(mappedData)
      setImportResult({ type: '单位导入', ...result })
      if (result.success) {
        messageApi.success(`成功导入/更新 ${result.successCount} 个单位`)
      } else {
        messageApi.error(`导入失败: ${result.error}`)
      }
    } catch (err: any) {
      messageApi.error('文件解析失败: ' + err.message)
    } finally {
      setLoading(false)
    }
    return false // Prevent upload
  }

  const handleImportReadings = async (file: File) => {
    setLoading(true)
    setImportResult(null)
    try {
      const data = await parseExcel(file)
      // Map Chinese headers
      const mappedData = data.map((row: any) => ({
        unitName: row['单位名称'] || row['unitName'],
        readingDate: row['抄表日期'] || row['readingDate'],
        // Support both old "读数" and new "热计量表总数"
        readingValue: row['热计量表总数'] || row['读数'] || row['readingValue'],
        dailyAvgTemp: row['日均气温'] || row['dailyAvgTemp'],
        remarks: row['备注'] || row['remarks'],
      })).filter((r: any) => r.unitName && r.readingDate)

      const result = await importReadings(mappedData)
      setImportResult({ type: '抄表记录导入', ...result })
      if (result.success) {
        messageApi.success(`成功导入 ${result.successCount} 条抄表记录`)
      } else {
        messageApi.error(`导入失败: ${result.error}`)
      }
    } catch (err: any) {
      messageApi.error('文件解析失败: ' + err.message)
    } finally {
      setLoading(false)
    }
    return false
  }

  const parseExcel = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = e.target?.result
          const workbook = XLSX.read(data, { type: 'binary' })
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]
          const json = XLSX.utils.sheet_to_json(sheet)
          resolve(json)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = (error) => reject(error)
      reader.readAsBinaryString(file)
    })
  }

  // -- Export Logic --
  const handleExportUnits = async () => {
    setLoading(true)
    try {
      const units = await getAllUnitsForExport()
      // Map to Chinese headers
      const data = units.map((u: any) => ({
        'ID': u.id,
        '单位名称': u.name,
        '编号': u.code,
        '联系方式': u.contactInfo,
        '面积(㎡)': u.area,
        '单价(元/GJ)': Number(u.unitPrice),
        '账户余额(元)': Number(u.accountBalance),
        '基准温度': u.baseTemp,
        '基准热量': u.baseHeat,
        '温度系数': u.tempCoeff,
        '状态': u.status === 'NORMAL' ? '正常' : '欠费',
        '创建时间': new Date(u.createdAt).toLocaleDateString()
      }))

      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '单位列表')
      XLSX.writeFile(wb, `单位信息导出_${new Date().toISOString().split('T')[0]}.xlsx`)
      messageApi.success('单位信息导出成功')
    } catch (err: any) {
      messageApi.error('导出失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleExportFinancials = async () => {
    setLoading(true)
    try {
      const transactions = await getFinancialReportForExport()
      // Flatten data for Excel with Chinese headers
      const flatData = transactions.map(t => ({
        '交易ID': t.id,
        '日期': new Date(t.date).toLocaleDateString(),
        '单位名称': t.unit.name,
        '单位编号': t.unit.code,
        '交易类型': t.type === 'INITIAL' ? '初始余额' :
                   t.type === 'RECHARGE' ? '充值' :
                   t.type === 'DEDUCTION' ? '扣费' :
                   t.type === 'ADJUSTMENT' ? '调整' : t.type,
        '金额(元)': Number(t.amount),
        '变动后余额(元)': Number(t.balanceAfter),
        '摘要': t.summary,
        '备注': t.remarks
      }))

      const ws = XLSX.utils.json_to_sheet(flatData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '财务流水')
      XLSX.writeFile(wb, `财务报表_${new Date().toISOString().split('T')[0]}.xlsx`)
      messageApi.success('财务报表导出成功')
    } catch (err: any) {
      messageApi.error('导出失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // -- Template Download --
  const downloadUnitTemplate = () => {
    const template = [
      { '单位名称': '示例单位', '编号': '001', '联系方式': '13800138000', '面积': 100, '单价': 88, '基准温度': 15, '初始余额': 0 }
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '模版')
    XLSX.writeFile(wb, '单位导入模版.xlsx')
  }

  const downloadReadingTemplate = () => {
    const template = [
      { '单位名称': '示例单位', '抄表日期': '2023-01-01', '热计量表总数': 1000, '日均气温': 5, '备注': '' }
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '模版')
    XLSX.writeFile(wb, '抄表记录导入模版.xlsx')
  }

  return (
    <div className="space-y-6">
      {contextHolder}
      <h1 className="text-2xl font-bold mb-4">系统设置 (Settings)</h1>

      <div className="grid grid-cols-1 gap-6">
        {/* City Settings */}
        <Card title="气象参数设置" className="shadow-md">
            <Form layout="inline" form={cityForm} onFinish={handleSaveCity}>
                <Form.Item name="name" label="城市名称">
                    <Input placeholder="例如: 北京" />
                </Form.Item>
                <Form.Item name="lat" label="纬度 (Lat)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: 120 }} />
                </Form.Item>
                <Form.Item name="lon" label="经度 (Lon)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: 120 }} />
                </Form.Item>
                <Form.Item>
                    <Button icon={<EnvironmentOutlined />} onClick={handleGetLocation}>定位</Button>
                </Form.Item>
                <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>保存配置</Button>
                </Form.Item>
                <Form.Item>
                    <Button icon={<ExperimentOutlined />} onClick={handleTestWeather} loading={loading}>测试连接</Button>
                </Form.Item>
            </Form>
            {weatherTestResult && (
                <Alert message={weatherTestResult} type={weatherTestResult.includes('成功') ? 'success' : 'error'} className="mt-4" showIcon />
            )}
            <div className="mt-2 text-gray-400 text-xs">
                * 纬度/经度用于从 Open-Meteo 气象服务自动获取历史气温和天气预报。
            </div>
        </Card>

        {/* Import Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="数据导入" className="shadow-md">
            <Tabs defaultActiveKey="1" items={[
                {
                key: '1',
                label: '单位导入',
                children: (
                    <div className="space-y-4">
                    <p className="text-gray-500 text-sm">
                        支持导入新单位或更新现有单位。
                        <br/>
                        <span className="text-orange-500">提示：如果您再次导入已存在的单位，系统将更新其信息，并自动补录缺失的“初始余额”财务记录。</span>
                    </p>
                    <div className="flex space-x-2">
                        <Button icon={<DownloadOutlined />} onClick={downloadUnitTemplate}>下载模版</Button>
                        <Upload beforeUpload={handleImportUnits} showUploadList={false} accept=".xlsx,.xls">
                        <Button type="primary" icon={<UploadOutlined />} loading={loading}>选择 Excel 文件导入</Button>
                        </Upload>
                    </div>
                    </div>
                )
                },
                {
                key: '2',
                label: '抄表记录导入',
                children: (
                    <div className="space-y-4">
                    <p className="text-gray-500 text-sm">导入历史抄表记录。需确保单位名称已存在。</p>
                    <div className="flex space-x-2">
                        <Button icon={<DownloadOutlined />} onClick={downloadReadingTemplate}>下载模版</Button>
                        <Upload beforeUpload={handleImportReadings} showUploadList={false} accept=".xlsx,.xls">
                        <Button type="primary" icon={<UploadOutlined />} loading={loading}>选择 Excel 文件导入</Button>
                        </Upload>
                    </div>
                    </div>
                )
                }
            ]} />

            {importResult && (
                <div className="mt-4">
                <Alert
                    message={`${importResult.type} 完成`}
                    description={
                    <div>
                        <p>成功: {importResult.successCount}</p>
                        <p>失败: {importResult.errorCount}</p>
                        {importResult.errors.length > 0 && (
                        <div className="mt-2 max-h-32 overflow-y-auto text-xs bg-white p-2 border rounded">
                            {importResult.errors.map((e: string, i: number) => <div key={i} className="text-red-500">{e}</div>)}
                        </div>
                        )}
                    </div>
                    }
                    type={importResult.errorCount === 0 ? 'success' : 'warning'}
                    showIcon
                />
                </div>
            )}
            </Card>

            {/* Export Section */}
            <Card title="数据导出" className="shadow-md">
            <div className="space-y-6">
                <div className="p-4 bg-blue-50 rounded border border-blue-100 flex items-center justify-between">
                    <div>
                    <h3 className="font-semibold text-blue-900">单位信息导出</h3>
                    <p className="text-xs text-blue-600">包含所有单位的基础信息、参数及当前状态</p>
                    </div>
                    <Button icon={<FileExcelOutlined />} onClick={handleExportUnits} loading={loading}>导出 Excel</Button>
                </div>

                <div className="p-4 bg-green-50 rounded border border-green-100 flex items-center justify-between">
                    <div>
                    <h3 className="font-semibold text-green-900">财务报表导出</h3>
                    <p className="text-xs text-green-600">包含所有充值、扣费等历史交易流水</p>
                    </div>
                    <Button icon={<FileExcelOutlined />} onClick={handleExportFinancials} loading={loading}>导出 Excel</Button>
                </div>
            </div>
            </Card>
        </div>
      </div>
    </div>
  )
}
