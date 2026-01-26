'use client';
import { Table, Button, Modal, Form, InputNumber, DatePicker, Statistic, Row, Col, Card, message, Select, Input, Tag } from 'antd';
import { PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { rechargeUnit, adjustBalance } from '@/actions/transactions';
import dayjs from 'dayjs';

const TYPE_MAP: any = {
    'INITIAL': '初始余额',
    'RECHARGE': '充值',
    'DEDUCTION': '扣费',
    'ADJUSTMENT': '调整'
};

export default function FinancialTab({ unit, transactions }: { unit: any, transactions: any[] }) {
    const [actionType, setActionType] = useState<'recharge' | 'adjust' | null>(null);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const [messageApi, contextHolder] = message.useMessage();

    const columns = [
        { title: '日期', dataIndex: 'date', render: (d: Date) => dayjs(d).format('YYYY-MM-DD HH:mm') },
        { title: '类型', dataIndex: 'type', render: (t: string) => <Tag>{TYPE_MAP[t] || t}</Tag> },
        { title: '摘要', dataIndex: 'summary' },
        { title: '金额', dataIndex: 'amount', render: (v: any) => <span style={{ color: v > 0 ? 'green' : 'red', fontWeight: 'bold' }}>{v > 0 ? '+' : ''}{Number(v).toFixed(2)}</span> },
        { title: '余额', dataIndex: 'balanceAfter', render: (v: any) => Number(v).toFixed(2) },
        { title: '备注', dataIndex: 'remarks' },
    ];

    const handleSubmit = async (values: any) => {
        setLoading(true);
        let res;
        if (actionType === 'recharge') {
            res = await rechargeUnit(unit.id, values.amount, values.date.toDate(), values.remarks);
        } else {
            res = await adjustBalance(unit.id, values.adjustType, values.amount, values.date.toDate(), values.reason);
        }
        setLoading(false);
        if (res.success) {
            messageApi.success('操作成功');
            setActionType(null);
            form.resetFields();
            window.location.reload();
        } else {
            messageApi.error('操作失败: ' + res.error);
        }
    };

    return (
        <div>
             {contextHolder}
             <Row gutter={16} className="mb-6">
                <Col span={8}>
                    <Card variant="borderless" className="bg-blue-50">
                        <Statistic
                            title="当前账户余额"
                            value={unit.accountBalance}
                            precision={2}
                            styles={{ content: { color: Number(unit.accountBalance) < 0 ? '#cf1322' : '#3f8600' } }}
                            suffix="元"
                        />
                        <Button type="primary" className="mt-4 w-full" onClick={() => setActionType('recharge')}>预付款充值</Button>
                    </Card>
                </Col>
                <Col span={8}>
                     <Card variant="borderless" className="bg-gray-50">
                         <Statistic title="单价" value={unit.unitPrice} precision={2} suffix="元/GJ" />
                         <Button className="mt-4 w-full" onClick={() => setActionType('adjust')}>余额调整</Button>
                     </Card>
                </Col>
             </Row>

             <Table dataSource={transactions} columns={columns} rowKey="id" pagination={{ pageSize: 10 }} />

             {/* Recharge Modal */}
             <Modal
                title="预付款充值"
                open={actionType === 'recharge'}
                onCancel={() => setActionType(null)}
                onOk={form.submit}
                confirmLoading={loading}
             >
                 <Form form={form} onFinish={handleSubmit} layout="vertical">
                     <Form.Item name="amount" label="充值金额 (元)" rules={[{ required: true }]}>
                         <InputNumber style={{ width: '100%' }} min={0.01} precision={2} />
                     </Form.Item>
                     <Form.Item name="date" label="充值日期" initialValue={dayjs()} rules={[{ required: true }]}>
                         <DatePicker style={{ width: '100%' }} />
                     </Form.Item>
                     <Form.Item name="remarks" label="备注">
                         <Input />
                     </Form.Item>
                 </Form>
             </Modal>

             {/* Adjust Modal */}
             <Modal
                title="余额调整"
                open={actionType === 'adjust'}
                onCancel={() => setActionType(null)}
                onOk={form.submit}
                confirmLoading={loading}
             >
                 <Form form={form} onFinish={handleSubmit} layout="vertical">
                      <Form.Item name="adjustType" label="调整类型" initialValue="ADD">
                          <Select options={[{ label: '增加余额 (如退费)', value: 'ADD' }, { label: '扣除余额 (如修正)', value: 'SUBTRACT' }]} />
                      </Form.Item>
                      <Form.Item name="amount" label="调整金额 (元)" rules={[{ required: true }]}>
                          <InputNumber style={{ width: '100%' }} min={0.01} precision={2} />
                      </Form.Item>
                      <Form.Item name="reason" label="调整原因" rules={[{ required: true }]}>
                          <Input placeholder="例如：计费错误退款" />
                      </Form.Item>
                      <Form.Item name="date" label="调整日期" initialValue={dayjs()} rules={[{ required: true }]}>
                          <DatePicker style={{ width: '100%' }} />
                      </Form.Item>
                 </Form>
             </Modal>
        </div>
    )
}
