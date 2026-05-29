import { AppShell } from "@/components/AppShell";
import { SectionHeader, DenseTable, KpiCard } from "@/components/Editorial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Filter, Download, Search } from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";

export interface ColumnDef<T> {
  key: keyof T | string;
  label: string;
  align?: "left" | "right";
  render?: (row: T) => ReactNode;
}

export function ListPage<T>({
  kicker,
  title,
  subtitle,
  metrics,
  columns,
  rows,
  primaryActionLabel = "Novo registro",
  filters,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  metrics?: { label: string; value: string; delta: string; trend: "up" | "down"; hint?: string }[];
  columns: ColumnDef<T>[];
  rows: T[];
  primaryActionLabel?: string;
  filters?: { label: string; value?: string }[];
}) {
  return (
    <AppShell
      kicker={kicker}
      title={title}
      subtitle={subtitle}
      actions={
        <>
          <Button variant="outline" className="bg-card" onClick={() => toast("Filtro avançado (placeholder)")}>
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </Button>
          <Button variant="outline" className="bg-card" onClick={() => toast.success("Exportação iniciada")}>
            <Download className="w-4 h-4 mr-2" /> Exportar
          </Button>
          <Button
            className="bg-[var(--moss-deep)] hover:bg-[var(--moss)] text-[var(--paper)]"
            onClick={() => toast(`${primaryActionLabel} (placeholder)`) }
          >
            <Plus className="w-4 h-4 mr-2" /> {primaryActionLabel}
          </Button>
        </>
      }
    >
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 stagger">
          {metrics.map((m) => (
            <KpiCard key={m.label} {...m} />
          ))}
        </div>
      )}

      <div className="surface-card p-4 flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background flex-1">
          <Search className="w-4 h-4 opacity-50" />
          <Input
            placeholder="Buscar..."
            className="border-0 shadow-none focus-visible:ring-0 px-0 h-7"
          />
        </div>
        {filters?.map((f) => (
          <button
            key={f.label}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:border-[var(--moss)] transition-colors"
            onClick={() => toast(`Filtrar por ${f.label}`)}
          >
            <span className="text-muted-foreground mr-1.5">{f.label}:</span>
            <span className="font-medium">{f.value ?? "Todos"}</span>
          </button>
        ))}
      </div>

      <SectionHeader kicker="Resultados" title={`${rows.length} registros`} />
      <DenseTable<T> columns={columns} rows={rows} />
    </AppShell>
  );
}
