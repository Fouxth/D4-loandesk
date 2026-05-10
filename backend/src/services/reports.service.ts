import sql from '../db';

function getDefaultMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getLogicalDateStr(d: Date): string {
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const thaiTime = new Date(utc + (3600000 * 7));
  thaiTime.setHours(thaiTime.getHours() - 5);
  return `${thaiTime.getFullYear()}-${String(thaiTime.getMonth() + 1).padStart(2, '0')}-${String(thaiTime.getDate()).padStart(2, '0')}`;
}

/** Convert Date object or string to YYYY-MM-DD */
function toDateStr(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return getLogicalDateStr(d);
  if (typeof d === 'string' && d.includes('T')) return getLogicalDateStr(new Date(d));
  return String(d).split('T')[0];
}

export async function fetchDashboardRawData(monthStartStr?: string) {
  const monthStart = monthStartStr || getDefaultMonthStart();
  const today = getLogicalDateStr(new Date());

  const [custCountRes, loans, payments, expenses, settingsRes] = await Promise.all([
    sql`SELECT count(*) as count FROM customers`,
    sql`SELECT id, status, total_payable, due_date, principal, is_interest_only, is_indefinite FROM loans`,
    sql`SELECT loan_id, amount, payment_date, category FROM payments`,
    sql`SELECT amount, expense_date FROM expenses WHERE expense_date >= ${monthStart}`,
    sql`SELECT value FROM settings WHERE key = 'lending_config'`
  ]);

  const lendingConfig = settingsRes[0]?.value || {};
  const lateFeePerDay = Number(lendingConfig.lateFeePerDay) || 0;

  const custCount = parseInt(custCountRes[0].count);
  const activeLoans = loans.filter((l: any) => l.status === 'active' || l.status === 'overdue');
  const dueToday = loans.filter((l: any) => toDateStr(l.dueDate) === today && (l.status === 'active' || l.status === 'overdue'));
  const overdue = loans.filter((l: any) => toDateStr(l.dueDate) < today && (l.status === 'active' || l.status === 'overdue'));

  const outstanding = activeLoans.reduce((sum: number, l: any) => {
    const paid = payments
      .filter((p: any) => p.loanId === l.id)
      .reduce((a: number, p: any) => {
        if (l.isInterestOnly) {
          return p.category === 'principal' ? a + Number(p.amount) : a;
        }
        return a + Number(p.amount);
      }, 0);
    
    let lateFeeTotal = 0;
    const dueStr = toDateStr(l.dueDate);
    if (!l.isIndefinite && (l.status === 'active' || l.status === 'overdue') && dueStr && dueStr < today) {
      const dueDate = new Date(dueStr);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        lateFeeTotal = diffDays * lateFeePerDay;
      }
    }

    const baseAmount = l.isInterestOnly ? Number(l.principal) : Number(l.totalPayable);
    return sum + Math.max(baseAmount + lateFeeTotal - paid, 0);
  }, 0);

  const todayPayments = payments.filter((p: any) => toDateStr(p.paymentDate) === today);
  const todayCollections = todayPayments.reduce((a: number, p: any) => a + Number(p.amount), 0);

  const monthExpenses = expenses.reduce((a: number, e: any) => a + Number(e.amount), 0);
  const monthPayments = payments
    .filter((p: any) => toDateStr(p.paymentDate) >= monthStart)
    .reduce((a: number, p: any) => a + Number(p.amount), 0);
  const monthlyProfit = monthPayments - monthExpenses;

  // Monthly collections chart (last 6 months)
  const monthly: { month: string; collected: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const collected = payments
      .filter((p: any) => toDateStr(p.paymentDate).startsWith(m))
      .reduce((a: number, p: any) => a + Number(p.amount), 0);
    monthly.push({ month: m, collected });
  }

  // Payment trend (last 14 days)
  const trend: { day: string; amount: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = getLogicalDateStr(d);
    const amount = payments
      .filter((p: any) => toDateStr(p.paymentDate) === day)
      .reduce((a: number, p: any) => a + Number(p.amount), 0);
    trend.push({ day, amount });
  }

  // Status breakdown
  const statusMap: Record<string, number> = {};
  loans.forEach((l: any) => {
    let effectiveStatus = l.status;
    if (l.status === 'active' || l.status === 'overdue') {
      const dueStr = toDateStr(l.dueDate);
      if (dueStr < today) effectiveStatus = 'overdue';
      else if (dueStr === today) effectiveStatus = 'due_today';
      else effectiveStatus = 'active';
    }
    statusMap[effectiveStatus] = (statusMap[effectiveStatus] || 0) + 1;
  });
  const statusBreakdown = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

  return {
    summary: {
      customers: custCount,
      totalLoans: loans.length,
      activeLoans: activeLoans.length,
      dueToday: dueToday.length,
      overdue: overdue.length,
      outstanding,
      todayCollections,
      monthlyProfit
    },
    monthly,
    trend,
    statusBreakdown
  };
}

export async function fetchReportRawData(ms?: string) {
  const monthStart = ms || getDefaultMonthStart();
  const today = getLogicalDateStr(new Date());

  const [allPayments, allExpenses, allLoans, allCustomers, settingsRes] = await Promise.all([
    sql`SELECT p.loan_id, p.amount, p.payment_date, p.category, c.full_name as customer_name
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
        JOIN customers c ON l.customer_id = c.id`,
    sql`SELECT amount, expense_date FROM expenses WHERE expense_date >= ${monthStart}`,
    sql`SELECT id, customer_id, total_payable, due_date, status, principal, is_interest_only, is_indefinite FROM loans`,
    sql`SELECT id, full_name FROM customers`,
    sql`SELECT value FROM settings WHERE key = 'lending_config'`
  ]);

  const lendingConfig = settingsRes[0]?.value || {};
  const lateFeePerDay = Number(lendingConfig.lateFeePerDay) || 0;

  // Monthly income (payments in this month)
  const monthlyIncome = allPayments
    .filter((p: any) => toDateStr(p.paymentDate) >= monthStart)
    .reduce((a: number, p: any) => a + Number(p.amount), 0);

  // Monthly expenses
  const monthlyExp = allExpenses.reduce((a: number, e: any) => a + Number(e.amount), 0);

  // Outstanding balance (active/overdue loans)
  const activeLoans = allLoans.filter((l: any) => l.status === 'active' || l.status === 'overdue');
  const outstanding = activeLoans.reduce((sum: number, l: any) => {
    const paid = allPayments
      .filter((p: any) => p.loanId === l.id)
      .reduce((a: number, p: any) => {
        if (l.isInterestOnly) {
          return p.category === 'principal' ? a + Number(p.amount) : a;
        }
        return a + Number(p.amount);
      }, 0);

    let lateFeeTotal = 0;
    const dueStr = toDateStr(l.dueDate);
    if (!l.isIndefinite && (l.status === 'active' || l.status === 'overdue') && dueStr && dueStr < today) {
      const dueDate = new Date(dueStr);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        lateFeeTotal = diffDays * lateFeePerDay;
      }
    }

    const baseAmount = l.isInterestOnly ? Number(l.principal) : Number(l.totalPayable);
    return sum + Math.max(baseAmount + lateFeeTotal - paid, 0);
  }, 0);

  // Daily collections (last 7 days)
  const daily: { date: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = getLogicalDateStr(d);
    const total = allPayments
      .filter((p: any) => toDateStr(p.paymentDate) === day)
      .reduce((a: number, p: any) => a + Number(p.amount), 0);
    daily.push({ date: day, total });
  }

  // Customer ranking by total paid
  const rankMap: Record<string, { name: string; total: number }> = {};
  allPayments.forEach((p: any) => {
    const name = p.customerName || 'ไม่ระบุ';
    if (!rankMap[name]) rankMap[name] = { name, total: 0 };
    rankMap[name].total += Number(p.amount);
  });
  const ranking = Object.values(rankMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return { monthlyIncome, monthlyExp, outstanding, daily, ranking };
}
