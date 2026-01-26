'use client';
import { Table, Tag, Button, Input, Modal, Form, InputNumber, DatePicker, message, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, FormOutlined, DeleteOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUnit, deleteUnit } from '@/actions/unit';
import { saveMeterReading } from '@/actions/readings';
import dayjs from 'dayjs';

export default function UnitList({ units }: { units: any[] }) {
    const router = useRouter();
    const [searchText, setSearchText] = useState('');
    const [messageApi, contextHolder] = message.useMessage();

    // Create Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createForm] = Form.useForm();

    // Reading Modal State
    const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
    const [readingForm] = Form.useForm();
    const [selectedUnit, setSelectedUnit] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const filteredUnits = units.filter(u => u.name.includes(searchText));

    const openReadingModal = (unit: any) => {
        setSelectedUnit(unit);
        readingForm.resetFields();
        readingForm.setFieldsValue({
            readingDate: dayjs(),
        });
        setIsReadingModalOpen(true);
    };

    const handleDeleteUnit = async (id: number) => {
        const res = await deleteUnit(id);
        if (res.success) {
            messageApi.success('单位已删除');
            router.refresh();
        } else {
            messageApi.error(res.error);
        }
    };

    const handleSaveReading = async (values: any) => {
        if (!selectedUnit) return;
        setLoading(true);
        try {
            const data = {
                unitId: selectedUnit.id,
                readingDate: values.readingDate.toDate(),
                readingValue: values.readingValue,
                // Temperature auto-fetched by backend
            };
            const res = await saveMeterReading(data);
            if (res.success) {
                messageApi.success(`单位 ${selectedUnit.name} 抄表成功`);
                setIsReadingModalOpen(false);
                router.refresh(); // Refresh list to update balance/status
            } else {
                messageApi.error('保存失败: ' + res.error);
            }
        } catch (error) {
            messageApi.error('系统错误');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: '单位名称',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: any) => (
                <a onClick={() => router.push(`/units/${record.id}`)} className="font-medium text-blue-600 hover:text-blue-800">
                    {text}
                </a>
            ),
        },
        {
            title: '编号',
            dataIndex: 'code',
            key: 'code',
        },
        {
            title: '账户余额 (元)',
            dataIndex: 'accountBalance',
            key: 'accountBalance',
            render: (val: any) => {
                const num = Number(val);
                return <span style={{ color: num < 0 ? '#cf1322' : '#3f8600', fontWeight: num < 0 ? 'bold' : 'normal' }}>{num.toFixed(2)}</span>
            }
        },
        {
            title: '单价',
            dataIndex: 'unitPrice',
            key: 'unitPrice',
            render: (val: any) => Number(val).toFixed(2)
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: (status: string, record: any) => {
                const bal = Number(record.accountBalance);
                if (bal < 0) return <Tag color="red">欠费</Tag>
                return <Tag color="green">正常</Tag>
            }
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: any) => (
                <div className="flex gap-2">
                    <Button
                        type="primary"
                        ghost
                        size="small"
                        icon={<FormOutlined />}
                        onClick={(e) => { e.stopPropagation(); openReadingModal(record); }}
                    >
                        抄表
                    </Button>
                    <Popconfirm
                        title="确定要删除该单位吗?"
                        description="删除后，相关的抄表记录和财务流水将一并被永久删除，无法恢复。"
                        onConfirm={(e) => { e?.stopPropagation(); handleDeleteUnit(record.id); }}
                        onCancel={(e) => e?.stopPropagation()}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                        >
                            删除
                        </Button>
                    </Popconfirm>
                </div>
            )
        }
    ];

    const handleCreate = async (values: any) => {
        const res = await createUnit(values);
        if (res.success) {
            setIsCreateModalOpen(false);
            createForm.resetFields();
            router.refresh();
        } else {
            alert('Error: ' + res.error);
        }
    };

    return (
        <div className="space-y-4 bg-white p-6 rounded-lg shadow-sm">
            {contextHolder}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">单位管理</h2>
                <div className="flex gap-2">
                    <Input
                        placeholder="搜索单位名称"
                        prefix={<SearchOutlined />}
                        style={{ width: 200 }}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                    />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>
                        添加单位
                    </Button>
                </div>
            </div>

            <Table
                dataSource={filteredUnits}
                columns={columns}
                rowKey="id"
                rowClassName={(record) => Number(record.accountBalance) < 0 ? 'bg-red-50' : ''}
                pagination={{ pageSize: 10 }}
            />

            {/* Create Unit Modal */}
            <Modal title="添加新单位" open={isCreateModalOpen} onCancel={() => setIsCreateModalOpen(false)} onOk={createForm.submit}>
                <Form form={createForm} onFinish={handleCreate} layout="vertical">
                    <Form.Item name="name" label="单位名称" rules={[{ required: true, message: '请输入单位名称' }]}>
                        <Input placeholder="例如：xx小区" />
                    </Form.Item>
                    <Form.Item name="code" label="编号">
                        <Input placeholder="例如：A001" />
                    </Form.Item>
                    <Form.Item name="initialBalance" label="初始余额 (元)" rules={[{ required: true, message: '请输入初始余额' }]}>
                        <InputNumber style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                    <Form.Item name="unitPrice" label="单价 (元/GJ)" initialValue={88} rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="area" label="建筑面积 (㎡)">
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Quick Reading Modal */}
            <Modal
                title={`录入抄表: ${selectedUnit?.name || ''}`}
                open={isReadingModalOpen}
                onCancel={() => setIsReadingModalOpen(false)}
                onOk={readingForm.submit}
                confirmLoading={loading}
            >
                <Form form={readingForm} onFinish={handleSaveReading} layout="vertical">
                    <Form.Item name="readingDate" label="抄表日期" initialValue={dayjs()} rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="readingValue" label="热计量表总数 (吉焦 GJ)" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} placeholder="请输入累计读数" precision={2} />
                    </Form.Item>
                    <div className="text-gray-400 text-xs mt-2">
                        * 气温数据将根据日期自动从气象接口获取
                    </div>
                </Form>
            </Modal>
        </div>
    )
}
