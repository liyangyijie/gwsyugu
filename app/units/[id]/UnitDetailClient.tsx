'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Tabs, Descriptions, Tag, Button, Statistic, Modal, Form, Input, InputNumber, message, Select, Grid } from 'antd';
import { EditOutlined, FireOutlined, ClockCircleOutlined, CalendarOutlined, WalletOutlined } from '@ant-design/icons';
import ReadingsTab from '../../components/unit/ReadingsTab';
import FinancialTab from '../../components/unit/FinancialTab';
import PredictionTab from '../../components/unit/PredictionTab';
import { useEffect, useState } from 'react';
import { getPrediction } from '@/actions/prediction';
import { updateUnit, getPotentialParents } from '@/actions/unit';
import dayjs from 'dayjs';

const { useBreakpoint } = Grid;

export default function UnitDetailClient({ unit }: { unit: any }) {
    const [prediction, setPrediction] = useState<any>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [potentialParents, setPotentialParents] = useState<any[]>([]);
    const [editForm] = Form.useForm();
    const [messageApi, contextHolder] = message.useMessage();

    const screens = useBreakpoint();
    const isMobile = !screens.md;

    // Calculate Heating Duration
    const readings = unit.readings || [];
    let heatingDays = 0;
    if (readings.length > 0) {
        const firstDate = dayjs(readings[readings.length - 1].readingDate); // Sorted desc, so last is first
        const lastDate = dayjs(readings[0].readingDate);
        heatingDays = lastDate.diff(firstDate, 'day') + 1; // Inclusive
    }

    useEffect(() => {
        // Fetch simple prediction for header
        getPrediction(unit.id).then((res: any) => {
            if (res.success) {
                setPrediction(res.data);
            }
        });
    }, [unit.id]);

    const handleEdit = async (values: any) => {
        const res = await updateUnit(unit.id, values);
        if (res.success) {
            messageApi.success('单位信息更新成功');
            setIsEditModalOpen(false);
            window.location.reload();
        } else {
            messageApi.error('更新失败');
        }
    };

    const items = [
        {
            key: 'readings',
            label: '抄表记录',
            children: <ReadingsTab unit={unit} readings={unit.readings} />,
        },
        {
            key: 'financial',
            label: '余额管理',
            children: <FinancialTab unit={unit} transactions={unit.transactions} />,
        },
        {
            key: 'prediction',
            label: '预测分析',
            children: <PredictionTab unit={unit} />,
        },
        {
            key: 'info',
            label: '基本信息',
            children: (
                <Descriptions bordered column={isMobile ? 1 : 2} className="mt-4">
                    <Descriptions.Item label="单位名称">{unit.name}</Descriptions.Item>
                    <Descriptions.Item label="编号">{unit.code || '-'}</Descriptions.Item>
                    <Descriptions.Item label="单价">{Number(unit.unitPrice).toFixed(2)} 元/GJ</Descriptions.Item>
                    <Descriptions.Item label="建筑面积">{unit.area || '-'} ㎡</Descriptions.Item>
                    <Descriptions.Item label="联系信息">{unit.contactInfo || '-'}</Descriptions.Item>
                    <Descriptions.Item label="创建时间">{new Date(unit.createdAt).toLocaleDateString()}</Descriptions.Item>
                    <Descriptions.Item label="备注" span={isMobile ? 1 : 2}>{unit.remarks || '-'}</Descriptions.Item>
                </Descriptions>
            )
        }
    ];

    return (
        <div className="space-y-6">
            {contextHolder}
            {/* Header / Top Card */}
            <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm">
                <div className={`flex ${isMobile ? 'flex-col gap-4' : 'justify-between items-start'} mb-6 border-b pb-4`}>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3 flex-wrap">
                            {unit.name}
                            {Number(unit.accountBalance) < 0 ? <Tag color="red">欠费</Tag> : <Tag color="green">正常</Tag>}
                        </h1>
                        <p className="text-gray-500 mt-1">{unit.code}</p>
                    </div>
                    <Button icon={<EditOutlined />} onClick={() => {
                        editForm.setFieldsValue({
                            name: unit.name,
                            code: unit.code,
                            contactInfo: unit.contactInfo,
                            area: unit.area,
                            unitPrice: Number(unit.unitPrice),
                            remarks: unit.remarks,
                            parentUnitId: unit.parentUnitId
                        });
                        getPotentialParents(unit.id).then(res => {
                            if (res.success && Array.isArray(res.data)) {
                                setPotentialParents(res.data);
                            }
                        });
                        setIsEditModalOpen(true);
                    }} block={isMobile}>修改信息</Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Statistic
                        title="当前余额"
                        value={Number(unit.parentUnit ? unit.parentUnit.accountBalance : unit.accountBalance).toFixed(2)}
                        prefix={<WalletOutlined />}
                        suffix={unit.parentUnit ? <span className="text-xs text-gray-500 ml-2 block md:inline">(共用: {unit.parentUnit.name})</span> : "元"}
                        valueStyle={{ color: Number(unit.parentUnit ? unit.parentUnit.accountBalance : unit.accountBalance) < 0 ? '#cf1322' : '#3f8600', fontSize: isMobile ? '1.2rem' : undefined }}
                    />
                    <Statistic
                        title="供暖时长"
                        value={heatingDays}
                        prefix={<FireOutlined />}
                        suffix="天"
                        valueStyle={{ fontSize: isMobile ? '1.2rem' : undefined }}
                    />
                    <Statistic
                        title="预计可用至"
                        value={prediction?.estimatedDate || '-'}
                        prefix={<CalendarOutlined />}
                        valueStyle={{ fontSize: isMobile ? '1rem' : '1.2rem' }}
                    />
                    <Statistic
                        title="剩余天数"
                        value={prediction?.remainingDays ?? '-'}
                        prefix={<ClockCircleOutlined />}
                        suffix="天"
                        valueStyle={{ fontSize: isMobile ? '1.2rem' : undefined }}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm overflow-hidden">
                <Tabs
                    defaultActiveKey="readings"
                    items={items}
                    type={isMobile ? "line" : "card"}
                    className="overflow-x-auto"
                />
            </div>

            {/* Edit Modal */}
            <Modal
                title="修改单位信息"
                open={isEditModalOpen}
                onCancel={() => setIsEditModalOpen(false)}
                onOk={editForm.submit}
                width={isMobile ? '95%' : 520}
                style={{ top: isMobile ? 20 : 100 }}
            >
                <Form form={editForm} onFinish={handleEdit} layout="vertical">
                    <Form.Item name="name" label="单位名称" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="code" label="编号">
                        <Input />
                    </Form.Item>
                    <Form.Item name="parentUnitId" label="共用资金账户 (父单位)" tooltip="绑定后，本单位资金将合并至父单位统一管理">
                        <Select
                            allowClear
                            showSearch
                            placeholder="选择父单位 (留空则为独立账户)"
                            optionFilterProp="label"
                            options={potentialParents.map((p: any) => ({ label: `${p.name} (${p.code || '-'})`, value: p.id }))}
                        />
                    </Form.Item>
                    <Form.Item name="unitPrice" label="单价 (元/GJ)" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="area" label="建筑面积 (㎡)">
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="contactInfo" label="联系方式">
                        <Input />
                    </Form.Item>
                    <Form.Item name="remarks" label="备注">
                        <Input.TextArea />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
