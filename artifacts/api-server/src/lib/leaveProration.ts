/**
 * Prorates a leave type's annual entitlement for an employee who joins mid-year.
 *
 * Policy: annual entitlement / 12 = per-month accrual. An employee gets credit
 * for the months remaining in the calendar year from their joining month —
 * if they join on or before the 15th of a month, that month counts; after
 * the 15th, it doesn't. Employees who joined in a prior year get the full
 * entitlement (they're past their first year). Result is rounded to the
 * nearest 0.5 day.
 */
export function computeProratedEntitlement(joiningDate: string, allocationYear: number, maxDaysPerYear: number): number {
  const joined = new Date(joiningDate + "T00:00:00");
  if (isNaN(joined.getTime())) return maxDaysPerYear;

  const joinedYear = joined.getFullYear();
  if (joinedYear < allocationYear) return maxDaysPerYear;
  if (joinedYear > allocationYear) return 0;

  const joinedMonth = joined.getMonth() + 1; // 1-12
  const joinedDay = joined.getDate();
  const effectiveStartMonth = joinedDay <= 15 ? joinedMonth : joinedMonth + 1;
  const monthsRemaining = Math.max(0, 13 - effectiveStartMonth);

  const perMonth = maxDaysPerYear / 12;
  return Math.round(monthsRemaining * perMonth * 2) / 2;
}
