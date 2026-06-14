export type ParsedPaymentCategory = 'principal' | 'interest' | 'roll_penalty';

export interface ParsedPayment {
  paymentDate: string;
  amount: number;
  installmentNumber: number;
  category?: ParsedPaymentCategory;
  notes?: string;
  rolledAmount?: number;
  penaltyAmount?: number;
}

export interface ParsedLoan {
  customerName: string;
  sourceSheet: string;
  principal: number;
  installmentAmount: number;
  installmentsCount: number;
  paymentType: 'daily' | 'weekly' | 'monthly';
  interestRate: number;
  interestAmount: number;
  totalPayable: number;
  startDate: string;
  dueDate: string | null;
  status: 'active' | 'completed' | 'overdue';
  notes: string;
  isInterestOnly: boolean;
  isIndefinite: boolean;
  isPawn: boolean;
  pawnItem: string | null;
  payments: ParsedPayment[];
}

export interface ParseResult {
  loans: ParsedLoan[];
  skipped: { sheet: string; row: number; reason: string }[];
}

export interface ImportSummary {
  customersCreated: number;
  loansCreated: number;
  paymentsCreated: number;
  loansBySheet: Record<string, number>;
  skipped: { sheet: string; row: number; reason: string }[];
}
