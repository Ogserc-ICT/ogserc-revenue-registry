"use client";

import { TriangleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { HandoverReport } from "@/lib/handover-service";
import { formatAmount } from "@/lib/money";
import { type HandoverActionResult, importHandoverAction, previewHandoverAction } from "./actions";

/**
 * Upload a handover batch, see what it holds and what would be added, then import
 * (REVENUE-REGISTRY-CONTRACT.md §5). Nothing is written until Import.
 */
export function HandoverImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<HandoverReport | null>(null);
  const [done, setDone] = useState(false);
  const [refusal, setRefusal] = useState<{ error: string; problems: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  const send = (f: File, action: (fd: FormData) => Promise<HandoverActionResult>, after: (r: HandoverReport) => void) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", f);
      const r = await action(fd);
      if (!r.ok) {
        setRefusal({ error: r.error, problems: "problems" in r ? r.problems : [] });
        setReport(null);
        return;
      }
      setRefusal(null);
      if (r.data) after(r.data);
    });

  const reset = () => {
    setFile(null);
    setReport(null);
    setDone(false);
    setRefusal(null);
    if (input.current) input.current.value = "";
  };

  const runImport = () => {
    if (!file) return;
    send(file, importHandoverAction, (r) => {
      setReport(r);
      setDone(true);
      toast(r.status === "already-imported" ? `${r.batchNo} was already imported` : `${r.batchNo} imported: ${r.added} added, ${r.skipped} already held`);
      router.refresh();
    });
  };

  const already = report?.status === "already-imported";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-border px-4 text-base hover:bg-surface-raised focus-within:ring-2 focus-within:ring-emerald-400">
          <Upload aria-hidden className="size-4" />
          {file ? "Choose another file" : "Choose batch file (.xlsx)"}
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setDone(false);
              setFile(f);
              send(f, previewHandoverAction, setReport);
            }}
          />
        </label>
        {file && <span className="text-sm text-muted">{file.name}</span>}
      </div>

      {pending && <p className="text-sm text-muted">{done ? "Importing…" : "Checking the file…"}</p>}

      {refusal && (
        <div role="alert" className="rounded-control border border-rose/40 bg-rose/10 p-4 text-sm">
          <p className="font-medium text-rose-text">{refusal.error}</p>
          {refusal.problems.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {refusal.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-muted">Nothing was imported.</p>
        </div>
      )}

      {report && (
        <div className="flex flex-col gap-4" aria-live="polite">
          <dl className="grid gap-3 rounded-control border border-border bg-surface-raised p-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">Batch</dt>
              <dd className="money font-medium">{report.batchNo}</dd>
            </div>
            <div>
              <dt className="text-muted">Prepared</dt>
              <dd>{[report.preparedAt?.slice(0, 10), report.preparedBy].filter(Boolean).join(" by ") || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Lines</dt>
              <dd>
                {report.paymentLines} {report.paymentLines === 1 ? "payment" : "payments"}, {report.reversalLines}{" "}
                {report.reversalLines === 1 ? "reversal" : "reversals"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Net total</dt>
              <dd className="money font-medium">₦{formatAmount(report.netTotal)}</dd>
            </div>
          </dl>

          <p className="text-base">
            {already ? (
              <>This batch is already imported. Nothing changes.</>
            ) : done ? (
              <>
                Imported: <strong>{report.added}</strong> {report.added === 1 ? "line" : "lines"} added, {report.skipped} already held.
              </>
            ) : (
              <>
                Preview, nothing saved yet: <strong>{report.added}</strong> {report.added === 1 ? "line" : "lines"} will be added
                {report.skipped ? `, ${report.skipped} already held` : ""}.
              </>
            )}
          </p>

          {report.warnings.map((w) => (
            <p key={w} role="status" className="flex items-start gap-2 rounded-control border border-amber/40 bg-amber/10 p-3 text-sm">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-text" />
              {w}
            </p>
          ))}
          {report.ignoredColumns.length > 0 && (
            <p className="text-sm text-muted">Columns this format version doesn&apos;t use, ignored: {report.ignoredColumns.join(", ")}.</p>
          )}

          <div className="max-h-[24rem] overflow-auto rounded-card border border-border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Lines in batch {report.batchNo}</caption>
              <thead className="sticky top-0 bg-surface-raised">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">Line ID</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">Payer</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-muted">Amount (₦)</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">Result</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.map((l) => (
                  <tr key={l.lineId} className="border-t border-border align-top">
                    <td className="money px-3 py-2 whitespace-nowrap">{l.lineId}</td>
                    <td className="px-3 py-2">{l.payer}</td>
                    <td className="money px-3 py-2 text-right whitespace-nowrap">{formatAmount(l.amount)}</td>
                    <td className="px-3 py-2">
                      {l.outcome === "add" ? (
                        <StatusPill tone={l.lineType === "Reversal" ? "rose" : "emerald"}>{l.lineType === "Reversal" ? "Reversal" : done ? "Added" : "Will add"}</StatusPill>
                      ) : (
                        <StatusPill tone="slate">Already held</StatusPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            {done || already ? (
              <Button variant="secondary" onClick={reset}>
                Import another batch
              </Button>
            ) : (
              <>
                <Button onClick={runImport} disabled={pending}>
                  {pending ? "Importing…" : `Import ${report.batchNo}`}
                </Button>
                <Button variant="secondary" onClick={reset} disabled={pending}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
