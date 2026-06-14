/** ท+ป = ทบ + จ่าย + ปรับ */

import { resolveTpComponents, type TpConfig } from '../utils/tpPayment';

export function isTpCell(cell: unknown): boolean {
  const t = String(cell ?? '').trim().replace(/\.$/, '');
  return t === 'ท+ป' || t.includes('ท+ป');
}

export const DEFAULT_TP_CONFIG: TpConfig = {
  tpRollAmount: 0,
  tpPayAmount: 0,
  tpPenaltyAmount: 100,
};

export function buildTpNote(
  installmentNumber: number,
  principal: number,
  installmentAmount: number,
  priorPaidCount: number,
  priorPaidTotal: number,
  tpConfig: TpConfig,
): string {
  const { roll, pay, penalty } = resolveTpComponents(installmentAmount, tpConfig);
  return (
    `ท+ป งวด${installmentNumber}: ทบ ${roll} + จ่าย ${pay} + ปรับ ${penalty}` +
    ` | ต้น ${principal} | ชำระแล้ว ${priorPaidCount} งวด รวม ${priorPaidTotal}`
  );
}

export function tpSettlementForLoan(installmentAmount: number, tpConfig: TpConfig) {
  return resolveTpComponents(installmentAmount, tpConfig);
}
