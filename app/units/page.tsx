import { getUnits } from '../../actions/unit';
import UnitList from './UnitList';

export const dynamic = 'force-dynamic';

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const resolvedParams = await searchParams;
    const page = typeof resolvedParams.page === 'string' ? parseInt(resolvedParams.page) : 1;
    const pageSize = typeof resolvedParams.pageSize === 'string' ? parseInt(resolvedParams.pageSize) : 10;
    const query = typeof resolvedParams.q === 'string' ? resolvedParams.q : '';
    const sortField = typeof resolvedParams.sortField === 'string' ? resolvedParams.sortField : undefined;
    const sortOrder = typeof resolvedParams.sortOrder === 'string' ? (resolvedParams.sortOrder as 'asc' | 'desc') : undefined;

    const res = await getUnits({ page, pageSize, query, sortField, sortOrder });

    if (!res.success) {
        console.error("Units page fetch error:", res.error);
    }
    const units = res.data || [];
    const total = res.total || 0;

    return (
        <>
            {!res.success && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{res.error}</span>
                </div>
            )}
            <UnitList
                initialUnits={units}
                total={total}
                currentPage={page}
                pageSize={pageSize}
                initialQuery={query}
            />
        </>
    );
}
