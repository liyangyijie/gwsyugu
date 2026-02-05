'use client';

import { useState, useEffect } from 'react';
import { DatePicker, Table, Card, Button, message, Tag, Statistic } from 'antd';
import { ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getUnitBalancesAtDate } from '@/actions/snapshot';
import { useRouter } from 'next/navigation';

export default function SnapshotView() {
    const router = useRouter();
    // Default to 15th of current month if today > 15th, else 15th of previous month?
    // Or just today?
    // User said "usually 15th". Let's default to 15th of THIS month.
    const [date, setDate] = useState<dayjs.Dayjs>(dayjs().date(15));
    const [loading, setLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Pass formatted string "YYYY-MM-DD" to avoid timezone shifts between Client and Server
            const res = await getUnitBalancesAtDate(date.format('YYYY-MM-DD'));
            if (res.success) {
                setData(res.data || []);
            } else {
                message.error(res.error);
            }
        } catch {
            message.error('加载失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date]); // Reload when date changes

    const columns = [
        {
            title: '编号',
            dataIndex: 'code',
            key: 'code',
            sorter: (a: any, b: any) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' }),
            width: 100
        },
        {
            title: '单位名称',
            dataIndex: 'name',
            key: 'name',
            sorter: (a: any, b: any) => a.name.localeCompare(b.name, 'zh-CN')
        },
        {
            title: '账户余额 (元)',
            dataIndex: 'balance',
            key: 'balance',
            sorter: (a: any, b: any) => a.balance - b.balance,
            render: (val: number) => (
                <span style={{ color: val < 0 ? '#cf1322' : '#3f8600', fontWeight: val < 0 ? 'bold' : 'normal' }}>
                    {val.toFixed(2)}
                </span>
            )
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => status === '欠费' ? <Tag color="red">欠费</Tag> : <Tag color="green">正常</Tag>
        }
    ];

    const totalBalance = data
        .filter(item => !item.parentUnitId)
        .reduce((sum, item) => sum + item.balance, 0);

    const arrearsCount = data.filter(item => item.status === '欠费').length;

    return (
        <Card
            title={
                <div className="flex items-center gap-4">
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>返回</Button>
                    <span>余额快照查询</span>
                </div>
            }
            extra={
                <div className="flex gap-2 items-center">
                    <span>快照日期: </span>
                    <DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} />
                    <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
                </div>
            }
        >
            <div className="flex gap-8 mb-4 p-4 bg-gray-50 rounded">
                <Statistic title="总余额" value={totalBalance} precision={2} suffix="元" valueStyle={{ color: totalBalance >= 0 ? '#3f8600' : '#cf1322' }} />
                <Statistic title="欠费单位数" value={arrearsCount} suffix="个" valueStyle={{ color: arrearsCount > 0 ? '#cf1322' : '#3f8600' }} />
                <Statistic title="正常单位数" value={data.length - arrearsCount} suffix="个" />
            </div>

            <Table
                dataSource={data}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                size="small"
            />
        </Card>
    );
}
