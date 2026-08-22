import { getEffectiveStatus } from "@/components/StatusBadge";
import { formatTHB } from "./format";

export type CustomerCategoryType = 'good' | 'regular' | 'new' | 'watchlist' | 'blocked';

export interface CustomerCreditProfile {
  category: CustomerCategoryType;
  categoryLabel: string;
  categoryIcon: string;
  tone: 'success' | 'info' | 'warning' | 'destructive' | 'neutral';
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  totalLoansCount: number;
  completedLoansCount: number;
  activeLoansCount: number;
  overdueLoansCount: number;
  totalBorrowedAmount: number;
  totalRepaidAmount: number;
  totalOutstandingAmount: number;
  onTimePaymentRate: number; // 0 - 100%
  rollPenaltyCount: number; // Total ท+ป count
  recommendedNextCreditLimit: number; // Recommended max credit limit in THB
  analysis: string;
  recommendation: string;
  riskFactors: string[];
  positiveFactors: string[];
}

export function calcCustomerCreditProfile(
  customer: any,
  customerLoans: any[] = [],
  customerPayments: any[] = []
): CustomerCreditProfile {
  const totalLoans = customerLoans.length;

  // New Customer with 0 loans
  if (totalLoans === 0) {
    if (customer.category === 'blocked') {
      return {
        category: 'blocked',
        categoryLabel: 'เครดิตไม่ผ่าน',
        categoryIcon: '🚫',
        tone: 'destructive',
        badgeBg: 'bg-rose-500/15 dark:bg-rose-500/25',
        badgeText: 'text-rose-600 dark:text-rose-400',
        badgeBorder: 'border-rose-500/40',
        totalLoansCount: 0,
        completedLoansCount: 0,
        activeLoansCount: 0,
        overdueLoansCount: 0,
        totalBorrowedAmount: 0,
        totalRepaidAmount: 0,
        totalOutstandingAmount: 0,
        onTimePaymentRate: 0,
        rollPenaltyCount: 0,
        recommendedNextCreditLimit: 0,
        analysis: 'ถูกระบุสถานะเป็นเครดิตไม่ผ่าน / ระงับการกู้ยืม',
        recommendation: '❌ ไม่อนุมัติเงินกู้',
        riskFactors: ['สถานะเครดิตไม่ผ่าน'],
        positiveFactors: [],
      };
    }

    return {
      category: 'new',
      categoryLabel: 'ลูกค้าใหม่',
      categoryIcon: '⚪',
      tone: 'neutral',
      badgeBg: 'bg-slate-500/15 dark:bg-slate-500/25',
      badgeText: 'text-slate-600 dark:text-slate-300',
      badgeBorder: 'border-slate-400/40',
      totalLoansCount: 0,
      completedLoansCount: 0,
      activeLoansCount: 0,
      overdueLoansCount: 0,
      totalBorrowedAmount: 0,
      totalRepaidAmount: 0,
      totalOutstandingAmount: 0,
      onTimePaymentRate: 100,
      rollPenaltyCount: 0,
      recommendedNextCreditLimit: 5000,
      analysis: 'ยังไม่มีประวัติการกู้ยืมในระบบ',
      recommendation: 'แนะนำเริ่มต้นด้วยวงเงินพื้นฐาน ฿3,000 - ฿5,000 พร้อมตรวจเอกสาร',
      riskFactors: ['ยังไม่มีประวัติการผ่อนชำระในอดีต'],
      positiveFactors: ['ประวัติสะอาด ไม่มีข้อมูลค้างชำระ'],
    };
  }

  // Calculate Aggregates
  let completedLoansCount = 0;
  let activeLoansCount = 0;
  let overdueLoansCount = 0;
  let totalBorrowedAmount = 0;
  let totalRepaidAmount = 0;
  let maxPreviousPrincipal = 0;
  let totalRollPenaltyCount = 0;

  customerLoans.forEach((l) => {
    const status = getEffectiveStatus(l);
    const principal = Number(l.principal || 0);
    const totalPayable = Number(l.totalPayable || l.total_payable || principal);
    totalBorrowedAmount += totalPayable;
    if (principal > maxPreviousPrincipal) maxPreviousPrincipal = principal;

    if (status === 'completed') {
      completedLoansCount++;
    } else if (status === 'overdue') {
      overdueLoansCount++;
      activeLoansCount++;
    } else if (status === 'active' || status === 'due_today') {
      activeLoansCount++;
    }
  });

  // Payments calculations
  let totalNormalPaymentsCount = 0;
  customerPayments.forEach((p) => {
    const amt = Number(p.amount || 0);
    totalRepaidAmount += amt;
    const isRoll = p.isRollOver || p.isPenalty || (p.notes && /ท\+ป|ทบ/i.test(p.notes));
    if (isRoll) {
      totalRollPenaltyCount++;
    } else if (amt > 0) {
      totalNormalPaymentsCount++;
    }
  });

  const totalOutstandingAmount = Math.max(0, totalBorrowedAmount - totalRepaidAmount);

  // On-time payment rate
  const totalRecordedCycles = totalNormalPaymentsCount + totalRollPenaltyCount;
  const onTimePaymentRate = totalRecordedCycles > 0
    ? Math.round((totalNormalPaymentsCount / totalRecordedCycles) * 100)
    : (overdueLoansCount > 0 ? 50 : 100);

  // Determine Customer Category
  let category: CustomerCategoryType = 'regular';
  let categoryLabel = 'ลูกค้าประจำ';
  let categoryIcon = '👥';
  let tone: 'success' | 'info' | 'warning' | 'destructive' | 'neutral' = 'info';
  let badgeBg = 'bg-blue-500/15 dark:bg-blue-500/25';
  let badgeText = 'text-blue-600 dark:text-blue-400';
  let badgeBorder = 'border-blue-500/40';
  let recommendedLimit = maxPreviousPrincipal || 5000;
  let analysis = '';
  let recommendation = '';
  const positiveFactors: string[] = [];
  const riskFactors: string[] = [];

  // Manual Blocked or Overdue
  if (customer.category === 'blocked' || overdueLoansCount > 0 || customer.riskLevel === 'high') {
    category = 'blocked';
    categoryLabel = 'เครดิตไม่ผ่าน';
    categoryIcon = '🚫';
    tone = 'destructive';
    badgeBg = 'bg-rose-500/15 dark:bg-rose-500/25';
    badgeText = 'text-rose-600 dark:text-rose-400';
    badgeBorder = 'border-rose-500/40';
    recommendedLimit = 0;
    analysis = overdueLoansCount > 0
      ? `มีสัญญาค้างชำระ ${overdueLoansCount} สัญญา ผิดนัดชำระหนี้`
      : 'อยู่ในกลุ่มเครดิตไม่ผ่าน / มีความเสี่ยงสูง';
    recommendation = '❌ ไม่อนุมัติเงินกู้เพิ่มเด็ดขาด และควรรีบดำเนินการติดตามยอดค้างชำระ';
    if (overdueLoansCount > 0) riskFactors.push(`มีสัญญาค้างชำระ ${overdueLoansCount} สัญญา`);
    if (customer.riskLevel === 'high') riskFactors.push('ระดับความเสี่ยงถูกตั้งเป็นความเสี่ยงสูง');
  } 
  // Frequent Rolls / Watchlist
  else if (totalRollPenaltyCount >= 3 || (totalRecordedCycles > 5 && onTimePaymentRate < 75)) {
    category = 'watchlist';
    categoryLabel = 'เฝ้าระวัง';
    categoryIcon = '⚠️';
    tone = 'warning';
    badgeBg = 'bg-orange-500/15 dark:bg-orange-500/25';
    badgeText = 'text-orange-600 dark:text-orange-400';
    badgeBorder = 'border-orange-500/40';
    recommendedLimit = Math.max(2000, Math.round((maxPreviousPrincipal * 0.5) / 1000) * 1000);
    analysis = `มีประวัติขอทบดอก (ท+ป) ${totalRollPenaltyCount} ครั้ง หรือจ่ายตรงเวลาต่ำกว่าเกณฑ์ (${onTimePaymentRate}%)`;
    recommendation = 'ควรระวังและติดตามใกล้ชิด ชะลอการเพิ่มวงเงินจนกว่าจะปิดยอดเดิม';
    if (totalRollPenaltyCount > 0) riskFactors.push(`มีประวัติขอทบดอกเบี้ย/ผลัดชำระ ${totalRollPenaltyCount} ครั้ง`);
  }
  // Good Credit (💎 เครดิตดี)
  else if (
    customer.category === 'good' ||
    (completedLoansCount >= 1 && onTimePaymentRate >= 85 && overdueLoansCount === 0) ||
    (totalNormalPaymentsCount >= 10 && onTimePaymentRate >= 90 && overdueLoansCount === 0)
  ) {
    category = 'good';
    categoryLabel = 'เครดิตดี';
    categoryIcon = '💎';
    tone = 'success';
    badgeBg = 'bg-emerald-500/15 dark:bg-emerald-500/25';
    badgeText = 'text-emerald-600 dark:text-emerald-400';
    badgeBorder = 'border-emerald-500/40';
    recommendedLimit = Math.round((maxPreviousPrincipal * 1.3) / 1000) * 1000 || 15000;
    analysis = `ประวัติดีมาก จ่ายตรงเวลา ${onTimePaymentRate}% ${completedLoansCount > 0 ? `ปิดยอดสำเร็จแล้ว ${completedLoansCount} สัญญา` : 'ผ่อนชำระสม่ำเสมอ'}`;
    recommendation = `เครดิตดีเยี่ยม สามารถอนุมัติวงเงินเพิ่มได้สูงสุดถึง ${formatTHB(recommendedLimit)}`;
    positiveFactors.push(`จ่ายตรงเวลา ${onTimePaymentRate}%`);
    if (completedLoansCount > 0) positiveFactors.push(`ปิดยอดสัญญาสำเร็จแล้ว ${completedLoansCount} สัญญา`);
    positiveFactors.push('ไม่มีประวัติค้างชำระ');
  }
  // Regular Customer (👥 ลูกค้าประจำ)
  else if (customer.category === 'regular' || totalLoans >= 2 || totalNormalPaymentsCount >= 5) {
    category = 'regular';
    categoryLabel = 'ลูกค้าประจำ';
    categoryIcon = '👥';
    tone = 'info';
    badgeBg = 'bg-blue-500/15 dark:bg-blue-500/25';
    badgeText = 'text-blue-600 dark:text-blue-400';
    badgeBorder = 'border-blue-500/40';
    recommendedLimit = maxPreviousPrincipal || 10000;
    analysis = `เป็นลูกค้าประจำในระบบ มีประวัติกู้ ${totalLoans} สัญญา จ่ายตรงเวลา ${onTimePaymentRate}%`;
    recommendation = `สามารถอนุมัติวงเงินได้ตามปกติ (แนะนำคงวงเงินไว้ที่ ${formatTHB(recommendedLimit)})`;
    positiveFactors.push(`มีประวัติกู้ยืมต่อเนื่อง ${totalLoans} สัญญา`);
  }
  // New Customer (⚪ ลูกค้าใหม่)
  else {
    category = 'new';
    categoryLabel = 'ลูกค้าใหม่';
    categoryIcon = '⚪';
    tone = 'neutral';
    badgeBg = 'bg-slate-500/15 dark:bg-slate-500/25';
    badgeText = 'text-slate-600 dark:text-slate-300';
    badgeBorder = 'border-slate-400/40';
    recommendedLimit = maxPreviousPrincipal || 5000;
    analysis = 'เพิ่งเริ่มต้นกู้สัญญาแรก ยังไม่มีประวัติปิดยอด';
    recommendation = `แนะนำวงเงินเริ่มต้น ${formatTHB(recommendedLimit)}`;
    positiveFactors.push('ไม่มีประวัติค้างชำระ');
  }

  return {
    category,
    categoryLabel,
    categoryIcon,
    tone,
    badgeBg,
    badgeText,
    badgeBorder,
    totalLoansCount: totalLoans,
    completedLoansCount,
    activeLoansCount,
    overdueLoansCount,
    totalBorrowedAmount,
    totalRepaidAmount,
    totalOutstandingAmount,
    onTimePaymentRate,
    rollPenaltyCount: totalRollPenaltyCount,
    recommendedNextCreditLimit: recommendedLimit,
    analysis,
    recommendation,
    riskFactors,
    positiveFactors,
  };
}
