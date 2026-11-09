"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, FormMessage } from "@/components/ui/field";
import { type PillTone, StatusPill } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { ImportOutcome, ImportReport } from "@/lib/payer-import";
import { importAction, previewImportAction } from "./actions";

const OUTCOME: Record<ImportOutcome, { tone: PillTone; label: string }> = {
  add: { tone: "emerald", label: "Will add" },
  "near-duplicate": { tone: "amber", label: "Possible duplicate" },
  skip: { tone: "rose", label: "Skipped" },
};

/** Upload, dry-run preview, then import (BUILD_SPEC 6). Nothing is written until Import. */
export function ImportPanel() {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [includeNear, setIncludeNear] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const preview = (text: string, near: boolean) =>
    startTransition(async () => {
      const r = await previewImportAction(text, near);
      if (!r.ok) {
        setError(r.error);
        setReport(null);
      } else {
        setError(null);
        setReport(r.data ?? null);
      }
    });

  const runImport = () =>
    startTransition(async () => {
      if (!csv) return;
      const r = await importAction(csv, includeNear);
      if (!r.ok) return setError(r.error);
      toast(r.message ?? "Imported");
      setReport(r.data ?? null);
      setDone(true);
    });

  const reset = () => {
    setCsv(null);
    setFileName("");
    setReport(null);
    setDone(false);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const willAdd = report ? report.rows.filter((r) => r.outcome === "add" || (r.outcome === "near-duplicate" && includeNear)).length : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-border px-4 text-base hover:bg-surface-raised focus-within:ring-2 focus-within:ring-emerald-400">
          <Upload aria-hidden className="size-4" />
          {fileName ? "Choose another file" : "Choose CSV file"}
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setDone(false);
              setFileName(file.name);
              const text = await file.text();
              setCsv(text);
              preview(text, includeNear);
            }}
          />
        </label>
        {fileName && <span className="text-sm text-muted">{fileName}</span>}
        <Link href="/admin/data/template" className="text-sm text-muted underline underline-offset-2 hover:text-text" prefetch={false}>
          Download the template
        </Link>
      </div>

      <Checkbox
        id="include-near"
        label="Also import possible duplicates"
        hint="Off by default. Rows whose name looks like an existing payer (or an earlier row) are left out unless you tick this."
        checked={includeNear}
        disabled={done}
        onChange={(e) => {
          setIncludeNear(e.target.checked);
          if (csv && !done) preview(csv, e.target.checked);
        }}
      />

      {error && <FormMessage tone="error">{error}</FormMessage>}
      {pending && <p className="text-sm text-muted">{report ? "Updating…" : "Checking the file…"}</p>}

      {report && (
        <div className="flex flex-col gap-4">
          <p className="text-base" aria-live="polite">
            {done ? (
              <>
                Imported <strong>{report.added}</strong> {report.added === 1 ? "payer" : "payers"}; {report.skipped} skipped.
              </>
            ) : (
              <>
                Preview, nothing saved yet: <strong>{willAdd}</strong> will be added, {report.rows.length - willAdd} left out.
              </>
            )}
            {report.unknownHeaders.length > 0 && (
              <span className="block text-sm text-muted">Columns ignored: {report.unknownHeaders.join(", ")}.</span>
            )}
          </p>
          <div className="max-h-[28rem] overflow-auto rounded-card border border-border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Import {done ? "result" : "preview"}, row by row</caption>
              <thead className="sticky top-0 bg-surface-raised">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">Line</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">Payer name</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">Result</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">Payer ID</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-muted">Notes</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.line} className="border-t border-border align-top">
                    <td className="money px-3 py-2">{r.line}</td>
                    <td className="px-3 py-2">{r.name || <span className="text-muted">(blank)</span>}</td>
                    <td className="px-3 py-2">
                      <StatusPill tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</StatusPill>
                    </td>
                    <td className="money px-3 py-2">{r.payerId ?? ""}</td>
                    <td className="px-3 py-2 text-muted">{r.messages.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            {done ? (
              <>
                <Button variant="secondary" onClick={reset}>
                  Import another file
                </Button>
                <Link href="/payers" className="inline-flex h-10 items-center px-2 text-base underline underline-offset-2">
                  Open Payers
                </Link>
              </>
            ) : (
              <>
                <Button onClick={runImport} disabled={pending || willAdd === 0}>
                  {pending ? "Importing…" : `Import ${willAdd} ${willAdd === 1 ? "payer" : "payers"}`}
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
