import { getEffectiveStatus } from "@/components/StatusBadge";
import { formatTHB } from "./format";

export interface CustomerCreditProfile {
  score: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'NEW';
  gradeLabel: string;
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
    return {
      score: 70,
      grade: 'NEW',
      gradeLabel: 'ลูกค้าใหม่',
      tone: 'neutral',
      badgeBg: 'bg-slate-500/10 dark:bg-slate-500/20',
      badgeText: 'text-slate-600 dark:text-slate-300',
      badgeBorder: 'border-slate-400/30',
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
      recommendation: 'แนะนำเริ่มต้นด้วยวงเงินพื้นฐาน ฿3,000 - ฿5,000 พร้อมตรวจสอบเอกสารประกอบ',
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
  let totalInstallmentsScheduled = 0;
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

    const instCount = Number(l.totalInstallments || l.total_installments || (l.paymentType === 'daily' ? 24 : 1));
    totalInstallmentsScheduled += instCount;
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

  // Scoring Base: 100 points
  let score = 75;

  // Positive: Completed loans (+8 pts each, max +24)
  score += Math.min(24, completedLoansCount * 8);

  // Positive: Steady on-time repayments
  if (totalNormalPaymentsCount > 10) score += 5;
  if (totalNormalPaymentsCount > 30) score += 5;

  // Negative: Roll Penalty (ท+ป) deductions (-4 pts each, max -25)
  const rollDeduction = Math.min(25, totalRollPenaltyCount * 4);
  score -= rollDeduction;

  // Negative: Overdue loans (-30 pts each)
  score -= overdueLoansCount * 30;

  // Manual risk tag override
  if (customer.riskLevel === 'high') score -= 15;
  if (customer.riskLevel === 'low') score += 5;

  score = Math.max(10, Math.min(100, Math.round(score)));

  // On-time payment rate
  const totalRecordedCycles = totalNormalPaymentsCount + totalRollPenaltyCount;
  const onTimePaymentRate = totalRecordedCycles > 0
    ? Math.round((totalNormalPaymentsCount / totalRecordedCycles) * 100)
    : (overdueLoansCount > 0 ? 50 : 100);

  // Determine Grade
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'B';
  let gradeLabel = 'เครดิตปานกลาง';
  let tone: 'success' | 'info' | 'warning' | 'destructive' = 'info';
  let badgeBg = 'bg-blue-500/10 dark:bg-blue-500/20';
  let badgeText = 'text-blue-600 dark:text-blue-400';
  let badgeBorder = 'border-blue-500/30';
  let recommendedLimit = maxPreviousPrincipal || 5000;
  let analysis = '';
  let recommendation = '';
  const positiveFactors: string[] = [];
  const riskFactors: string[] = [];

  if (score >= 90 && overdueLoansCount === 0 && (completedLoansCount >= 1 || totalNormalPaymentsCount >= 15)) {
    grade = 'A+';
    gradeLabel = 'เครดิตดีเยี่ยม (VIP)';
    tone = 'success';
    badgeBg = 'bg-emerald-500/15 dark:bg-emerald-500/25';
    badgeText = 'text-emerald-600 dark:text-emerald-400';
    badgeBorder = 'border-emerald-500/40';
    recommendedLimit = Math.round((maxPreviousPrincipal * 1.5) / 1000) * 1000 || 15000;
    analysis = `ประวัติดีเยี่ยม จ่ายตรงเวลา ${onTimePaymentRate}% ปิดยอดสำเร็จแล้ว ${completedLoansCount} สัญญา`;
    recommendation = `เป็นลูกค้าชั้นดี สามารถอนุมัติวงเงินเพิ่มได้สูงสุดถึง ${formatTHB(recommendedLimit)}`;
    positiveFactors.push(`อัตราการชำระตรงเวลาสูงถึง ${onTimePaymentRate}%`);
    if (completedLoansCount > 0) positiveFactors.push(`ปิดยอดสัญญาสำเร็จแล้ว ${completedLoansCount} สัญญา`);
    positiveFactors.push('ไม่มีประวัติค้างชำระ');
  } else if (score >= 78 && overdueLoansCount === 0) {
    grade = 'A';
    gradeLabel = 'เครดิตดีมาก';
    tone = 'success';
    badgeBg = 'bg-teal-500/15 dark:bg-teal-500/25';
    badgeText = 'text-teal-600 dark:text-teal-400';
    badgeBorder = 'border-teal-500/40';
    recommendedLimit = Math.round((maxPreviousPrincipal * 1.25) / 1000) * 1000 || 10000;
    analysis = `ผ่อนชำระสม่ำเสมอ จ่ายตรงเวลา ${onTimePaymentRate}%`;
    recommendation = `ประวัติดี สามารถอนุมัติวงเงินได้ตามปกติ (แนะนำไม่เกิน ${formatTHB(recommendedLimit)})`;
    positiveFactors.push(`ผ่อนชำระตรงเวลา ${onTimePaymentRate}%`);
    if (completedLoansCount > 0) positiveFactors.push(`เคยปิดยอดสำเร็จแล้ว ${completedLoansCount} สัญญา`);
  } else if (score >= 60 && overdueLoansCount === 0) {
    grade = 'B';
    gradeLabel = 'เครดิตปานกลาง';
    tone = 'info';
    badgeBg = 'bg-amber-500/15 dark:bg-amber-500/25';
    badgeText = 'text-amber-600 dark:text-amber-400';
    badgeBorder = 'border-amber-500/40';
    recommendedLimit = maxPreviousPrincipal || 6000;
    analysis = `มีประวัติขอทบดอก (ท+ป) ${totalRollPenaltyCount} ครั้ง แต่ยังตามจ่ายครบ`;
    recommendation = `แนะนำคงวงเงินเท่าเดิม (${formatTHB(recommendedLimit)}) ไม่ควรเพิ่มวงเงินจนกว่าจะปิดยอดเดิม`;
    if (totalRollPenaltyCount > 0) riskFactors.push(`มีประวัติทบดอกเบี้ย/ผลัดชำระ ${totalRollPenaltyCount} ครั้ง`);
  } else if (score >= 40 || overdueLoansCount === 1) {
    grade = 'C';
    gradeLabel = 'เฝ้าระวัง / เสี่ยงปานกลาง';
    tone = 'warning';
    badgeBg = 'bg-orange-500/15 dark:bg-orange-500/25';
    badgeText = 'text-orange-600 dark:text-orange-400';
    badgeBorder = 'border-orange-500/40';
    recommendedLimit = Math.max(2000, Math.round((maxPreviousPrincipal * 0.5) / 1000) * 1000);
    analysis = `มีความล่าช้าในการจ่ายเงิน หรือมีสัญญาค้างชำระ ${overdueLoansCount} สัญญา`;
    recommendation = `มีความเสี่ยง ควรติดตามทวงถามอย่างใกล้ชิด และชะลอการปล่อยกู้ก้อนใหม่`;
    if (overdueLoansCount > 0) riskFactors.push(`ปัจจุบันมีสัญญาค้างชำระ ${overdueLoansCount} สัญญา`);
    if (totalRollPenaltyCount > 0) riskFactors.push(`ประวัติทบดอก ${totalRollPenaltyCount} ครั้ง`);
  } else {
    grade = 'D';
    gradeLabel = 'ความเสี่ยงสูง / แบล็กลิสต์';
    tone = 'destructive';
    badgeBg = 'bg-rose-500/15 dark:bg-rose-500/25';
    badgeText = 'text-rose-600 dark:text-rose-400';
    badgeBorder = 'border-rose-500/40';
    recommendedLimit = 0;
    analysis = `ผิดนัดชำระรุนแรง มีสัญญาค้างชำระ ${overdueLoansCount} สัญญา`;
    recommendation = `❌ ไม่อนุมัติเงินกู้เพิ่มเด็ดขาด และควรรีบดำเนินการติดตามยอดค้างชำระ`;
    riskFactors.push('ผิดนัดชำระหนี้หลายครั้ง');
    if (overdueLoansCount > 0) riskFactors.push(`มีสัญญาค้างชำระ ${overdueLoansCount} สัญญา`);
  }

  return {
    score,
    grade,
    gradeLabel,
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
