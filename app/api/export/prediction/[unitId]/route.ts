import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getPrediction } from '@/actions/prediction';
import prisma from '@/lib/prisma';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ unitId: string }> }
) {
    try {
        const { unitId: unitIdStr } = await params;
        const unitId = parseInt(unitIdStr);
        if (isNaN(unitId)) {
            return NextResponse.json({ error: 'Invalid Unit ID' }, { status: 400 });
        }

        // Fetch prediction data (forceRefresh=false to use cache if available)
        const res = await getPrediction(unitId, false);

        if (!res.success || !res.data) {
            return NextResponse.json({ error: res.error || 'No prediction data available' }, { status: 404 });
        }

        const data = res.data;
        const unit = await prisma.unit.findUnique({ where: { id: unitId } });

        // Create Workbook
        const wb = XLSX.utils.book_new();

        // Sheet 1: Summary & Params
        const summaryData = [
            ['单位名称', unit?.name || ''],
            ['当前余额', data.currentBalance],
            ['预计剩余天数', data.remainingDays],
            ['预计欠费日期', data.estimatedDate],
            ['', ''],
            ['计算参数', ''],
            ['基准热量 (BaseHeat)', unit?.baseHeat],
            ['温度系数 (TempCoeff)', unit?.tempCoeff],
            ['基准温度 (BaseTemp)', unit?.baseTemp],
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "概览");

        // Sheet 2: Future Prediction (Log)
        // log: [{date, temp, heat, cost, balance}]
        if (data.log && data.log.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const logData = data.log.map((item: any) => ({
                '日期': item.date,
                '预测气温 (℃)': parseFloat(item.temp),
                '预计用热 (GJ)': parseFloat(item.heat),
                '预计费用 (元)': parseFloat(item.cost),
                '账户余额 (元)': parseFloat(item.balance)
            }));
            const wsLog = XLSX.utils.json_to_sheet(logData);
            XLSX.utils.book_append_sheet(wb, wsLog, "未来预测详情");
        }

        // Sheet 3: History Simulation
        // history: [{date, temp, dailyHeat, type}]
        if (data.history && data.history.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const historyData = data.history.map((item: any) => ({
                '日期': item.date,
                '实际气温 (℃)': parseFloat(item.temp),
                '日均用热 (GJ)': parseFloat(item.dailyHeat)
            }));
            const wsHistory = XLSX.utils.json_to_sheet(historyData);
            XLSX.utils.book_append_sheet(wb, wsHistory, "历史模拟数据");
        }

        // Generate Buffer
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Return Response
        const filename = `Prediction_${unit?.name}_${new Date().toISOString().slice(0, 10)}.xlsx`;

        return new NextResponse(buf, {
            status: 200,
            headers: {
                'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
        });
    } catch (e) {
        console.error("Export Error:", e);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
}
