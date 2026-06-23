/** Currency + date formatters with INR / DD-MMM-YYYY defaults. */
import { format as fnsFormat, parseISO } from "date-fns";

export function formatMoney(amount: number | string | null | undefined, currency = "INR") {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

export function formatDate(d: string | Date | null | undefined, pattern = "dd-MMM-yyyy") {
  if (!d) return "";
  const date = typeof d === "string" ? parseISO(d) : d;
  try {
    return fnsFormat(date, pattern);
  } catch {
    return String(d);
  }
}

export function todayISO() {
  return fnsFormat(new Date(), "yyyy-MM-dd");
}
