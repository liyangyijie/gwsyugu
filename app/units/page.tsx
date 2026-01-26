import { getUnits } from '../../actions/unit';
import UnitList from './UnitList';

export default async function UnitsPage() {
    const res = await getUnits();
    const units = res.data || [];

    return <UnitList units={units} />;
}
