'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Table, Tag, Button, Popconfirm, message } from 'antd';
import { DownloadOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { deleteTransaction } from '@/actions/transactions';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import SettlementExportModal from '../components/financial/SettlementExportModal';

const TYPE_MAP: any = {
    'INITIAL': '初始余额',
    'RECHARGE': '充值',
    'DEDUCTION': '扣费',
    'ADJUSTMENT': '调整'
};

export default function FinancialList({ transactions }: { transactions: any[] }) {
    const router = useRouter();
    const [messageApi, contextHolder] = message.useMessage();
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const handleDelete = async (id: number) => {
        const res = await deleteTransaction(id);
        if (res.success) {
            messageApi.success('记录已删除，余额已自动回滚');
            router.refresh();
        } else {
            messageApi.error('删除失败: ' + res.error);
        }
    };

    const columns = [
        { title: '日期', dataIndex: 'date', render: (d: Date) => dayjs(d).format('YYYY-MM-DD HH:mm') },
        { title: '单位', dataIndex: ['unit', 'name'], render: (t: string) => <span className="font-medium text-blue-600">{t}</span> },
        { title: '类型', dataIndex: 'type', render: (t: string) => {
             let color = 'blue';
             if(t === 'RECHARGE') color = 'green';
             if(t === 'DEDUCTION') color = 'red';
             if(t === 'ADJUSTMENT') color = 'orange';
             return <Tag color={color}>{TYPE_MAP[t] || t}</Tag>
        }},
        { title: '摘要', dataIndex: 'summary' },
        { title: '金额 (元)', dataIndex: 'amount', render: (v: any) => <span style={{ color: v > 0 ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>{v > 0 ? '+' : ''}{Number(v).toFixed(2)}</span> },
        { title: '交易后余额', dataIndex: 'balanceAfter', render: (v: any) => Number(v).toFixed(2) },
        { title: '备注', dataIndex: 'remarks' },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: any) => (
                <Popconfirm
                    title="确定删除这条财务记录吗?"
                    description="删除后，账户余额将回滚，如果是扣费记录，相关的抄表记录将变为“未扣费”状态。"
                    onConfirm={() => handleDelete(record.id)}
                >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            )
        }
    ];

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm">
            {contextHolder}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">财务流水明细</h2>
                <div className="flex gap-2">
                    <Button icon={<HistoryOutlined />} onClick={() => router.push('/financial/snapshots')}>历史余额快照</Button>
                    <Button icon={<DownloadOutlined />} onClick={() => setIsExportModalOpen(true)}>导出结算报表</Button>
                </div>
            </div>
            <Table dataSource={transactions} columns={columns} rowKey="id" />
            <SettlementExportModal open={isExportModalOpen} onCancel={() => setIsExportModalOpen(false)} />
        </div>
    );
}
