const xlsx = require('xlsx');

const workbook = xlsx.readFile('data.xlsx');
console.log('Sheet Names:', workbook.SheetNames);

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n--- Sheet: ${sheetName} ---`);
  // Print first 10 rows
  for (let i = 0; i < Math.min(10, json.length); i++) {
    console.log(json[i]);
  }
}
