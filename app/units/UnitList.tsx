'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Table, Tag, Button, Input, Modal, Form, InputNumber, DatePicker, message, Popconfirm, Grid, Card } from 'antd';
import { PlusOutlined, SearchOutlined, FormOutlined, DeleteOutlined, CalculatorOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createUnit, deleteUnit, deleteUnits } from '@/actions/unit';
import { saveMeterReading } from '@/actions/readings';
import { calculateBatchParams } from '@/actions/prediction';
import dayjs from 'dayjs';

const { useBreakpoint } = Grid;

export default function UnitList({
    initialUnits,
    total,
    currentPage,
    pageSize,
    initialQuery,
    initialSortField,
    initialSortOrder
}: {
    initialUnits: any[],
    total: number,
    currentPage: number,
    pageSize: number,
    initialQuery: string,
    initialSortField?: string,
    initialSortOrder?: string
}) {
    const router = useRouter();
    const [searchText, setSearchText] = useState(initialQuery);
    const [messageApi, contextHolder] = message.useMessage();
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    const screens = useBreakpoint();
    const isMobile = !screens.md;

    // Create Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createForm] = Form.useForm();

    // Reading Modal State
    const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
    const [readingForm] = Form.useForm();
    const [selectedUnit, setSelectedUnit] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // Server-side filtering
    // const filteredUnits = units.filter(u => u.name.includes(searchText));

    const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
        setSelectedRowKeys(newSelectedRowKeys);
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: onSelectChange,
    };

    const hasSelected = selectedRowKeys.length > 0;

    const handleTableChange = (pagination: any, filters: any, sorter: any) => {
        const params = new URLSearchParams();
        if (searchText) params.set('q', searchText);
        params.set('page', pagination.current.toString());
        params.set('pageSize', pagination.pageSize.toString());

        if (sorter.field) {
            params.set('sortField', sorter.field as string);
            params.set('sortOrder', sorter.order === 'ascend' ? 'asc' : 'desc');
        }

        router.push(`/units?${params.toString()}`);
    };

    const onSearch = (value: string) => {
        const params = new URLSearchParams();
        if (value) params.set('q', value);
        params.set('page', '1');
        router.push(`/units?${params.toString()}`);
    };

    const handleBatchDelete = async () => {
        setLoading(true);
        try {
            const res = await deleteUnits(selectedRowKeys as number[]);
            if (res.success) {
                messageApi.success('批量删除成功');
                setSelectedRowKeys([]);
                router.refresh();
            } else {
                messageApi.error(res.error);
            }
        } catch {
            messageApi.error('操作失败');
        } finally {
            setLoading(false);
        }
    };

    const handleBatchCalculate = async () => {
        setLoading(true);
        messageApi.loading('正在批量计算参数，请稍候...', 0); // Keep loading
        try {
            const res = await calculateBatchParams(selectedRowKeys as number[]);
            messageApi.destroy();
            if (res.success) {
                messageApi.success(`计算完成: 成功 ${res.successCount}, 失败 ${res.failCount}`);
                setSelectedRowKeys([]);
                router.refresh();
            } else {
                messageApi.error(res.error);
            }
        } catch {
            messageApi.destroy();
            messageApi.error('操作失败');
        } finally {
            setLoading(false);
        }
    };

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
        } catch {
            messageApi.error('系统错误');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: '编号',
            dataIndex: 'code',
            key: 'code',
            sorter: true,
            sortOrder: initialSortField === 'code' ? (initialSortOrder === 'asc' ? 'ascend' : 'descend') : null,
        },
        {
            title: '单位名称',
            dataIndex: 'name',
            key: 'name',
            sorter: true,
            sortOrder: initialSortField === 'name' ? (initialSortOrder === 'asc' ? 'ascend' : 'descend') : null,
            render: (text: string, record: any) => (
                <a onClick={() => router.push(`/units/${record.id}`)} className="font-medium text-blue-600 hover:text-blue-800">
                    {text}
                </a>
            ),
        },
        {
            title: '账户余额 (元)',
            dataIndex: 'accountBalance',
            key: 'accountBalance',
            sorter: true,
            sortOrder: initialSortField === 'accountBalance' ? (initialSortOrder === 'asc' ? 'ascend' : 'descend') : null,
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
            messageApi.success('单位创建成功');
        } else {
            messageApi.error(res.error);
        }
    };

    useEffect(() => {
        setSearchText(initialQuery);
    }, [initialQuery]);

    // Render logic for Mobile Card View
    const renderMobileCards = () => (
        <div className="grid grid-cols-1 gap-4">
            {initialUnits.map(unit => (
                <Card
                    key={unit.id}
                    title={
                        <div className="flex justify-between items-center">
                            <span onClick={() => router.push(`/units/${unit.id}`)} className="text-blue-600 font-medium cursor-pointer">
                                {unit.name}
                            </span>
                            {Number(unit.accountBalance) < 0 ? <Tag color="red">欠费</Tag> : <Tag color="green">正常</Tag>}
                        </div>
                    }
                    size="small"
                    className={Number(unit.accountBalance) < 0 ? 'bg-red-50 border-red-100' : ''}
                    actions={[
                        <Button type="text" size="small" icon={<FormOutlined />} onClick={() => openReadingModal(unit)} key="read">抄表</Button>,
                        <Popconfirm
                            key="del"
                            title="确定删除?"
                            onConfirm={() => handleDeleteUnit(unit.id)}
                            okText="是"
                            cancelText="否"
                        >
                            <Button type="text" danger size="small" icon={<DeleteOutlined />}>删除</Button>
                        </Popconfirm>
                    ]}
                >
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-500">余额:</span>
                        <span className={`font-bold ${Number(unit.accountBalance) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {Number(unit.accountBalance).toFixed(2)} 元
                        </span>
                    </div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-500">单价:</span>
                        <span>{Number(unit.unitPrice).toFixed(2)} 元/GJ</span>
                    </div>
                </Card>
            ))}
        </div>
    );

    return (
        <div className="space-y-4 bg-white p-4 md:p-6 rounded-lg shadow-sm">
            {contextHolder}
            <div className={`flex ${isMobile ? 'flex-col gap-3' : 'justify-between items-center'} mb-4`}>
                <h2 className="text-xl font-bold">单位管理</h2>
                <div className={`flex gap-2 items-center ${isMobile ? 'w-full flex-wrap' : ''}`}>
                    {hasSelected && !isMobile && (
                        <div className="flex gap-2 mr-4 bg-gray-50 p-1 rounded border border-gray-200">
                            <span className="px-2 text-sm text-gray-500 self-center">已选 {selectedRowKeys.length} 项</span>
                            <Popconfirm title="确定删除选中单位?" onConfirm={handleBatchDelete} okText="确定" cancelText="取消">
                                <Button danger size="small" icon={<DeleteOutlined />}>批量删除</Button>
                            </Popconfirm>
                            <Button type="primary" size="small" icon={<CalculatorOutlined />} onClick={handleBatchCalculate}>批量预测计算</Button>
                        </div>
                    )}
                    <Input.Search
                        placeholder="搜索单位名称"
                        allowClear
                        enterButton={<SearchOutlined />}
                        style={{ width: isMobile ? '100%' : 250 }}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        onSearch={onSearch}
                    />
                    <Button onClick={() => router.push('/readings/batch')}>
                        批量抄表
                    </Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)} className={isMobile ? 'w-full' : ''}>
                        添加单位
                    </Button>
                </div>
            </div>

            {isMobile ? renderMobileCards() : (
                <Table
                    rowSelection={rowSelection}
                    dataSource={initialUnits}
                    columns={columns}
                    rowKey="id"
                    rowClassName={(record) => Number(record.accountBalance) < 0 ? 'bg-red-50' : ''}
                    pagination={{
                        current: currentPage,
                        pageSize: pageSize,
                        total: total,
                        size: 'small',
                        showSizeChanger: true
                    }}
                    onChange={handleTableChange}
                    scroll={{ x: true }}
                />
            )}

            {/* Create Unit Modal */}
            <Modal
                title="添加新单位"
                open={isCreateModalOpen}
                onCancel={() => setIsCreateModalOpen(false)}
                onOk={createForm.submit}
                width={isMobile ? '95%' : 520}
                style={{ top: isMobile ? 20 : 100 }}
            >
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
                width={isMobile ? '95%' : 520}
                style={{ top: isMobile ? 20 : 100 }}
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
