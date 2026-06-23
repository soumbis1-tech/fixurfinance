import { createFileRoute } from "@tanstack/react-router";
import { PhaseStub } from "@/components/app/PhaseStub";
export const Route = createFileRoute("/_authenticated/bank-statements")({
  head: () => ({ meta: [{ title: "Bank statements" }] }),
  component: () => (
    <PhaseStub title="Bank Statements" phase="Phase 4">
      Upload CSV/TXT/PDF/JPG/PNG bank statements into private storage. A server-side
      parse-bank-statement function will return strict JSON, mask account numbers, and let you
      review debit transactions before import.
    </PhaseStub>
  ),
});
