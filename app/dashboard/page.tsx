import { getDashboardStats } from '@/actions/stats';
import { Card, Statistic, Row, Col, Alert } from 'antd';
import { UserOutlined, WarningOutlined, BankOutlined, WalletOutlined } from '@ant-design/icons';

export default async function DashboardPage() {
    const res = await getDashboardStats();
    const stats = res.data || { totalBalance: 0, arrearsCount: 0, arrearsAmount: 0, unitCount: 0 };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">系统概览</h2>

            {stats.arrearsCount > 0 && (
                <Alert
                    message={`当前有 ${stats.arrearsCount} 家单位欠费，总欠费 ${stats.arrearsAmount.toFixed(2)} 元`}
                    type="error"
                    showIcon
                    className="mb-4 shadow-sm"
                />
            )}

            <Row gutter={16}>
                <Col span={6}>
                    <Card variant="borderless" className="shadow-sm hover:shadow-md transition-all">
                        <Statistic
                            title="总账户余额"
                            value={stats.totalBalance}
                            precision={2}
                            // @ts-expect-error Ant Design styles prop issue
                            styles={{ content: { color: stats.totalBalance >= 0 ? '#3f8600' : '#cf1322' } }}
                            prefix={<BankOutlined />}
                            suffix="元"
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card variant="borderless" className="shadow-sm hover:shadow-md transition-all">
                        <Statistic
                            title="单位总数"
                            value={stats.unitCount}
                            prefix={<UserOutlined />}
                            suffix="家"
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card variant="borderless" className="shadow-sm hover:shadow-md transition-all">
                        <Statistic
                            title="欠费单位"
                            value={stats.arrearsCount}
                            // @ts-expect-error Ant Design styles prop issue
                            styles={{ content: { color: '#cf1322' } }}
                            prefix={<WarningOutlined />}
                            suffix="家"
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card variant="borderless" className="shadow-sm hover:shadow-md transition-all">
                        <Statistic
                            title="欠费总额"
                            value={stats.arrearsAmount}
                            precision={2}
                            // @ts-expect-error Ant Design styles prop issue
                            styles={{ content: { color: '#cf1322' } }}
                            prefix={<WalletOutlined />}
                            suffix="元"
                        />
                    </Card>
                </Col>
            </Row>

            <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="text-lg font-medium mb-4">快捷操作</h3>
                <div className="text-gray-500">
                    暂无快捷操作。请前往“单位管理”进行操作。
                </div>
            </div>
        </div>
    );
}
