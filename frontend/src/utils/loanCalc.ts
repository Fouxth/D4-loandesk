export function calcLoan(
  principal: number,
  interestRate: number,
  installmentsCount: number,
  paymentType: "daily" | "weekly" | "monthly",
  startDate: Date
) {
  const interest = (principal * interestRate) / 100;
  const total = principal + interest;
  const installment = total / installmentsCount;

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
