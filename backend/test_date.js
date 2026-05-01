function parseExcelDate(val) {
  if (!val) return new Date();
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (d.getFullYear() < 2000) d.setFullYear(d.getFullYear() + 57);
    return d;
  }
  if (typeof val === 'string') {
    const match = val.match(/(\d+)\s*-\s*([ก-ฮa-zA-Z]+[.]?[ก-ฮa-zA-Z]*[.]?)\s*-\s*(\d+)/);
    if (match) {
      const day = parseInt(match[1]);
      const mStr = match[2].replace(/\./g, '');
      const monthMap = {'มค':0, 'กพ':1, 'มีค':2, 'เมย':3, 'พค':4, 'มิย':5, 'กค':6, 'สค':7, 'กย':8, 'ตค':9, 'พย':10, 'ธค':11};
      const month = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
      let year = parseInt(match[3]);
      if (year < 100) year += 2500; 
      if (year > 2500) year -= 543; 
      return new Date(year, month, day);
    }
  }
  return new Date();
}

console.log('25093 ->', parseExcelDate(25093));
console.log('25130 ->', parseExcelDate(25130));
console.log('25-ต.ค-68 ->', parseExcelDate('25-ต.ค-68'));
console.log('12-ก.ย.-68 ->', parseExcelDate('12-ก.ย.-68'));
