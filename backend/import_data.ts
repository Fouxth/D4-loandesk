import xlsx from 'xlsx';
import sql from './src/db';
import * as dotenv from 'dotenv';
dotenv.config();

function parseExcelDate(val: any) {
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
      const monthMap: any = {'มค':0, 'กพ':1, 'มีค':2, 'เมย':3, 'พค':4, 'มิย':5, 'กค':6, 'สค':7, 'กย':8, 'ตค':9, 'พย':10, 'ธค':11};
      const month = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
      let year = parseInt(match[3]);
      if (year < 100) year += 2500; 
      if (year > 2500) year -= 543; 
      return new Date(year, month, day);
    }
  }
  return new Date();
}

async function run() {
  console.log('Clearing database...');
  await sql`TRUNCATE TABLE payments CASCADE`;
  await sql`TRUNCATE TABLE expenses CASCADE`;
  await sql`TRUNCATE TABLE loans CASCADE`;
  await sql`TRUNCATE TABLE customers CASCADE`;
  console.log('Database cleared.');
  
  const workbook = xlsx.readFile('data.xlsx');
  let customersMap = new Map();
  
  async function getCustomer(name: string) {
     if (!name) return null;
     name = name.toString().trim();
     if (customersMap.has(name)) return customersMap.get(name);
     const res = await sql`INSERT INTO customers (full_name, id_card, phone, address, created_at, updated_at) VALUES (${name}, '', '', '', NOW(), NOW()) RETURNING id`;
     customersMap.set(name, res[0].id);
     return res[0].id;
  }
  
  async function createLoan(cId: string, principal: number, freq: string, installment: number, startStr: any, durationDays: number = 30, paymentData: any[] = []) {
     const startDate = parseExcelDate(startStr);
     const dueDate = new Date(startDate);
     dueDate.setDate(dueDate.getDate() + (durationDays - 1));
     
     const loansCount = await sql`SELECT count(*) FROM loans`;
     const count = parseInt(loansCount[0].count) + 1;
     const loanNumber = `L${new Date().getFullYear().toString().slice(-2)}${String(count).padStart(4, '0')}`;
     
     const total_payable = installment * durationDays;
     const interest_amount = total_payable - principal;
     const interest_rate = principal > 0 ? (interest_amount / principal) * 100 : 0;
     
     const [loan] = await sql`
       INSERT INTO loans (
         customer_id, loan_number, principal, interest_rate, interest_amount, installments_count,
         payment_type, installment_amount, total_payable, status, start_date, due_date
       ) VALUES (
         ${cId}, ${loanNumber}, ${principal}, ${interest_rate}, ${interest_amount}, ${durationDays},
         ${freq}, ${installment}, ${total_payable}, 'active', ${startDate}, ${dueDate}
       ) RETURNING id
     `;

     // Process payments
     for (let i = 0; i < paymentData.length; i++) {
        const val = paymentData[i];
        if (val === undefined || val === null || val === '') continue;

        let payAmount = 0;
        let note = '';
        if (typeof val === 'number') {
           payAmount = val;
        } else if (typeof val === 'string') {
           const cleanVal = val.toString().trim();
           if (cleanVal.includes('ท+') || cleanVal.includes('ทบ') || cleanVal.includes('ปรับ')) {
              payAmount = installment; 
              note = cleanVal;
           } else {
              const num = parseFloat(cleanVal.replace(/[^0-9.]/g, ''));
              if (!isNaN(num)) payAmount = num;
              note = cleanVal;
           }
        }

        if (payAmount > 0) {
           const payDate = new Date(startDate);
           payDate.setDate(payDate.getDate() + i);
           
           // Skip future payments
           if (payDate > new Date()) continue;

           await sql`
             INSERT INTO payments (
               loan_id, amount, payment_date, installment_number, method, notes, created_at
             ) VALUES (
               ${loan.id}, ${payAmount}, ${payDate}, ${i + 1}, 'cash', ${note}, ${payDate}
             )
           `;
        }
     }
  }

  /*
  // 1. รายวัน 3-5-7 วัน
  if (workbook.Sheets['รายวัน 3-5-7 วัน']) {
     console.log('Processing: รายวัน 3-5-7 วัน');
  }
  */

  // 2. รายวัน14วัน
  if (workbook.Sheets['รายวัน14วัน']) {
     console.log('Processing: รายวัน14วัน');
     const data = xlsx.utils.sheet_to_json(workbook.Sheets['รายวัน14วัน'], { header: 1 }) as any[][];
     for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0] || row[0] === 'ชื่อ') continue;
        const name = row[0];
        const principal = parseFloat(row[1]) || 0;
        const installment = parseFloat(row[2]) || 0;
        const startDate = row[3];
        const paymentData = row.slice(4, 18); // วันที่1 to วันที่14
        if (name && principal) {
            const cId = await getCustomer(name);
            await createLoan(cId, principal, 'daily', installment, startDate, 14, paymentData);
        }
     }
  }

  // 3. รายวัน12-24วัน
  if (workbook.Sheets['รายวัน12-24วัน']) {
     console.log('Processing: รายวัน12-24วัน');
     const data = xlsx.utils.sheet_to_json(workbook.Sheets['รายวัน12-24วัน'], { header: 1 }) as any[][];
     for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0] || row[0] === 'ชื่อ') continue;
        const name = row[0];
        const principal = parseFloat(row[1]) || 0;
        const installment = parseFloat(row[2]) || 0;
        const startDate = row[3];
        const paymentData = row.slice(4, 28); // วันที่1 to วันที่24
        if (name && principal) {
            const cId = await getCustomer(name);
            await createLoan(cId, principal, 'daily', installment, startDate, 24, paymentData);
        }
     }
  }

  /*
  // 4. รายเดือน
  if (workbook.Sheets['รายเดือน']) {
  }

  // 5. ดอกลอย
  if (workbook.Sheets['ดอกลอย']) {
  }
  */

  console.log('Import finished successfully!');
  process.exit(0);
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
