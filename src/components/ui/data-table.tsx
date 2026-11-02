import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./cn";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** Shown on the stacked mobile card. The first `mobile` column is the card title. */
  mobile?: boolean;
  className?: string;
}

/**
 * Table on desktop (sticky raised header, no zebra, row hover), stacked cards below 768px
 * showing the key columns (DESIGN.md 4 and 7).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  const mobileCols = columns.filter((c) => c.mobile);
  const [titleCol, ...detailCols] = mobileCols;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-border bg-surface md:block">
        <table className="w-full border-collapse text-base">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-raised">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "border-b border-border px-4 py-2.5 text-sm font-medium text-muted",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  "border-b border-border last:border-b-0 hover:bg-surface-raised",
                  rowClassName?.(row),
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-4 py-3 align-top", c.align === "right" && "money text-right", c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className={cn("rounded-card border border-border bg-surface p-4", rowClassName?.(row))}
          >
            {titleCol && <div className="mb-2 font-medium">{titleCol.cell(row)}</div>}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {detailCols.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-muted">{c.header}</dt>
                  <dd className={cn("min-w-0 break-words", c.align === "right" && "money")}>{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Server-side pagination links that keep the current filters. */
export function Pagination({
  page,
  pageCount,
  total,
  href,
}: {
  page: number;
  pageCount: number;
  total: number;
  href: (page: number) => string;
}) {
  if (total === 0) return null;
  const linkClass =
    "inline-flex h-8 items-center gap-1 rounded-control border border-border px-3 text-sm hover:bg-surface-raised";
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-4 text-sm text-muted">
      <p>
        Page {page} of {pageCount} · {total.toLocaleString("en-NG")} entries
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={linkClass} href={href(page - 1)} rel="prev">
            <ChevronLeft aria-hidden className="size-4" /> Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link className={linkClass} href={href(page + 1)} rel="next">
            Next <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
