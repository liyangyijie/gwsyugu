
const XLSX = require('xlsx');
const filename = '/Users/liyang/VPS/gwsyugu/2026.1.25.xls';

try {
    const workbook = XLSX.readFile(filename);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Read raw data to see structure
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log("First 10 rows:");
    console.log(JSON.stringify(data.slice(0, 10), null, 2));
} catch (e) {
    console.error(e);
}
