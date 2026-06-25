// Helpers for the importer: parsing, normalization, dedupe, auto-categorize.

export type ParsedRow = {
  date: string; // ISO yyyy-mm-dd
  description: string;
  amount: number;
  paid_by_name?: string | null;
  category_hint?: string | null;
  comments?: string | null;
};

export type RawRow = Record<string, unknown>;

export function normalizeHeader(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Try to coerce many date formats (Excel serial, ISO, dd/mm/yyyy, mm/dd/yyyy, dd-mmm-yyyy)
export function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const m1 = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m1) {
    let [, dd, mm, yyyy] = m1;
    if (yyyy.length === 2) yyyy = "20" + yyyy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // dd-MMM-yyyy
  const m2 = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
  if (m2) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
    };
    const mm = months[m2[2].toLowerCase().slice(0, 4)] ?? months[m2[2].toLowerCase().slice(0, 3)];
    if (mm) {
      let yyyy = m2[3];
      if (yyyy.length === 2) yyyy = "20" + yyyy;
      return `${yyyy}-${mm}-${m2[1].padStart(2, "0")}`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.abs(v);
  const s = String(v).replace(/[^\d.\-,]/g, "").replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? Math.abs(n) : null;
}

// Stable hash for dedupe: family + iso date + amount(2dp) + lowercased description
export async function dedupeHash(familyId: string, isoDate: string, amount: number, description: string): Promise<string> {
  const text = `${familyId}|${isoDate}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`;
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Rule = { keyword: string; category_id: string };
export function autoCategoryFor(description: string, rules: Rule[]): string | null {
  const d = description.toLowerCase();
  for (const r of rules) {
    if (r.keyword && d.includes(r.keyword.toLowerCase())) return r.category_id;
  }
  return null;
}

// Plain text parser: TSV preferred, then CSV, then space-separated 3+ columns.
export function parseText(text: string): { headers: string[]; rows: RawRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : /\s{2,}/;
  const split = (line: string) =>
    typeof sep === "string" ? line.split(sep).map((c) => c.trim()) : line.split(sep).map((c) => c.trim());
  const headerCells = split(lines[0]);
  const looksLikeHeader = headerCells.every((c) => isNaN(Number(c)));
  const headers = looksLikeHeader ? headerCells : ["date", "description", "amount", "extra1", "extra2"].slice(0, headerCells.length);
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  const rows: RawRow[] = dataLines.map((l) => {
    const cells = split(l);
    const obj: RawRow = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
  return { headers, rows };
}

// Guess column mapping from header names.
export function guessMapping(headers: string[]) {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (!map.date && /^(date|txn_date|posting_date|trans_date|day)$/.test(n)) map.date = h;
    if (!map.description && /(desc|narration|particulars|details|item|merchant|name)/.test(n)) map.description = h;
    if (!map.amount && /(amount|amt|debit|spent|value|total|price)/.test(n)) map.amount = h;
    if (!map.paid_by && /(paid_by|payer|by|spender|member)/.test(n)) map.paid_by = h;
    if (!map.category && /(category|cat|type)/.test(n)) map.category = h;
    if (!map.comments && /(comment|note|remarks|memo)/.test(n)) map.comments = h;
  }
  return map;
}
