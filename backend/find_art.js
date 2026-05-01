const xlsx = require('xlsx');

const workbook = xlsx.readFile('data.xlsx');

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  for (let r = 0; r < json.length; r++) {
    const row = json[r];
    if (row.includes('อาร์ท')) {
      console.log(`Found "อาร์ท" in sheet "${sheetName}" at row ${r + 1}:`, row);
    }
  }
}
