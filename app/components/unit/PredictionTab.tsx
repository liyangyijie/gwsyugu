'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Card, Button, Row, Col, Alert, Spin } from 'antd';
import { CalculatorOutlined, SyncOutlined, DownloadOutlined, CameraOutlined } from '@ant-design/icons';
import { useEffect, useState, useRef } from 'react';
import katex from 'katex';
import * as htmlToImage from 'html-to-image';
import { calculateUnitParams, getPrediction } from '@/actions/prediction';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function PredictionTab({ unit }: { unit: any }) {
    const [loading, setLoading] = useState(false);
    const [prediction, setPrediction] = useState<any>(null);
    const [calcResult, setCalcResult] = useState<any>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await getPrediction(unit.id);
            if (res.success) {
                setPrediction(res.data);
            } else {
                console.error("Prediction failed:", res.error);
                // Optionally show error to user or just leave as empty state
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleCalculate = async () => {
        setLoading(true);
        const res = await calculateUnitParams(unit.id);
        if (res.success) {
            setCalcResult(res.data);
            // Refresh prediction after params update
            // Note: unit prop is stale here until page refresh, but we updated DB.
            // We should reload page to get fresh Unit data, OR just fetch prediction using DB params.
            // getPrediction fetches from DB, so it works.
            const predRes = await getPrediction(unit.id);
            if (predRes.success) setPrediction(predRes.data);
            // Reload page to update Unit info in UI
            window.location.reload();
        } else {
            alert('计算失败: ' + res.error);
        }
        setLoading(false);
    };

    const handleExport = () => {
        window.open(`/api/export/prediction/${unit.id}`, '_blank');
    };

    const handleExportImage = async () => {
        if (!contentRef.current) return;

        try {
            const dataUrl = await htmlToImage.toPng(contentRef.current, {
                backgroundColor: '#ffffff',
                pixelRatio: 2 // Higher resolution
            });

            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `Prediction_${unit?.name || 'unit'}_${new Date().toISOString().slice(0, 10)}.png`;
            link.click();
        } catch (error) {
            console.error('Export image failed:', error);
            alert('导出图片失败，请重试');
        }
    };

    const validationData = prediction ? [
        ...(prediction.history || []).map((h: any) => ({
            date: h.date,
            temp: Number(h.temp).toFixed(1),
            actualHeat: Number(h.dailyHeat).toFixed(2),
        })),
        ...(prediction.log || []).map((f: any) => ({
            date: f.date,
            temp: f.temp,
            predictedHeat: f.heat,
        }))
    ] : [];

    useEffect(() => {
        if (unit.baseHeat !== null) {
            setTimeout(() => fetchData(), 0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!unit.baseHeat && !calcResult) {
        return (
            <div className="text-center py-10 bg-white rounded-lg">
                <p className="mb-4 text-gray-500">暂无用热参数，无法进行预测。请先基于历史抄表数据进行智能计算。</p>
                <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalculate} loading={loading}>
                    智能计算参数
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6" ref={contentRef}>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-2">
                    <div className="text-lg font-bold text-gray-800">
                        {unit?.name} - 预测分析报告
                    </div>
                    <div className="text-sm text-gray-500">
                        生成时间: {new Date().toLocaleString()}
                    </div>
                </div>
                {prediction && (
                    <div className="flex gap-8 border-t pt-3 mt-2">
                        <div>
                            <div className="text-gray-500 text-xs mb-1">当前余额</div>
                            <div className="font-bold text-xl text-blue-600">¥{Number(prediction.currentBalance).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                        <div>
                            <div className="text-gray-500 text-xs mb-1">预计可用至</div>
                            <div className="font-bold text-xl text-gray-800">{prediction.estimatedDate}</div>
                        </div>
                        <div>
                            <div className="text-gray-500 text-xs mb-1">剩余天数</div>
                            <div className={`font-bold text-xl ${prediction.remainingDays < 30 ? 'text-red-500' : 'text-green-500'}`}>
                                {prediction.remainingDays} 天
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <Card size="small" title="计算模型公式" variant="borderless" className="bg-gray-50 shadow-sm">
                <div
                    dangerouslySetInnerHTML={{
                        __html: katex.renderToString('Q_{daily} = Q_{base} + (T_{base} - T_{avg}) \\times K', {
                            throwOnError: false,
                            displayMode: true
                        })
                    }}
                    className="py-2 overflow-x-auto"
                />
                <div className="text-xs text-gray-500 mt-1 text-center flex justify-center gap-4 flex-wrap">
                    <span dangerouslySetInnerHTML={{__html: katex.renderToString('Q_{daily}: \\text{日用热量}', {throwOnError: false})}} />
                    <span dangerouslySetInnerHTML={{__html: katex.renderToString('Q_{base}: \\text{基准热量}', {throwOnError: false})}} />
                    <span dangerouslySetInnerHTML={{__html: katex.renderToString('T_{base}: \\text{基准温度}(15^\\circ\\text{C})', {throwOnError: false})}} />
                    <span dangerouslySetInnerHTML={{__html: katex.renderToString('T_{avg}: \\text{日均气温}', {throwOnError: false})}} />
                    <span dangerouslySetInnerHTML={{__html: katex.renderToString('K: \\text{温度系数}', {throwOnError: false})}} />
                </div>
            </Card>

            <Row gutter={16}>
                <Col span={6}>
                    <Card size="small" title="基准热量 (GJ/天)" variant="borderless" className="bg-blue-50">
                        <span className="text-lg font-bold">{unit.baseHeat?.toFixed(2)}</span>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small" title="温度系数" variant="borderless" className="bg-blue-50">
                        <span className="text-lg font-bold">{unit.tempCoeff?.toFixed(4)}</span>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small" title="拟合度 (R²)" variant="borderless" className="bg-blue-50">
                        <span className="text-lg font-bold">{calcResult?.r2?.toFixed(4) ?? '-'}</span>
                    </Card>
                </Col>
                <Col span={6}>
                    <div className="flex flex-col gap-2 h-full justify-center">
                        <Button type="primary" icon={<SyncOutlined />} onClick={handleCalculate} loading={loading} block>
                            重新计算
                        </Button>
                        <div className="flex gap-2">
                            <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!prediction} className="flex-1">
                                Excel
                            </Button>
                            <Button icon={<CameraOutlined />} onClick={handleExportImage} disabled={!prediction} className="flex-1">
                                图片
                            </Button>
                        </div>
                    </div>
                </Col>
            </Row>

            {prediction ? (
                <>
                    <Alert
                        description={
                            <div>
                                <div className="font-bold mb-1">
                                    {prediction.remainingDays < 30
                                    ? `余额紧张预警：预计仅够使用 ${prediction.remainingDays} 天，至 ${prediction.estimatedDate}`
                                    : `余额充足：预计可使用至 ${prediction.estimatedDate} (剩余 ${prediction.remainingDays} 天)`}
                                </div>
                                <div className="text-xs">
                                    基于 {prediction.cityInfo?.name} (Lat: {prediction.cityInfo?.lat}, Lon: {prediction.cityInfo?.lon}) 天气预报计算
                                </div>
                            </div>
                        }
                        type={prediction.remainingDays < 30 ? 'error' : 'success'}
                        showIcon
                        className="shadow-sm"
                    />

                    {prediction.monthlyStats && (
                        <div className="grid grid-cols-3 gap-4">
                            {prediction.monthlyStats.map((stat: any) => (
                                <Card key={stat.month} size="small" variant="borderless" className="bg-gray-50 text-center">
                                    <div className="text-gray-500 text-xs">{stat.month} 平均气温</div>
                                    <div className="font-bold text-lg">{stat.avgTemp}°C</div>
                                </Card>
                            ))}
                        </div>
                    )}

                    <Card title="用热模型分析 (历史 vs 预测)" variant="borderless" className="shadow-sm">
                        <div className="h-80 w-full">
                            <ResponsiveContainer>
                                <LineChart data={validationData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis yAxisId="left" label={{ value: '热量 (GJ)', angle: -90, position: 'insideLeft' }} />
                                    <YAxis yAxisId="right" orientation="right" label={{ value: '气温 (℃)', angle: 90, position: 'insideRight' }} />
                                    <Tooltip />
                                    <Legend />
                                    <Line yAxisId="left" type="monotone" dataKey="actualHeat" stroke="#1890ff" name="实际用热" strokeWidth={2} dot={true} />
                                    <Line yAxisId="left" type="monotone" dataKey="predictedHeat" stroke="#52c41a" name="预测用热" strokeDasharray="5 5" dot={false} />
                                    <Line yAxisId="right" type="monotone" dataKey="temp" stroke="#faad14" name="气温" dot={false} strokeWidth={1} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card title="未来120天余额消耗预测" variant="borderless" className="shadow-sm">
                        <div className="h-96 w-full">
                            <ResponsiveContainer>
                                <LineChart data={prediction.log} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis yAxisId="left" label={{ value: '余额 (元)', angle: -90, position: 'insideLeft' }} />
                                    <YAxis yAxisId="right" orientation="right" label={{ value: '气温 (℃)', angle: 90, position: 'insideRight' }} />
                                    <Tooltip />
                                    <Legend />
                                    <Line yAxisId="left" type="monotone" dataKey="balance" stroke="#1890ff" name="账户余额" dot={false} strokeWidth={2} />
                                    <Line yAxisId="right" type="monotone" dataKey="temp" stroke="#faad14" name="预测气温" dot={false} />
                                    <ReferenceLine y={0} yAxisId="left" stroke="red" strokeDasharray="3 3" label="欠费线" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </>
            ) : (
                <div className="text-center py-10">
                    {loading ? <Spin><div className="mt-2">正在生成预测...</div></Spin> : <span className="text-gray-400">暂无预测数据 (请尝试重新计算)</span>}
                </div>
            )}
        </div>
    )
}
