import { getAllTransactions } from '@/actions/transactions';
import FinancialList from './FinancialList';

export const dynamic = 'force-dynamic';

export default async function FinancialPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 20;
    const type = params.type as string;
    const startDate = params.startDate as string;
    const endDate = params.endDate as string;

    const res = await getAllTransactions({ page, pageSize, type, startDate, endDate });
    const transactions = res.data || [];
    const total = res.total || 0;

    return (
        <FinancialList
            transactions={transactions}
            total={total}
            currentPage={page}
            pageSize={pageSize}
            initialType={type}
            initialStartDate={startDate}
            initialEndDate={endDate}
        />
    );
}
