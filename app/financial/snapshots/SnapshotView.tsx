'use client';

import { useState, useEffect } from 'react';
import { DatePicker, Card, Button, message, Tag, Statistic } from 'antd';
import { ReloadOutlined, ArrowLeftOutlined, CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getUnitBalancesAtDate } from '@/actions/snapshot';
import { useRouter } from 'next/navigation';
import { List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';

export default function SnapshotView() {
    const router = useRouter();
    // Default to 15th of current month if today > 15th, else 15th of previous month?
    // Or just today?
    // User said "usually 15th". Let's default to 15th of THIS month.
    const [date, setDate] = useState<dayjs.Dayjs>(dayjs().date(15));
    const [loading, setLoading] = useState(false);

    interface SnapshotData {
        id: number;
        code: string | null;
        name: string;
        balance: number;
        status: string;
        parentUnitId: number | null;
    }

    const [data, setData] = useState<SnapshotData[]>([]);
    const [sortField, setSortField] = useState<keyof SnapshotData | null>('code');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

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

    const totalBalance = data
        .filter(item => !item.parentUnitId)
        .reduce((sum, item) => sum + item.balance, 0);

    const arrearsCount = data.filter(item => item.status === '欠费').length;

    // Sorting Logic
    const sortedData = [...data].sort((a, b) => {
        if (!sortField) return 0;
        const factor = sortOrder === 'asc' ? 1 : -1;

        if (sortField === 'code') {
            return factor * (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
        }
        if (sortField === 'name') {
            return factor * a.name.localeCompare(b.name, 'zh-CN');
        }
        if (sortField === 'balance') {
            return factor * (a.balance - b.balance);
        }
        return 0;
    });

    const handleSort = (field: keyof SnapshotData) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const SortIcon = ({ field }: { field: keyof SnapshotData }) => {
        if (sortField !== field) return <span className="text-gray-300 ml-1 text-xs"><CaretUpOutlined /><CaretDownOutlined /></span>;
        return sortOrder === 'asc'
            ? <span className="text-blue-500 ml-1 text-xs"><CaretUpOutlined /></span>
            : <span className="text-blue-500 ml-1 text-xs"><CaretDownOutlined /></span>;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Row = ({ index, style }: any) => {
        const item = sortedData[index];
        return (
            <div style={style} className="flex items-center border-b hover:bg-gray-50 text-sm">
                <div className="w-[100px] pl-4 flex-shrink-0">{item.code}</div>
                <div className="flex-1 min-w-0 px-2 truncate" title={item.name}>{item.name}</div>
                <div className="w-[150px] px-2 text-right">
                    <span style={{ color: item.balance < 0 ? '#cf1322' : '#3f8600', fontWeight: item.balance < 0 ? 'bold' : 'normal' }}>
                        {item.balance.toFixed(2)}
                    </span>
                </div>
                <div className="w-[100px] px-2 text-center">
                    {item.status === '欠费' ? <Tag color="red">欠费</Tag> : <Tag color="green">正常</Tag>}
                </div>
            </div>
        );
    };

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
            className="flex flex-col h-[calc(100vh-100px)]"
            styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
        >
            <div className="flex gap-8 mb-4 p-4 bg-gray-50 rounded flex-shrink-0">
                <Statistic title="总余额" value={totalBalance} precision={2} suffix="元" valueStyle={{ color: totalBalance >= 0 ? '#3f8600' : '#cf1322' }} />
                <Statistic title="欠费单位数" value={arrearsCount} suffix="个" valueStyle={{ color: arrearsCount > 0 ? '#cf1322' : '#3f8600' }} />
                <Statistic title="正常单位数" value={data.length - arrearsCount} suffix="个" />
            </div>

            {/* Virtual Table Header */}
            <div className="flex bg-gray-100 py-2 border-b font-medium text-gray-700 text-sm flex-shrink-0 pr-4"> {/* pr-4 for scrollbar offset approx */}
                <div className="w-[100px] pl-4 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('code')}>
                    编号 <SortIcon field="code" />
                </div>
                <div className="flex-1 px-2 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('name')}>
                    单位名称 <SortIcon field="name" />
                </div>
                <div className="w-[150px] px-2 text-right cursor-pointer hover:bg-gray-200" onClick={() => handleSort('balance')}>
                    账户余额 (元) <SortIcon field="balance" />
                </div>
                <div className="w-[100px] px-2 text-center">
                    状态
                </div>
            </div>

            {/* Virtual List */}
            <div className="flex-1 w-full">
                <AutoSizer
                    renderProp={({ height, width }) => (
                        <List
                            style={{ height: height ?? 0, width: width ?? 0 }}
                            rowCount={sortedData.length}
                            rowHeight={40}
                            rowProps={{}}
                            rowComponent={Row}
                        />
                    )}
                />
            </div>
        </Card>
    );
}
