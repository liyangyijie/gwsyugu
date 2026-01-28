import { getUnits } from '../../actions/unit';
import UnitList from './UnitList';

export default async function UnitsPage() {
    const res = await getUnits();
    if (!res.success) {
        console.error("Units page fetch error:", res.error);
    }
    const units = res.data || [];

    return (
        <>
            {!res.success && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{res.error}</span>
                </div>
            )}
            <UnitList units={units} />
        </>
    );
}
