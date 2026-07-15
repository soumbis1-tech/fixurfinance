// Settlement cycles run twice a month: 1st–15th and 16th–end-of-month.
// Settlement is due on the 16th (for the 1st–15th cycle) and on the 1st of
// the next month (for the 16th–end cycle). The helpers below assume local time.

export function currentCycleStart(today: Date = new Date()): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (d.getDate() <= 15) return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(d.getFullYear(), d.getMonth(), 16);
}

/** Date the current cycle should be settled on (16th or 1st of next month). */
export function currentCycleSettlementDate(today: Date = new Date()): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (d.getDate() <= 15) return new Date(d.getFullYear(), d.getMonth(), 16);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function daysUntil(target: Date, today: Date = new Date()): number {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}
