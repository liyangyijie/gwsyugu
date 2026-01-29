'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Table, Button, Modal, Form, InputNumber, DatePicker, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { saveMeterReading, deleteReading, updateReading } from '@/actions/readings';
import dayjs from 'dayjs';

export default function ReadingsTab({ unit, readings }: { unit: any, readings: any[] }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();
    const [messageApi, contextHolder] = message.useMessage();

    const handleDelete = async (id: number) => {
        setLoading(true);
        const res = await deleteReading(id);
        setLoading(false);
        if (res.success) {
            messageApi.success('删除成功');
            window.location.reload();
        } else {
            messageApi.error('删除失败: ' + res.error);
        }
    };

    const handleUpdate = async (values: any) => {
        if (!editingRecord) return;
        setLoading(true);
        const res = await updateReading(editingRecord.id, { readingValue: values.readingValue });
        setLoading(false);
        if (res.success) {
            messageApi.success('修改成功');
            setIsEditModalOpen(false);
            window.location.reload();
        } else {
            messageApi.error('修改失败: ' + res.error);
        }
    };

    const columns = [
        { title: '抄表日期', dataIndex: 'readingDate', render: (d: Date) => dayjs(d).format('YYYY-MM-DD') },
        { title: '热计量表总数 (GJ)', dataIndex: 'readingValue', render: (v: any) => Number(v).toFixed(2) },
        { title: '用量 (GJ)', dataIndex: 'heatUsage', render: (v: any) => v !== null ? Number(v).toFixed(2) : '-' },
        { title: '费用 (元)', dataIndex: 'costAmount', render: (v: any) => v !== null ? Number(v).toFixed(2) : '-' },
        {
            title: '状态',
            dataIndex: 'isBilled',
            render: (b: boolean, r: any) => {
                if (b) return <Tag color="green">已扣费</Tag>;
                if (r.heatUsage === 0 || r.costAmount === 0) return <Tag>无费用</Tag>;
                return <Tag color="orange">待处理</Tag>;
            }
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: any, index: number) => {
                // Only allow editing/deleting the latest record (index 0 because sorted desc)
                const isLatest = index === 0;
                return (
                    <div className="flex gap-2">
                        <Button
                            size="small"
                            icon={<EditOutlined />}
                            disabled={!isLatest}
                            onClick={() => {
                                setEditingRecord(record);
                                editForm.setFieldsValue({ readingValue: record.readingValue });
                                setIsEditModalOpen(true);
                            }}
                        />
                        <Popconfirm
                            title="确定要删除这条记录吗?"
                            description="删除后相关的扣费将被撤销。"
                            onConfirm={() => handleDelete(record.id)}
                            disabled={!isLatest}
                        >
                            <Button size="small" danger icon={<DeleteOutlined />} disabled={!isLatest} />
                        </Popconfirm>
                    </div>
                );
            }
        }
    ];

    const handleSave = async (values: any) => {
        setLoading(true);
        const data = {
            unitId: unit.id,
            readingDate: values.readingDate.toDate(),
            readingValue: values.readingValue,
        };
        const res = await saveMeterReading(data);
        setLoading(false);
        if (res.success) {
            messageApi.success('抄表记录已保存并自动计费');
            setIsModalOpen(false);
            form.resetFields();
            window.location.reload();
        } else {
            messageApi.error('保存失败: ' + res.error);
        }
    };

    return (
        <div>
            {contextHolder}
            <div className="flex justify-end mb-4">
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                    录入抄表
                </Button>
            </div>
            <Table dataSource={readings} columns={columns} rowKey="id" pagination={{ pageSize: 10 }} />

            {/* Create Modal */}
            <Modal
                title="录入抄表数据"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={form.submit}
                confirmLoading={loading}
            >
                <Form form={form} onFinish={handleSave} layout="vertical">
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

            {/* Edit Modal */}
            <Modal
                title="修改抄表数据"
                open={isEditModalOpen}
                onCancel={() => setIsEditModalOpen(false)}
                onOk={editForm.submit}
                confirmLoading={loading}
            >
                <Form form={editForm} onFinish={handleUpdate} layout="vertical">
                    <Form.Item name="readingValue" label="热计量表总数 (吉焦 GJ)" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} precision={2} />
                    </Form.Item>
                    <div className="text-orange-500 text-xs mt-2">
                        * 修改读数将自动重新计算用量和费用，并更新账户余额。
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
