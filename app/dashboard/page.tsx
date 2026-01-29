import { getDashboardStats } from '@/actions/stats';
import { Card, Statistic, Row, Col, Alert, Tag } from 'antd';
import { UserOutlined, WarningOutlined, BankOutlined, WalletOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { OneClickCalculateButton } from './DashboardActions';

export default async function DashboardPage() {
    const res = await getDashboardStats();
    const stats = res.data || { totalBalance: 0, arrearsCount: 0, arrearsAmount: 0, unitCount: 0, warningUnits: [] };

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

            {/* Prediction Warnings */}
            <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                        <WarningOutlined className="text-orange-500" />
                        预测预警 (剩余不足30天)
                    </h3>
                    <OneClickCalculateButton />
                </div>

                {stats.warningUnits && stats.warningUnits.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {stats.warningUnits.map((u: any) => (
                            <Link href={`/units/${u.id}`} key={u.id} className="block hover:no-underline">
                                <Card size="small" hoverable className="border-l-4 border-l-orange-500 h-full">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-bold text-gray-800 truncate pr-2" title={u.name}>{u.name}</span>
                                        <Tag color={u.remainingDays < 15 ? 'red' : 'orange'}>
                                            剩 {u.remainingDays} 天
                                        </Tag>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        预计可用至: {u.estimatedDate || '-'}
                                    </div>
                                </Card>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="text-gray-400 text-center py-8 bg-gray-50 rounded border border-dashed border-gray-200">
                        暂无预警单位 (所有单位余额充足或未进行预测)
                    </div>
                )}
            </div>
        </div>
    );
}
