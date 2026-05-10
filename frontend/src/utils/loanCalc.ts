export function calcLoan(
  principal: number,
  interestRate: number,
  installmentsCount: number,
  paymentType: "daily" | "weekly" | "monthly",
  startDate: Date,
  isInterestOnly: boolean = false,
  isIndefinite: boolean = false
) {
  const interest = (principal * interestRate) / 100;
  const total = isInterestOnly ? principal : principal + interest;
  const installment = isInterestOnly ? interest : total / installmentsCount;

  if (isIndefinite) {
    return { interest, total, installment, due: null };
  }

  const due = new Date(startDate);
  if (paymentType === "daily") {
    due.setDate(due.getDate() + installmentsCount);
  } else if (paymentType === "weekly") {
    due.setDate(due.getDate() + installmentsCount * 7);
  } else if (paymentType === "monthly") {
    due.setMonth(due.getMonth() + installmentsCount);
  }

  return {
    interest,
    total,
    installment,
    due,
  };
}
