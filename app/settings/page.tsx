'use client'

import React, { useState, useEffect } from 'react'
import { Upload, Button, message, Card, Table, Tabs, Statistic, Alert, Input, Form, InputNumber, Divider, App, Modal } from 'antd'
import { UploadOutlined, DownloadOutlined, FileExcelOutlined, EnvironmentOutlined, ExperimentOutlined, SaveOutlined, CopyOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { importUnits, importReadings, getAllUnitsForExport, getFinancialReportForExport } from '@/actions/data-management'
import { getCitySetting, saveCitySetting, testWeather } from '@/actions/settings'

export default function DataManagementPage() {
  const [loading, setLoading] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)

  // Paste Import State
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false)
  const [pasteContent, setPasteContent] = useState('')
  const [parsedPasteData, setParsedPasteData] = useState<any[]>([])
  const [pasteDate, setPasteDate] = useState<any>(null)

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
        // Prefer file date if available, otherwise row date
        readingDate: row['__fileDate'] || row['抄表日期'] || row['readingDate'],
        // Support specific format "今日表数   （吉焦）" and others
        readingValue: row['今日表数   （吉焦）'] || row['今日表数（吉焦）'] || row['今日表数'] || row['热计量表总数'] || row['读数'] || row['readingValue'],
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

          // Special handling for the user's custom format:
          // Row 1 (Index 0): Date (e.g. "2026年1月25日 星期日")
          // Row 2 (Index 1): Headers (e.g. "单位名称", "今日表数 （吉焦）")
          // OR Standard format: Row 1 = Headers

          // Read first cell
          const firstCell = sheet['A1'] ? sheet['A1'].v : '';
          let fileDate = '';
          let headerRowIndex = 0; // Default to 0 (Row 1)

          if (typeof firstCell === 'string') {
             // Check if it's a date
             const match = firstCell.match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
             if (match) {
                 fileDate = match[1].replace(/年|月/g, '-').replace(/日/g, '');
                 // If Row 1 is date, assume headers are on Row 2
                 headerRowIndex = 1;
             }
          }

          // Use range option
          const json = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex });

          // Attach file date to each row if available
          if (fileDate) {
              json.forEach((row: any) => {
                  row['__fileDate'] = fileDate;
              });
          }

          resolve(json)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = (error) => reject(error)
      reader.readAsBinaryString(file)
    })
  }

  // -- Paste Logic --
  const handlePasteAnalyze = () => {
      if (!pasteContent.trim()) {
          messageApi.warning('请先粘贴内容');
          return;
      }

      // Try to parse as tab-separated values (Excel copy usually gives TSV)
      const rows = pasteContent.trim().split('\n');
      if (rows.length < 2) {
          messageApi.error('数据格式不正确，至少需要包含日期行和表头行');
          return;
      }

      // 1. Try to find Date in the first few rows
      let dateFound = null;
      let headerRowIndex = -1;

      for(let i=0; i<Math.min(rows.length, 5); i++) {
          const rowText = rows[i];
          const match = rowText.match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
          if (match) {
              dateFound = match[1].replace(/年|月/g, '-').replace(/日/g, '');
          }
          // Detect header row by keywords
          if (rowText.includes('单位名称') && (rowText.includes('表数') || rowText.includes('读数'))) {
              headerRowIndex = i;
          }
      }

      if (headerRowIndex === -1) {
          messageApi.error('未找到表头（需包含“单位名称”和“表数”等列）');
          return;
      }

      // 2. Parse Headers
      const headers = rows[headerRowIndex].split('\t').map(h => h.trim());

      // 3. Parse Data Rows
      const data = [];
      for(let i=headerRowIndex+1; i<rows.length; i++) {
          const cells = rows[i].split('\t');
          // Skip empty rows
          if (cells.every(c => !c.trim())) continue;

          const rowData: any = {};
          headers.forEach((h, index) => {
              if (index < cells.length) {
                  rowData[h] = cells[index].trim();
              }
          });

          // Map to standard format
          const unitName = rowData['单位名称'];
          const readingValue = rowData['今日表数   （吉焦）'] || rowData['今日表数（吉焦）'] || rowData['今日表数'] || rowData['热计量表总数'] || rowData['读数'];

          if (unitName && readingValue) {
               data.push({
                   unitName,
                   readingValue,
                   readingDate: dateFound, // Will be set globally later if needed, but good to have
                   remarks: rowData['备   注'] || rowData['备注'] || ''
               });
          }
      }

      setPasteDate(dateFound);
      setParsedPasteData(data);
  };

  const handlePasteSubmit = async () => {
      if (parsedPasteData.length === 0) return;

      setLoading(true);
      try {
           const mappedData = parsedPasteData.map(item => ({
               ...item,
               readingDate: item.readingDate || pasteDate // Use found date if available
           })).filter(item => item.readingDate); // Ensure date exists

           if (mappedData.length === 0) {
               messageApi.error('无法识别有效日期，请确保复制的内容包含如“2026年1月25日”的日期行');
               setLoading(false);
               return;
           }

           const result = await importReadings(mappedData);
           setImportResult({ type: '粘贴导入', ...result });

           if (result.success) {
               messageApi.success(`成功导入 ${result.successCount} 条记录`);
               setIsPasteModalOpen(false);
               setPasteContent('');
               setParsedPasteData([]);
           } else {
               messageApi.error('导入失败: ' + result.error);
           }
      } catch (e: any) {
          messageApi.error('导入出错: ' + e.message);
      } finally {
          setLoading(false);
      }
  };


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
                        <Button icon={<CopyOutlined />} onClick={() => setIsPasteModalOpen(true)}>粘贴导入</Button>
                    </div>
                    </div>
                )
                }
            ]} />

            {/* Paste Modal */}
            <Modal
                title="粘贴导入抄表记录"
                open={isPasteModalOpen}
                onCancel={() => setIsPasteModalOpen(false)}
                onOk={handlePasteSubmit}
                okText="确认导入"
                cancelText="取消"
                width={800}
                confirmLoading={loading}
                okButtonProps={{ disabled: parsedPasteData.length === 0 }}
            >
                <div className="space-y-4">
                    <Alert description="请直接从 Excel 中复制包括日期、表头和数据的所有内容，然后粘贴到下方文本框中。" type="info" showIcon />
                    <Input.TextArea
                        rows={10}
                        placeholder="在此粘贴 Excel 内容..."
                        value={pasteContent}
                        onChange={(e) => {
                            setPasteContent(e.target.value);
                            // Reset parsed data on change
                            setParsedPasteData([]);
                            setPasteDate(null);
                        }}
                    />
                    <div className="flex justify-end">
                        <Button type="primary" onClick={handlePasteAnalyze} disabled={!pasteContent}>解析数据</Button>
                    </div>

                    {pasteDate && (
                        <div className="bg-blue-50 p-2 rounded text-blue-700">
                            识别到日期: <strong>{pasteDate}</strong>
                        </div>
                    )}

                    {parsedPasteData.length > 0 && (
                        <div>
                            <div className="mb-2 font-bold">预览 (共 {parsedPasteData.length} 条记录):</div>
                            <Table
                                dataSource={parsedPasteData}
                                rowKey="unitName"
                                size="small"
                                pagination={{ pageSize: 5 }}
                                columns={[
                                    { title: '单位名称', dataIndex: 'unitName' },
                                    { title: '读数', dataIndex: 'readingValue' },
                                    { title: '备注', dataIndex: 'remarks' }
                                ]}
                            />
                        </div>
                    )}
                </div>
            </Modal>

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
