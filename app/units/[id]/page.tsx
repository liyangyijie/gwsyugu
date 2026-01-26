import { getUnitById } from '@/actions/unit';
import UnitDetailClient from './UnitDetailClient';

export default async function UnitDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const unitId = parseInt(id);
    const res = await getUnitById(unitId);

    if (!res.success || !res.data) {
        return <div className="p-10 text-center text-red-500">单位未找到或发生错误</div>;
    }

    return <UnitDetailClient unit={res.data} />;
}
