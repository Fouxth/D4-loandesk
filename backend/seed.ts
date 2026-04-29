import sql from './src/db';

async function seed() {
  const userId = 'b6abe2fd-f1bd-4f0f-91ab-ead9115bbb64';
  
  console.log('🌱 Seeding test data...');

  // --- Customers ---
  const customers = await sql`
    INSERT INTO customers (full_name, phone, id_card, address, notes, risk_level, created_by) VALUES
    ('สมชาย วงศ์สวัสดิ์', '081-234-5678', '1100700123456', '123 ถ.สุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพฯ 10110', 'ลูกค้าประจำ จ่ายตรงเวลา', 'low', ${userId}),
    ('สุดา แซ่ลิ้ม', '089-876-5432', '1100800234567', '45/2 ซ.ลาดพร้าว 15 แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900', 'แม่ค้าในตลาด', 'low', ${userId}),
    ('วิชัย กิตติพงษ์', '062-111-2233', '1100900345678', '789 ถ.รามคำแหง แขวงหัวหมาก เขตบางกะปิ กรุงเทพฯ 10240', 'ช่างซ่อมรถ', 'medium', ${userId}),
    ('มานี ทองสุข', '095-444-5566', '1101000456789', '12 ม.3 ต.บ้านใหม่ อ.เมือง จ.ปทุมธานี 12000', NULL, 'low', ${userId}),
    ('ประเสริฐ ธรรมรักษ์', '083-222-3344', '1101100567890', '56/1 ถ.แจ้งวัฒนะ แขวงทุ่งสองห้อง เขตหลักสี่ กรุงเทพฯ 10210', 'ค้าขายของมือสอง เคยค้างชำระ 1 ครั้ง', 'medium', ${userId}),
    ('จันทร์ เพ็งพูล', '091-333-7788', '1101200678901', '88 ม.5 ต.คลองหก อ.คลองหลวง จ.ปทุมธานี 12120', 'พ่อค้าปลา ตลาดไท', 'high', ${userId}),
    ('นภา ศิริวรรณ', '086-999-0011', '1101300789012', '34 ซ.อารีย์ แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400', 'พนักงานออฟฟิศ', 'low', ${userId}),
    ('สมศักดิ์ รุ่งเรือง', '064-555-6677', '1101400890123', '22/9 ม.2 ต.บางพูน อ.เมือง จ.ปทุมธานี 12000', 'คนขับแท็กซี่', 'medium', ${userId}),
    ('อรุณ พิทักษ์', '098-777-8899', '1101500901234', '55 ถ.นวมินทร์ แขวงคลองจั่น เขตบางกะปิ กรุงเทพฯ 10240', 'เจ้าของร้านซักผ้า', 'low', ${userId}),
    ('พรพรรณ แก้วมณี', '087-888-9900', '1101601012345', '9/3 ม.7 ต.รังสิต อ.ธัญบุรี จ.ปทุมธานี 12110', 'แม่ค้าข้าวแกง เคยค้างชำระ 3 ครั้ง', 'high', ${userId})
    RETURNING id, full_name
  `;
  console.log(`✅ Created ${customers.length} customers`);

  // --- Loans ---
  const now = new Date();
  const loans = [];

  // Active loans
  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240001', ${customers[0].id}, 10000, 10, 1000, 11000, 30, 367, 'daily', '2026-04-01', '2026-05-01', 'active', ${userId}) RETURNING id`);

  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240002', ${customers[1].id}, 20000, 15, 3000, 23000, 4, 5750, 'weekly', '2026-04-01', '2026-04-29', 'active', ${userId}) RETURNING id`);

  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240003', ${customers[2].id}, 50000, 12, 6000, 56000, 6, 9333, 'monthly', '2026-02-01', '2026-08-01', 'active', ${userId}) RETURNING id`);

  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240004', ${customers[3].id}, 5000, 10, 500, 5500, 30, 183, 'daily', '2026-04-10', '2026-05-10', 'active', ${userId}) RETURNING id`);

  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240005', ${customers[4].id}, 30000, 15, 4500, 34500, 4, 8625, 'weekly', '2026-03-15', '2026-04-12', 'overdue', ${userId}) RETURNING id`);

  // Overdue loans
  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240006', ${customers[5].id}, 15000, 20, 3000, 18000, 30, 600, 'daily', '2026-03-01', '2026-03-31', 'overdue', ${userId}) RETURNING id`);

  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240007', ${customers[7].id}, 8000, 10, 800, 8800, 4, 2200, 'weekly', '2026-03-20', '2026-04-17', 'overdue', ${userId}) RETURNING id`);

  // Completed loans
  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240008', ${customers[6].id}, 10000, 10, 1000, 11000, 3, 3667, 'monthly', '2026-01-01', '2026-04-01', 'completed', ${userId}) RETURNING id`);

  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240009', ${customers[8].id}, 25000, 12, 3000, 28000, 4, 7000, 'weekly', '2026-02-01', '2026-03-01', 'completed', ${userId}) RETURNING id`);

  // Second loan for existing customer
  loans.push(await sql`INSERT INTO loans (loan_number, customer_id, principal, interest_rate, interest_amount, total_payable, installments_count, installment_amount, payment_type, start_date, due_date, status, created_by)
    VALUES ('L240010', ${customers[0].id}, 15000, 12, 1800, 16800, 4, 4200, 'weekly', '2026-04-15', '2026-05-13', 'active', ${userId}) RETURNING id`);

  console.log(`✅ Created ${loans.length} loans`);

  // --- Payments ---
  const paymentData: any[] = [];

  // Payments for loan 1 (active daily) - 20 payments
  for (let i = 1; i <= 20; i++) {
    const d = new Date('2026-04-01');
    d.setDate(d.getDate() + i);
    paymentData.push({ loanId: loans[0][0].id, amount: 367, paymentDate: d.toISOString().split('T')[0], installmentNumber: i, method: 'cash' });
  }

  // Payments for loan 2 (weekly) - 3 payments
  paymentData.push({ loanId: loans[1][0].id, amount: 5750, paymentDate: '2026-04-08', installmentNumber: 1, method: 'bank_transfer' });
  paymentData.push({ loanId: loans[1][0].id, amount: 5750, paymentDate: '2026-04-15', installmentNumber: 2, method: 'bank_transfer' });
  paymentData.push({ loanId: loans[1][0].id, amount: 5750, paymentDate: '2026-04-22', installmentNumber: 3, method: 'mobile' });

  // Payments for loan 3 (monthly) - 2 payments
  paymentData.push({ loanId: loans[2][0].id, amount: 9333, paymentDate: '2026-03-01', installmentNumber: 1, method: 'bank_transfer' });
  paymentData.push({ loanId: loans[2][0].id, amount: 9333, paymentDate: '2026-04-01', installmentNumber: 2, method: 'cash' });

  // Payments for loan 4 (daily) - 15 payments
  for (let i = 1; i <= 15; i++) {
    const d = new Date('2026-04-10');
    d.setDate(d.getDate() + i);
    paymentData.push({ loanId: loans[3][0].id, amount: 183, paymentDate: d.toISOString().split('T')[0], installmentNumber: i, method: 'cash' });
  }

  // Payments for loan 5 (overdue) - only 2 of 4
  paymentData.push({ loanId: loans[4][0].id, amount: 8625, paymentDate: '2026-03-22', installmentNumber: 1, method: 'cash' });
  paymentData.push({ loanId: loans[4][0].id, amount: 8625, paymentDate: '2026-03-29', installmentNumber: 2, method: 'cash' });

  // Payments for loan 6 (overdue) - only 15 of 30
  for (let i = 1; i <= 15; i++) {
    const d = new Date('2026-03-01');
    d.setDate(d.getDate() + i);
    paymentData.push({ loanId: loans[5][0].id, amount: 600, paymentDate: d.toISOString().split('T')[0], installmentNumber: i, method: 'cash' });
  }

  // Payments for loan 8 (completed) - all 3
  paymentData.push({ loanId: loans[7][0].id, amount: 3667, paymentDate: '2026-02-01', installmentNumber: 1, method: 'bank_transfer' });
  paymentData.push({ loanId: loans[7][0].id, amount: 3667, paymentDate: '2026-03-01', installmentNumber: 2, method: 'bank_transfer' });
  paymentData.push({ loanId: loans[7][0].id, amount: 3666, paymentDate: '2026-04-01', installmentNumber: 3, method: 'bank_transfer' });

  // Payments for loan 9 (completed) - all 4
  paymentData.push({ loanId: loans[8][0].id, amount: 7000, paymentDate: '2026-02-08', installmentNumber: 1, method: 'cash' });
  paymentData.push({ loanId: loans[8][0].id, amount: 7000, paymentDate: '2026-02-15', installmentNumber: 2, method: 'cash' });
  paymentData.push({ loanId: loans[8][0].id, amount: 7000, paymentDate: '2026-02-22', installmentNumber: 3, method: 'mobile' });
  paymentData.push({ loanId: loans[8][0].id, amount: 7000, paymentDate: '2026-03-01', installmentNumber: 4, method: 'mobile' });

  // Payments for loan 10 - 1 payment
  paymentData.push({ loanId: loans[9][0].id, amount: 4200, paymentDate: '2026-04-22', installmentNumber: 1, method: 'cash' });

  for (const p of paymentData) {
    await sql`INSERT INTO payments (loan_id, amount, payment_date, installment_number, method, created_by)
      VALUES (${p.loanId}, ${p.amount}, ${p.paymentDate}, ${p.installmentNumber}, ${p.method}, ${userId})`;
  }
  console.log(`✅ Created ${paymentData.length} payments`);

  // --- Expenses ---
  const expenseData = [
    { category: 'fuel', amount: 1500, expenseDate: '2026-04-05', description: 'น้ำมันรถเก็บเงิน สัปดาห์ที่ 1' },
    { category: 'fuel', amount: 1800, expenseDate: '2026-04-12', description: 'น้ำมันรถเก็บเงิน สัปดาห์ที่ 2' },
    { category: 'fuel', amount: 1200, expenseDate: '2026-04-19', description: 'น้ำมันรถเก็บเงิน สัปดาห์ที่ 3' },
    { category: 'fuel', amount: 1600, expenseDate: '2026-04-26', description: 'น้ำมันรถเก็บเงิน สัปดาห์ที่ 4' },
    { category: 'staff', amount: 15000, expenseDate: '2026-04-01', description: 'เงินเดือนพนักงานเก็บเงิน คนที่ 1' },
    { category: 'staff', amount: 12000, expenseDate: '2026-04-01', description: 'เงินเดือนพนักงานเก็บเงิน คนที่ 2' },
    { category: 'calls', amount: 500, expenseDate: '2026-04-10', description: 'ค่าโทรศัพท์ติดตามทวงหนี้' },
    { category: 'documents', amount: 300, expenseDate: '2026-04-03', description: 'ค่าถ่ายเอกสาร สัญญาเงินกู้' },
    { category: 'other', amount: 2000, expenseDate: '2026-04-15', description: 'ค่าซ่อมคอมพิวเตอร์สำนักงาน' },
    { category: 'fuel', amount: 1400, expenseDate: '2026-03-10', description: 'น้ำมัน เดือนมีนาคม' },
    { category: 'staff', amount: 15000, expenseDate: '2026-03-01', description: 'เงินเดือน เดือนมีนาคม' },
    { category: 'staff', amount: 12000, expenseDate: '2026-03-01', description: 'เงินเดือน เดือนมีนาคม คนที่ 2' },
  ];

  for (const e of expenseData) {
    await sql`INSERT INTO expenses (category, amount, expense_date, description, created_by)
      VALUES (${e.category}, ${e.amount}, ${e.expenseDate}, ${e.description}, ${userId})`;
  }
  console.log(`✅ Created ${expenseData.length} expenses`);

  // --- Activity Logs ---
  await sql`INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES
    (${userId}, 'สร้างลูกค้าใหม่', 'customer', ${customers[0].id}, '{"name":"สมชาย วงศ์สวัสดิ์"}'::jsonb),
    (${userId}, 'สร้างสัญญาเงินกู้', 'loan', ${loans[0][0].id}, '{"loanNumber":"L240001","amount":10000}'::jsonb),
    (${userId}, 'รับชำระเงิน', 'payment', ${loans[0][0].id}, '{"amount":367,"method":"cash"}'::jsonb),
    (${userId}, 'สร้างลูกค้าใหม่', 'customer', ${customers[5].id}, '{"name":"จันทร์ เพ็งพูล"}'::jsonb),
    (${userId}, 'อัปเดตสถานะสัญญา', 'loan', ${loans[5][0].id}, '{"status":"overdue"}'::jsonb)
  `;
  console.log('✅ Created 5 activity logs');

  console.log('\n🎉 Seed complete!');
  process.exit(0);
}

seed().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
