import * as XLSX from 'xlsx';

const wb = XLSX.readFile('../บัญชืเงินกู้.xlsx');
const ws = wb.Sheets['รายวัน12-24วัน'];
const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });

function isTp(cell: unknown): boolean {
  const t = String(cell ?? '').trim().replace(/\.$/, '');
  return t === 'ท+ป' || t === 'ท+ป.' || t.includes('ท+ป');
}

function toNum(cell: unknown): number | null {
  const n = Number(String(cell ?? '').replace(/,/g, '').replace(/^\$/, ''));
  return isNaN(n) || n <= 0 ? null : n;
}

const samples: unknown[] = [];

for (let r = 1; r < rows.length; r++) {
  const row = rows[r] || [];
  const daily = toNum(row[2]);
  const startCol = 4;
  for (let i = 0; i < 24; i++) {
    const cell = row[startCol + i];
    if (!isTp(cell)) continue;
    const before: number[] = [];
    for (let j = 0; j < i; j++) {
      const n = toNum(row[startCol + j]);
      if (n != null) before.push(n);
    }
    const after: { day: number; val: string }[] = [];
    for (let j = i + 1; j < Math.min(i + 5, 24); j++) {
      const c = String(row[startCol + j] ?? '').trim();
      if (c) after.push({ day: j + 1, val: c });
    }
    samples.push({
      row: r + 1,
      name: String(row[0]).trim(),
      principal: row[1],
      daily,
      tpDay: i + 1,
      paidBefore: before.length,
      lastPay: before[before.length - 1],
      after,
    });
    if (samples.length >= 8) break;
  }
  if (samples.length >= 8) break;
}

// Check if any day after ท+ป has amount > daily*1.5
let higherAfter = 0;
let sameAfter = 0;
for (let r = 1; r < rows.length; r++) {
  const row = rows[r] || [];
  const daily = toNum(row[2]) ?? 0;
  if (!daily) continue;
  for (let i = 0; i < 23; i++) {
    if (!isTp(row[4 + i])) continue;
    const next = toNum(row[4 + i + 1]);
    if (next == null) continue;
    if (next > daily * 1.2) higherAfter++;
    else if (next === daily) sameAfter++;
  }
}

console.log('samples:', JSON.stringify(samples, null, 2));
console.log('after ท+ป: higher amount next day:', higherAfter, 'same daily:', sameAfter);
