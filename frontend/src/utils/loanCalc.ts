export function calcLoan(
  principal: number,
  interestRate: number,
  installmentsCount: number,
  paymentType: "daily" | "weekly" | "monthly",
  startDate: Date | string,
  isInterestOnly: boolean = false,
  isIndefinite: boolean = false,
  isPrincipalInterestAtEnd: boolean = false
) {
  const interest = (principal * interestRate) / 100;
  const total = isInterestOnly ? principal : principal + interest;
  const installment = isPrincipalInterestAtEnd ? total : isInterestOnly ? interest : total / Math.max(installmentsCount, 1);

  if (isIndefinite || isInterestOnly) {
    return { interest, total, installment, due: null, dueStr: null };
  }

  let due: Date;
  if (typeof startDate === "string") {
    const parts = startDate.split("T")[0].split("-").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      due = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
      due = new Date(startDate);
    }
  } else {
    due = new Date(startDate.getTime());
  }

  const count = Math.max(Number(installmentsCount) || 1, 1);
  const offset = count > 1 ? count - 1 : 0;

  if (paymentType === "daily") {
    due.setDate(due.getDate() + offset);
  } else if (paymentType === "weekly") {
    due.setDate(due.getDate() + offset * 7);
  } else if (paymentType === "monthly") {
    const expectedDay = due.getDate();
    due.setMonth(due.getMonth() + offset);
    if (due.getDate() !== expectedDay) {
      due.setDate(0); // Clamp to last day of month
    }
  }

  const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;

  return {
    interest,
    total,
    installment,
    due,
    dueStr,
  };
}
