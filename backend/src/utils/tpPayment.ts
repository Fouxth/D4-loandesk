export interface TpConfig {
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
  _installmentAmount?: number,
  _config?: TpConfig,
): number {
  return payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

export function calcLoanTotalOwed(
  totalPayable: number,
  tpCount: number,
  _installmentAmount?: number,
  config?: TpConfig,
): number {
  const penalty = Number(config?.tpPenaltyAmount) || 0;
  return Number(totalPayable) + (tpCount * penalty);
}

export function shouldSkipContractLateFee(loan: {
  paymentType?: string;
  installmentsCount?: number | string | null;
  isIndefinite?: boolean;
}): boolean {
  void loan;
  return false;
}

export function tpConfigFromSettings(raw?: Record<string, unknown> | null): TpConfig {
  return {
    tpRollAmount: Number(raw?.tpRollAmount ?? 0),
    tpPayAmount: Number(raw?.tpPayAmount ?? 0),
    tpPenaltyAmount: Number(raw?.tpPenaltyAmount ?? 100),
  };
}
