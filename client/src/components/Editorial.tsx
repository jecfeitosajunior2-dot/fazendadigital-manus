import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function KpiCard({
  label,
  value,
  delta,
  trend,
  hint,
}: {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  hint?: string;
}) {
  const positive = trend === "up";
  return (
    <div className="surface-card hoverable p-5 flex flex-col gap-3">
      <p className="kicker">{label}</p>
      <p className="font-mono text-3xl font-semibold tracking-tight text-[var(--bark)]">{value}</p>
      <div className="flex items-center justify-between text-xs">
        <span
          className={`inline-flex items-center gap-1 font-medium ${
            positive ? "text-[var(--moss-deep)]" : "text-[var(--clay)]"
          }`}
        >
          {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {delta}
        </span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function SectionHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
      <div>
        {kicker && <p className="kicker mb-1.5">{kicker}</p>}
        <h2 className="font-display text-xl md:text-2xl leading-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1 max-w-xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function DenseTable<T>({
  columns,
  rows,
  empty,
}: {
  columns: { key: keyof T | string; label: string; render?: (row: T) => ReactNode; align?: "left" | "right" }[];
  rows: T[];
  empty?: string;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[color-mix(in_oklch,var(--linen)_60%,transparent)]">
              {columns.map((c) => (
                <th
                  key={String(c.key)}
                  className={`px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {empty ?? "Sem registros"}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b last:border-b-0 border-border/60 hover:bg-[color-mix(in_oklch,var(--linen)_45%,transparent)] transition-colors"
              >
                {columns.map((c) => (
                  <td
                    key={String(c.key)}
                    className={`px-4 py-3 ${c.align === "right" ? "text-right font-mono" : "text-left"}`}
                  >
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[String(c.key)] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
