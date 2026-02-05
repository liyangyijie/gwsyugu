'use client';

import { Form, Table, InputNumber, DatePicker, Button, message, Card } from 'antd';
import { useState } from 'react';
import dayjs from 'dayjs';
import { submitBatchReadings } from '@/actions/readings';
import { useRouter } from 'next/navigation';

interface UnitData {
    id: number;
    code: string | null;
    name: string;
    lastReading: number;
    lastReadingDate: string | Date | null;
}

export default function BatchReadingForm({ units }: { units: UnitData[] }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleFinish = async (values: { readingDate: dayjs.Dayjs; readings: Record<string, number> }) => {
        const { readingDate, readings } = values;

        // Convert map to array
        const entries = Object.keys(readings || {})
            .map(unitId => ({
                unitId: Number(unitId),
                readingValue: readings[unitId],
                readingDate: readingDate.toDate()
            }))
            .filter((e) => e.readingValue !== undefined && e.readingValue !== null && e.readingValue as unknown as string !== '');

        if (entries.length === 0) {
            message.warning('请至少录入一个读数');
            return;
        }

        setLoading(true);
        try {
            const res = await submitBatchReadings(entries);
            if (res.success) {
                message.success(`成功录入 ${res.successCount} 条记录`);
                router.push('/units');
            } else {
                message.warning(`部分成功: ${res.successCount} 条。失败: ${res.errors?.join('; ')}`);
            }
        } catch {
            message.error('提交失败');
        } finally {
            setLoading(false);
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns: any[] = [
        { title: '编号', dataIndex: 'code', width: 100, sorter: (a: UnitData, b: UnitData) => (a.code || '').localeCompare(b.code || '') },
        { title: '单位名称', dataIndex: 'name', width: 200, sorter: (a: UnitData, b: UnitData) => a.name.localeCompare(b.name, 'zh-CN') },
        {
            title: '上次读数',
            dataIndex: 'lastReading',
            width: 120,
            render: (v: number, r: UnitData) => (
                <div>
                    <div className="font-mono">{v.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">{r.lastReadingDate ? dayjs(r.lastReadingDate).format('YYYY-MM-DD') : '无'}</div>
                </div>
            )
        },
        {
            title: '本次读数',
            key: 'input',
            width: 150,
            render: (_: unknown, record: UnitData) => (
                <Form.Item
                    name={['readings', record.id]}
                    noStyle
                    rules={[
                        {
                            validator: (_, value) => {
                                if (value !== undefined && value !== null && value < record.lastReading) {
                                    return Promise.reject('不能小于上次读数');
                                }
                                return Promise.resolve();
                            }
                        }
                    ]}
                >
                    <InputNumber
                        placeholder="请输入"
                        style={{ width: '100%' }}
                        precision={2}
                        min={0}
                        onPressEnter={() => {
                            // Focus next input? Antd doesn't support easy nav, but standard Tab works
                        }}
                    />
                </Form.Item>
            )
        }
    ];

    return (
        <Card title="批量抄表录入" className="shadow-sm">
            <Form form={form} onFinish={handleFinish} initialValues={{ readingDate: dayjs() }}>
                <div className="flex justify-between items-center mb-4 sticky top-0 bg-white z-10 py-2 border-b">
                    <Form.Item name="readingDate" label="统一抄表日期" style={{ marginBottom: 0 }} rules={[{ required: true }]}>
                        <DatePicker allowClear={false} />
                    </Form.Item>
                    <div className="flex gap-2">
                        <Button onClick={() => router.back()}>取消</Button>
                        <Button type="primary" htmlType="submit" loading={loading}>
                            提交录入
                        </Button>
                    </div>
                </div>

                <Table
                    dataSource={units}
                    columns={columns}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ y: 'calc(100vh - 250px)' }} // Adaptive height
                />
            </Form>
        </Card>
    );
}
