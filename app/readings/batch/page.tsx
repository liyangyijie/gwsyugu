import { getUnitsForBatchEntry } from '@/actions/readings';
import BatchReadingForm from './BatchReadingForm';

export const dynamic = 'force-dynamic';

export default async function BatchReadingPage() {
    const res = await getUnitsForBatchEntry();
    const units = res.data || [];

    return (
        <div className="space-y-4">
            <BatchReadingForm units={units} />
        </div>
    );
}
