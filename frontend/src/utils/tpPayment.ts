/** คำนวณยอด ท+ป = ทบ + จ่าย + ปรับ */

export interface TpConfig {
  /** 0 = ใช้ยอดส่งรายวันของสัญญา */
  tpRollAmount?: number;
  tpPayAmount?: number;
  tpPenaltyAmount?: number;
}

export function resolveTpComponents(installmentAmount: number, config: TpConfig) {
  const inst = Number(installmentAmount) || 0;
  const roll = Number(config.tpRollAmount) > 0 ? Number(config.tpRollAmount) : inst;
  const pay = Number(config.tpPayAmount) > 0 ? Number(config.tpPayAmount) : inst;
  const penalty = Number(config.tpPenaltyAmount) || 0;
  return {
    roll,
    pay,
    penalty,
    settlement: roll + pay + penalty,
    extraOwed: roll + penalty,
  };
}

export function calcTpSettlementAmount(installmentAmount: number, config: TpConfig): number {
  return resolveTpComponents(installmentAmount, config).settlement;
}

export function calcTpExtraOwed(installmentAmount: number, config: TpConfig): number {
  return resolveTpComponents(installmentAmount, config).extraOwed;
}

export function isRollPenalty(p: { category?: string | null }): boolean {
  return p.category === 'roll_penalty';
}

export function sumRegularPayments(
  payments: { amount?: number | string; category?: string | null }[],
): number {
  return payments
    .filter((p) => !isRollPenalty(p))
    .reduce((a, p) => a + Number(p.amount || 0), 0);
}

export function calcLoanPaidTotal(
  payments: { amount?: number | string; category?: string | null }[],
  installmentAmount: number,
  config: TpConfig,
): number {
  const tpCount = payments.filter(isRollPenalty).length;
  return sumRegularPayments(payments) + tpCount * calcTpSettlementAmount(installmentAmount, config);
}

export function calcLoanTotalOwed(
  totalPayable: number,
  tpCount: number,
  installmentAmount: number,
  config: TpConfig,
): number {
  return Number(totalPayable) + tpCount * calcTpExtraOwed(installmentAmount, config);
}

/** ค่าปรับล่าช้าใช้ได้กับทุกสัญญาแล้ว; ท+ป เก็บไว้รองรับข้อมูลเก่าเท่านั้น */
export function shouldSkipContractLateFee(loan: {
  paymentType?: string;
  installmentsCount?: number | string | null;
  isIndefinite?: boolean;
}): boolean {
  void loan;
  return false;
}

export function formatTpNote(
  installmentNumber: number,
  installmentAmount: number,
  config: TpConfig,
  principal: number,
  priorPaidCount: number,
  priorPaidTotal: number,
): string {
  const { roll, pay, penalty } = resolveTpComponents(installmentAmount, config);
  return (
    `ท+ป งวด${installmentNumber}: ทบ ${roll} + จ่าย ${pay} + ปรับ ${penalty}` +
    ` | ต้น ${principal} | ชำระแล้ว ${priorPaidCount} งวด รวม ${priorPaidTotal}`
  );
}
