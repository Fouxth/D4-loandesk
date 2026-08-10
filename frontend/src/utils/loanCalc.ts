export function calcLoan(
  principal: number,
  interestRate: number,
  installmentsCount: number,
  paymentType: "daily" | "weekly" | "monthly",
  startDate: Date,
  isInterestOnly: boolean = false,
  isIndefinite: boolean = false,
  isPrincipalInterestAtEnd: boolean = false
) {
  const interest = (principal * interestRate) / 100;
  const total = isInterestOnly ? principal : principal + interest;
  const installment = isPrincipalInterestAtEnd ? total : isInterestOnly ? interest : total / installmentsCount;

  if (isIndefinite) {
    return { interest, total, installment, due: null };
  }

  const due = new Date(startDate);
  const count = Math.max(Number(installmentsCount) || 1, 1);
  const offset = count > 1 ? count - 1 : 0;

  if (paymentType === "daily") {
    due.setDate(due.getDate() + offset);
  } else if (paymentType === "weekly") {
    due.setDate(due.getDate() + offset * 7);
  } else if (paymentType === "monthly") {
    due.setMonth(due.getMonth() + offset);
  }

  return {
    interest,
    total,
    installment,
    due,
  };
}
