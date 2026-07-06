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
  const duePeriods = isPrincipalInterestAtEnd
    ? Math.max(installmentsCount - 1, 0)
    : installmentsCount;

  if (paymentType === "daily") {
    due.setDate(due.getDate() + duePeriods);
  } else if (paymentType === "weekly") {
    due.setDate(due.getDate() + duePeriods * 7);
  } else if (paymentType === "monthly") {
    due.setMonth(due.getMonth() + duePeriods);
  }

  return {
    interest,
    total,
    installment,
    due,
  };
}
