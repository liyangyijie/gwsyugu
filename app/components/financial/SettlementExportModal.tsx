'use client';

import { Modal, DatePicker, Button, message, Form, Alert } from 'antd';
import { useState } from 'react';
import { exportSettlementReport } from '@/actions/export';
import dayjs from 'dayjs';
import { DownloadOutlined } from '@ant-design/icons';

export default function SettlementExportModal({ open, onCancel }: { open: boolean, onCancel: () => void }) {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleExport = async (values: any) => {
        setLoading(true);
        try {
            const [start, end] = values.dateRange;
            // Ensure end date includes the full day (23:59:59) for coverage
            const endDate = end.endOf('day').toDate();
            const startDate = start.startOf('day').toDate();

            const res = await exportSettlementReport(startDate, endDate);

            if (res.success && res.data) {
                // Decode Base64 to Blob
                const binaryString = window.atob(res.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                link.download = `结算报表_${start.format('YYYYMMDD')}_${end.format('YYYYMMDD')}.xlsx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                message.success('导出成功');
                onCancel();
            } else {
                message.error(res.error || '导出失败');
            }
        } catch (error) {
            console.error(error);
            message.error('系统错误');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title="导出结算报表"
            open={open}
            onCancel={onCancel}
            footer={null}
        >
            <Alert
                message="结算规则说明"
                description={
                    <ul className="list-disc pl-4 text-xs">
                        <li><b>账户总充费额</b>: 仅包含初始余额和直接充值金额，不包含共用账户转账调整。</li>
                        <li><b>截止日账户余额</b>: 截止日当天的账户快照余额。</li>
                        <li><b>抄表数查找</b>: 若选定日期无数据，起始日向后查找最近数据，截止日向前查找最近数据，并在备注中标注。</li>
                    </ul>
                }
                type="info"
                showIcon
                className="mb-4"
            />
            <Form form={form} onFinish={handleExport} layout="vertical">
                <Form.Item
                    name="dateRange"
                    label="选择结算时间段"
                    rules={[{ required: true, message: '请选择时间段' }]}
                    initialValue={[dayjs().startOf('year'), dayjs()]}
                >
                    <DatePicker.RangePicker style={{ width: '100%' }} />
                </Form.Item>
                <div className="flex justify-end gap-2">
                    <Button onClick={onCancel}>取消</Button>
                    <Button type="primary" htmlType="submit" icon={<DownloadOutlined />} loading={loading}>
                        生成并导出Excel
                    </Button>
                </div>
            </Form>
        </Modal>
    );
}
