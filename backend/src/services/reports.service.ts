import sql from '../db';
import { resolveLateFee } from '../utils/lateFee';
import {
  calcLoanPaidTotal,
  calcLoanTotalOwed,
  isRollPenalty,
  shouldSkipContractLateFee,
  tpConfigFromSettings,
} from '../utils/tpPayment';

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

export async function fetchDashboardRawData(tenantId: string, monthStartStr?: string) {
  const monthStart = monthStartStr || getDefaultMonthStart();
  const today = getLogicalDateStr(new Date());

  const [custCountRes, loans, payments, expenses, settingsRes] = await Promise.all([
    sql`SELECT count(*) as count FROM customers WHERE tenant_id = ${tenantId}`,
    sql`SELECT id, status, total_payable, start_date, due_date, promise_date, principal, installment_amount, payment_type, installments_count, notes, interest_rate, is_interest_only, is_indefinite, is_principal_interest_at_end, late_fee_mode, late_fee_amount FROM loans WHERE tenant_id = ${tenantId}`,
    sql`SELECT loan_id, amount, payment_date, category FROM payments WHERE tenant_id = ${tenantId}`,
    sql`SELECT amount, expense_date FROM expenses WHERE expense_date >= ${monthStart} AND tenant_id = ${tenantId}`,
    sql`SELECT value FROM settings WHERE key = 'lending_config' AND tenant_id = ${tenantId}`
  ]);

  const lendingConfig = settingsRes[0]?.value || {};
  const custCount = parseInt(custCountRes[0].count);

  function getLoanDynamicNextDueDate(l: any): string | null {
    const rawStatus = (l.status || 'active').toLowerCase();
    if (['completed', 'closed', 'deleted', 'cancelled', 'refinanced', 'forfeited'].includes(rawStatus)) {
      return null;
    }

    const isIndefinite = l.isIndefinite ?? l.is_indefinite;
    const notes = l.notes ?? '';
    const interestRate = Number(l.interestRate ?? l.interest_rate ?? 0);
    const isZeroDebt = notes.includes('ยอดติด') || notes.includes('ยอดติดค้างชำระ') || (interestRate === 0 && (l.installmentsCount === 1 || !l.paymentType));

    if (isIndefinite || isZeroDebt) {
      return null;
    }

    const isPrincipalInterestAtEnd = l.isPrincipalInterestAtEnd ?? l.is_principal_interest_at_end;
    if (isPrincipalInterestAtEnd) {
      const promiseDateStr = toDateStr(l.promiseDate || l.promise_date);
      const dueDateStr = toDateStr(l.dueDate || l.due_date);
      return promiseDateStr || dueDateStr;
    }

    const loanPayments = payments.filter((p: any) => (p.loanId || p.loan_id) === l.id);
    const maxInst = Math.max(0, ...loanPayments.map((p: any) => Number(p.installmentNumber ?? p.installment_number ?? 0)));
    const paidCount = maxInst > 0 ? maxInst : loanPayments.length;
    const startDateStr = toDateStr(l.startDate || l.start_date);
    if (!startDateStr) {
      return toDateStr(l.dueDate || l.due_date) || null;
    }

    const startParts = startDateStr.split('-').map(Number);
    if (startParts.length !== 3 || startParts.some(isNaN)) {
      return toDateStr(l.dueDate || l.due_date) || null;
    }

    const [y, m, d] = startParts;
    const paymentType = l.paymentType || l.payment_type || 'daily';

    const nextDate = new Date(y, m - 1, d);
    if (paymentType === 'daily') nextDate.setDate(nextDate.getDate() + paidCount);
    else if (paymentType === 'weekly') nextDate.setDate(nextDate.getDate() + paidCount * 7);
    else if (paymentType === 'monthly') nextDate.setMonth(nextDate.getMonth() + paidCount);

    const nextDueDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
    const finalDueDateStr = toDateStr(l.dueDate || l.due_date);
    if (finalDueDateStr && nextDueDateStr > finalDueDateStr) {
      return finalDueDateStr;
    }

    return nextDueDateStr;
  }

  const activeLoans = loans.filter((l: any) => {
    const raw = (l.status || '').toLowerCase();
    return !['completed', 'closed', 'deleted', 'cancelled', 'refinanced', 'forfeited'].includes(raw);
  });

  const dueToday = activeLoans.filter((l: any) => getLoanDynamicNextDueDate(l) === today);
  const overdue = activeLoans.filter((l: any) => {
    const d = getLoanDynamicNextDueDate(l);
    return Boolean(d) && d! < today;
  });

  const tpConfig = tpConfigFromSettings(lendingConfig);

  const outstanding = activeLoans.reduce((sum: number, l: any) => {
    const loanPayments = payments.filter((p: any) => p.loanId === l.id);
    const tpCount = loanPayments.filter(isRollPenalty).length;
    const inst = Number(l.installmentAmount) || 0;
    const hasTp = tpCount > 0 && inst > 0;

    let paid: number;
    if (l.isInterestOnly) {
      paid = loanPayments
        .filter((p: any) => p.category === 'principal')
        .reduce((a: number, p: any) => a + Number(p.amount), 0);
    } else if (hasTp) {
      paid = calcLoanPaidTotal(loanPayments, inst, tpConfig);
    } else {
      paid = loanPayments.reduce((a: number, p: any) => a + Number(p.amount), 0);
    }

    let lateFeeTotal = 0;
    const dueStr = toDateStr(l.dueDate);
    if (
      !shouldSkipContractLateFee(l) &&
      !l.isIndefinite &&
      (l.status === 'active' || l.status === 'overdue') &&
      dueStr &&
      dueStr <= today
    ) {
      const dueDate = new Date(dueStr);
      const todayDate = new Date(today);
      const diffDays = Math.max(0, Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      lateFeeTotal = resolveLateFee(lendingConfig, l, diffDays, dueStr).effectiveFee;
    }

    let baseAmount: number;
    if (l.isInterestOnly) {
      baseAmount = Number(l.principal);
    } else if (hasTp) {
      baseAmount = calcLoanTotalOwed(Number(l.totalPayable), tpCount, inst, tpConfig);
    } else {
      baseAmount = Number(l.totalPayable);
    }
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
    const raw = (l.status || 'active').toLowerCase();
    if (['completed', 'closed', 'deleted', 'cancelled', 'refinanced', 'forfeited'].includes(raw)) {
      statusMap[raw] = (statusMap[raw] || 0) + 1;
      return;
    }

    const dueStr = getLoanDynamicNextDueDate(l);
    let effectiveStatus = 'active';
    if (dueStr && dueStr < today) effectiveStatus = 'overdue';
    else if (dueStr && dueStr === today) effectiveStatus = 'due_today';
    else effectiveStatus = 'active';

    statusMap[effectiveStatus] = (statusMap[effectiveStatus] || 0) + 1;
  });
  const statusBreakdown = Object.entries(statusMap)
    .filter(([name]) => Boolean(name) && name !== 'null' && name !== 'undefined')
    .map(([name, value]) => ({ name, value }));

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

export async function fetchReportRawData(tenantId: string, ms?: string) {
  const monthStart = ms || getDefaultMonthStart();
  const today = getLogicalDateStr(new Date());

  const [allPayments, allExpenses, allLoans, allCustomers, settingsRes] = await Promise.all([
    sql`SELECT p.loan_id, p.amount, p.payment_date, p.category, COALESCE(c.full_name, l.pawn_item, 'จำนำไม่ระบุชื่อ') as customer_name
        FROM payments p
        JOIN loans l ON p.loan_id = l.id
        LEFT JOIN customers c ON l.customer_id = c.id
        WHERE p.tenant_id = ${tenantId}`,
    sql`SELECT amount, expense_date FROM expenses WHERE expense_date >= ${monthStart} AND tenant_id = ${tenantId}`,
    sql`SELECT id, customer_id, total_payable, due_date, status, principal, installment_amount, payment_type, is_interest_only, is_indefinite, late_fee_mode, late_fee_amount FROM loans WHERE tenant_id = ${tenantId}`,
    sql`SELECT id, full_name FROM customers WHERE tenant_id = ${tenantId}`,
    sql`SELECT value FROM settings WHERE key = 'lending_config' AND tenant_id = ${tenantId}`
  ]);

  const lendingConfig = settingsRes[0]?.value || {};
  const tpConfig = tpConfigFromSettings(lendingConfig);

  const [mYear, mMonth] = monthStart.split('-').map(Number);
  const lastDay = new Date(mYear, mMonth, 0).getDate();
  const monthEnd = `${mYear}-${String(mMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Monthly income (payments in this month)
  const monthlyIncome = allPayments
    .filter((p: any) => {
      const d = toDateStr(p.paymentDate || p.payment_date);
      return d >= monthStart && d <= monthEnd;
    })
    .reduce((a: number, p: any) => a + Number(p.amount), 0);

  // Monthly expenses
  const monthlyExp = allExpenses
    .filter((e: any) => {
      const d = toDateStr(e.expenseDate || e.expense_date);
      return d >= monthStart && d <= monthEnd;
    })
    .reduce((a: number, e: any) => a + Number(e.amount), 0);

  // Outstanding balance (active/overdue loans)
  const activeLoans = allLoans.filter((l: any) => l.status === 'active' || l.status === 'overdue');
  const outstanding = activeLoans.reduce((sum: number, l: any) => {
    const loanPayments = allPayments.filter((p: any) => p.loanId === l.id);
    const tpCount = loanPayments.filter(isRollPenalty).length;
    const inst = Number(l.installmentAmount) || 0;
    const hasTp = tpCount > 0 && inst > 0;

    let paid: number;
    if (l.isInterestOnly) {
      paid = loanPayments
        .filter((p: any) => p.category === 'principal')
        .reduce((a: number, p: any) => a + Number(p.amount), 0);
    } else if (hasTp) {
      paid = calcLoanPaidTotal(loanPayments, inst, tpConfig);
    } else {
      paid = loanPayments.reduce((a: number, p: any) => a + Number(p.amount), 0);
    }

    let lateFeeTotal = 0;
    const dueStr = toDateStr(l.dueDate);
    if (
      !shouldSkipContractLateFee(l) &&
      !l.isIndefinite &&
      (l.status === 'active' || l.status === 'overdue') &&
      dueStr &&
      dueStr <= today
    ) {
      const dueDate = new Date(dueStr);
      const todayDate = new Date(today);
      const diffDays = Math.max(0, Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      lateFeeTotal = resolveLateFee(lendingConfig, l, diffDays, dueStr).effectiveFee;
    }

    let baseAmount: number;
    if (l.isInterestOnly) {
      baseAmount = Number(l.principal);
    } else if (hasTp) {
      baseAmount = calcLoanTotalOwed(Number(l.totalPayable), tpCount, inst, tpConfig);
    } else {
      baseAmount = Number(l.totalPayable);
    }
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

  // Customer ranking by total paid in selected month
  const rankMap: Record<string, { name: string; total: number }> = {};
  allPayments
    .filter((p: any) => {
      if (ms === 'all') return true;
      const d = toDateStr(p.paymentDate || p.payment_date);
      return d >= monthStart && d <= monthEnd;
    })
    .forEach((p: any) => {
      const name = p.customerName || 'ไม่ระบุ';
      if (!rankMap[name]) rankMap[name] = { name, total: 0 };
      rankMap[name].total += Number(p.amount);
    });
  const ranking = Object.values(rankMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return { monthlyIncome, monthlyExp, outstanding, daily, ranking };
}
