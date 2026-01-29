'use client'
import { Button, message } from 'antd'
import { CalculatorOutlined } from '@ant-design/icons'
import { calculateAllUnitsParams } from '@/actions/prediction'
import { useState } from 'react'

export function OneClickCalculateButton() {
    const [loading, setLoading] = useState(false)
    const [messageApi, contextHolder] = message.useMessage()

    const handleCalculate = async () => {
        setLoading(true)
        messageApi.loading('正在批量计算所有单位预测参数，请稍候...', 0)
        try {
            const res = await calculateAllUnitsParams()
            messageApi.destroy()
            if (res.success) {
                messageApi.success(`计算完成: 成功 ${res.successCount}, 失败 ${res.failCount}`)
                // Refresh to show updated data if any
                window.location.reload()
            } else {
                messageApi.error('计算失败: ' + res.error)
            }
        } catch {
            messageApi.destroy()
            messageApi.error('系统错误')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {contextHolder}
            <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalculate} loading={loading}>
                一键全部单位预测计算
            </Button>
        </>
    )
}
