const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1, 'มค': 1, 'มกราคม': 1,
  'ก.พ.': 2, 'กพ': 2, 'กุมภาพันธ์': 2,
  'มี.ค.': 3, 'มีค': 3, 'มีนาคม': 3,
  'เม.ย.': 4, 'เมย': 4, 'เมษายน': 4,
  'พ.ค.': 5, 'พค': 5, 'พฤษภาคม': 5,
  'มิ.ย.': 6, 'มิย': 6, 'มิถุนายน': 6,
  'ก.ค.': 7, 'กค': 7, 'กรกฎาคม': 7,
  'ส.ค.': 8, 'สค': 8, 'สิงหาคม': 8,
  'ก.ย.': 9, 'กย': 9, 'กันยายน': 9,
  'ต.ค.': 10, 'ตค': 10, 'ตุลาคม': 10,
  'พ.ย.': 11, 'พย': 11, 'พฤศจิกายน': 11,
  'ธ.ค.': 12, 'ธค': 12, 'ธันวาคม': 12,
};

const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** ลบตัวคั่น (จุด/ขีด/ช่องว่าง) ออกจากชื่อเดือน เพื่อให้ทนรูปแบบเพี้ยน เช่น "เม-ย." -> "เมย" */
function stripMonthSeparators(s: string): string {
  return s.replace(/[.\s\-]/g, '');
}

// ตารางค้นหาเดือนแบบไม่มีตัวคั่น (สร้างจาก THAI_MONTHS) สำหรับ fallback
const THAI_MONTHS_BARE: Record<string, number> = Object.fromEntries(
  Object.entries(THAI_MONTHS).map(([key, value]) => [stripMonthSeparators(key), value]),
);

/** ค้นหาเลขเดือนจากคีย์ไทย รองรับทั้งแบบมีจุดมาตรฐานและแบบตัวคั่นเพี้ยน */
function lookupThaiMonth(monthKey: string): number | undefined {
  return THAI_MONTHS[monthKey] ?? THAI_MONTHS_BARE[stripMonthSeparators(monthKey)];
}

function padDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** แปลงเลขปีให้เป็น ค.ศ. รองรับ พ.ศ.เต็ม/ย่อ และ ค.ศ.เต็ม */
function beShortToCe(yearPart: number): number {
  if (yearPart >= 2400) return yearPart - 543; // พ.ศ. เต็ม เช่น 2569 -> 2026
  if (yearPart >= 1000) return yearPart;        // ค.ศ. เต็มอยู่แล้ว เช่น 2026
  if (yearPart >= 100) return yearPart - 543;   // พ.ศ. 3 หลัก (พบยาก)
  return yearPart + 1957;                        // พ.ศ. ย่อ 2 หลัก เช่น 69 -> 2026
}

/** Parse Thai / Excel-formatted dates e.g. 19-Oct-68, 12-ก.ค.-67, 9 พ.ค. 69 */
export function parseThaiDate(value: unknown): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    // ใช้ส่วนประกอบ local ตรงๆ กันคลาดเคลื่อน 1 วันจาก timezone (toISOString แปลงเป็น UTC)
    return padDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const raw = String(value).trim();
  if (!raw || raw.startsWith('#')) return null;

  // DD-Mon-YY (Excel Thai display)
  const enMatch = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (enMatch) {
    const day = parseInt(enMatch[1], 10);
    const month = EN_MONTHS[enMatch[2].toLowerCase()];
    const yearPart = parseInt(enMatch[3], 10);
    const year = yearPart > 2400 ? yearPart - 543 : beShortToCe(yearPart);
    if (month) return padDate(year, month, day);
  }

  // DD-MMM-YY Thai month with dots e.g. 12-ก.ค.-67
  const thDashMatch = raw.match(/^(\d{1,2})-(.+?)-(\d{2,4})$/);
  if (thDashMatch) {
    const day = parseInt(thDashMatch[1], 10);
    const monthKey = thDashMatch[2].trim();
    const month = lookupThaiMonth(monthKey);
    const yearPart = parseInt(thDashMatch[3], 10);
    const year = yearPart > 2400 ? yearPart - 543 : beShortToCe(yearPart);
    if (month) return padDate(year, month, day);
  }

  // D MMM YY with spaces e.g. 9 พ.ค. 69
  const thSpaceMatch = raw.match(/^(\d{1,2})\s+(.+?)\s+(\d{2,4})$/);
  if (thSpaceMatch) {
    const day = parseInt(thSpaceMatch[1], 10);
    const monthKey = thSpaceMatch[2].trim();
    const month = lookupThaiMonth(monthKey);
    const yearPart = parseInt(thSpaceMatch[3], 10);
    const year = yearPart > 2400 ? yearPart - 543 : beShortToCe(yearPart);
    if (month) return padDate(year, month, day);
  }

  // Numeric Excel serial
  const num = Number(raw);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + num * 86400000);
    if (!isNaN(d.getTime())) return padDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  return null;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** พ.ศ. แบบย่อ เช่น 69 = 2569, 68 = 2568 */
export function isoToBeShort(isoDate: string): number {
  const ceYear = parseInt(isoDate.slice(0, 4), 10);
  return ceYear - 1957;
}

export function beShortToCeYear(beShort: number): number {
  return beShort + 1957;
}
