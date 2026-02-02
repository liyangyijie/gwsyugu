import { getAllTransactions } from '@/actions/transactions';
import FinancialList from './FinancialList';

export const dynamic = 'force-dynamic';

export default async function FinancialPage() {
    const res = await getAllTransactions();
    const transactions = res.data || [];

    return <FinancialList transactions={transactions} />;
}
