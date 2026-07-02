import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import FarmPastosSheet from "@/components/FarmPastosSheet";
import { FazendaSubdivisoesPanel } from "@/components/FazendaSubdivisoesPanel";
import {
  DeleteActionIcon,
  EditActionIcon,
  FarmRowActionButtons,
} from "@/components/icons/FarmActionIcons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter from "@/components/TablePaginationFooter";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { periodoMesAtual } from "@/lib/date-utils";
import { useDeleteFazenda } from "@/hooks/useDeleteFazenda";
import FazendaDeleteBlockedDialog from "@/components/FazendaDeleteBlockedDialog";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";

function areaUnitLabel(unidade?: string | null) {
  const value = String(unidade || "Hectare").toLowerCase();
  if (value.includes("alqueire")) return "alq.";
  if (value.includes("acre")) return "ac";
  if (value.includes("m²") || value.includes("metro")) return "m²";
  return "ha";
}

function parseAreaValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatAreaWithUnit(value: unknown, unidade?: string | null) {
  const unit = areaUnitLabel(unidade);
  const number = parseAreaValue(value);
  if (number === null) {
    const raw = String(value ?? "").trim();
    return raw ? `${raw} ${unit}` : "-";
  }
  return `${number.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unit}`;
}

function formatFarmLocation(cidade?: string | null, estado?: string | null) {
  const city = String(cidade || "").trim();
  const uf = String(estado || "").trim();
  if (city && uf) return `${city}/${uf}`;
  return city || uf || "-";
}

// ============================================================
// AÇÕES DA LINHA DE FAZENDA
// ============================================================

function FarmRowActions({
  fazenda,
  onPastos,
  onDelete,
}: {
  fazenda: { id: number; nome: string };
  onPastos: () => void;
  onDelete: () => void;
}) {
  const [, setLocation] = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="p-1 rounded hover:bg-gray-100 text-gray-400 outline-none">
          <span className="material-icons text-[16px]">more_vert</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px] z-[100]">
        <DropdownMenuItem
          className="text-[12px] cursor-pointer gap-2"
          onClick={() => setLocation(`/fazendas/cadastro?id=${fazenda.id}`)}
        >
          <EditActionIcon size={16} />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem className="text-[12px] cursor-pointer gap-2.5" onClick={onPastos}>
          <span className="material-icons text-[15px]" style={{ color: "#4ECDC4" }}>grass</span>
          Pastos
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-[12px] cursor-pointer gap-2.5 text-red-600 focus:text-red-600 focus:bg-red-50"
          onClick={onDelete}
        >
          <DeleteActionIcon size={16} />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================
// MÓDULO FAZENDAS
// ============================================================

export function FarmsOverviewPage() {
  const [, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { handleDeleteFazenda, deleteBlocked, setDeleteBlocked } = useDeleteFazenda({
    onSuccess: () => setSelectedId(null),
  });
  const { data: fazendaList = [], isLoading } = trpc.fazendas.list.useQuery();
  const { data: allPastos = [] } = trpc.pastos.list.useQuery();
  const pastosPorFazenda = useMemo(() => {
    const map: Record<number, number> = {};
    allPastos.forEach(p => { map[p.fazendaId] = (map[p.fazendaId] || 0) + 1; });
    return map;
  }, [allPastos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fazendaList;
    return fazendaList.filter((f: any) =>
      [f.nome, f.cidade, f.estado, f.responsavel].some(v => String(v || "").toLowerCase().includes(q))
    );
  }, [fazendaList, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedFazenda = fazendaList.find((f: any) => f.id === selectedId) ?? null;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (selectedId === null && fazendaList.length > 0) {
      setSelectedId(fazendaList[0].id);
    }
  }, [fazendaList, selectedId]);

  return (
    <AppLayout>
      <FazendaDeleteBlockedDialog
        state={deleteBlocked}
        onClose={() => setDeleteBlocked(null)}
      />
      {/* Lista de fazendas — layout iRancho */}
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[13px] font-semibold text-gray-800 leading-none">Lista de Fazendas</h1>
            <button
              type="button"
              onClick={() => setLocation("/fazendas/cadastro")}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-semibold uppercase text-white bg-[#4ECDC4] hover:bg-[#36BDB4] transition-colors"
            >
              <span className="text-[11px] leading-none font-semibold">+</span>
              <span className="leading-none">Nova Fazenda</span>
            </button>
          </div>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">search</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar"
              className="h-8 pl-8 pr-3 text-[11px] border border-gray-200 rounded w-48 bg-white"
            />
          </div>
        </div>

        <TableHorizontalScroll
          footer={
            <TablePaginationFooter
              pageSize={pageSize}
              page={page}
              totalItems={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={size => {
                setPageSize(size);
                setPage(1);
              }}
            />
          }
        >
            <table className="text-[11px]">
              <colgroup>
                <col className="w-[1%]" />
                <col className="w-[1%]" />
                <col className="w-[1%]" />
                <col className="w-[1%]" />
                <col className="w-[1%]" />
                <col className="w-[1%]" />
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="pl-4 pr-2 py-2.5 text-left align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Nome da Fazenda</th>
                  <th className="pl-2 pr-3 py-2.5 text-left align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Localização</th>
                  <th className="pl-2 pr-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Área Total</th>
                  <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Área Líquida</th>
                  <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Subdivisões</th>
                  <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Carregando...</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhuma fazenda cadastrada.</td></tr>
                )}
                {pageItems.map((f: any) => {
                  const isSelected = selectedId === f.id;
                  return (
                  <tr
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    className={cn(
                      "border-t border-gray-50 cursor-pointer transition-colors",
                      isSelected ? "bg-[#E6FAF8] hover:bg-[#E3F8F6]" : "hover:bg-gray-50/60"
                    )}
                  >
                    <td className={cn(
                      "relative pl-4 pr-2 py-2.5 text-left align-middle whitespace-nowrap",
                      isSelected && "before:content-[''] before:absolute before:left-0 before:inset-y-0 before:w-[5px] before:bg-[#4ECDC4]",
                    )}>
                      <span
                        className={cn(
                          isSelected ? "font-bold text-[#0F3D44]" : "font-medium text-[#4ECDC4]",
                        )}
                      >
                        {f.nome}
                      </span>
                    </td>
                    <td className="pl-2 pr-3 py-2.5 text-left align-middle whitespace-nowrap text-gray-600">{formatFarmLocation(f.cidade, f.estado)}</td>
                    <td className="pl-2 pr-3 py-2.5 text-center align-middle whitespace-nowrap tabular-nums text-gray-700">{formatAreaWithUnit(f.area, f.unidadeArea)}</td>
                    <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap tabular-nums text-gray-700">{formatAreaWithUnit(f.areaLiquida, f.unidadeArea)}</td>
                    <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap tabular-nums text-gray-700">{pastosPorFazenda[f.id] ?? 0}</td>
                    <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <FarmRowActionButtons
                          onEdit={() => setLocation(`/fazendas/cadastro?id=${f.id}`)}
                          onDelete={() => handleDeleteFazenda(f)}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
        </TableHorizontalScroll>
      </div>

      {/* Painel de subdivisões — espelho iRancho */}
      <FazendaSubdivisoesPanel fazenda={selectedFazenda} />
    </AppLayout>
  );
}

export function FarmsListPage() {
  const [, setLocation] = useLocation();
  const [pastosFazenda, setPastosFazenda] = useState<any>(null);
  const { handleDeleteFazenda, deleteBlocked, setDeleteBlocked } = useDeleteFazenda();
  const { data: fazendaList = [], isLoading } = trpc.fazendas.list.useQuery();
  const { data: allPastos = [] } = trpc.pastos.list.useQuery();
  const pastosPorFazenda = useMemo(() => {
    const map: Record<number, number> = {};
    allPastos.forEach(p => { map[p.fazendaId] = (map[p.fazendaId] || 0) + 1; });
    return map;
  }, [allPastos]);

  const exportData = useMemo(
    () => fazendaList.map((f: { nome: string; cidade?: string | null; estado?: string | null; area?: string | null }) => [
      f.nome,
      f.cidade || "",
      f.estado || "",
      f.area || "",
    ]),
    [fazendaList]
  );
  return (
    <AppLayout>
      <FazendaDeleteBlockedDialog
        state={deleteBlocked}
        onClose={() => setDeleteBlocked(null)}
      />
      <FarmPastosSheet
        fazenda={pastosFazenda}
        open={!!pastosFazenda}
        onClose={() => setPastosFazenda(null)}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Fazendas</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <ListExportButtons
            title="Lista de Fazendas"
            filename="fazendas"
            headers={["Nome", "Cidade", "Estado", "Área (ha)"]}
            rows={exportData}
            alignRightFrom={3}
          />
          <button onClick={() => setLocation("/fazendas/cadastro")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Nova Fazenda
          </button>
        </div>
      </div>
      {/* Cards mobile */}
      <div className="lg:hidden space-y-2.5">
        {isLoading ? (
          <div className="bg-white rounded-lg border border-gray-100 p-8 text-center text-gray-400 text-[13px]">Carregando...</div>
        ) : fazendaList.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-100 p-8 text-center text-gray-400 text-[13px]">Nenhuma fazenda cadastrada.</div>
        ) : fazendaList.map((f: any) => (
          <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-semibold text-[#2D5A5A]">{f.nome}</span>
                  {(pastosPorFazenda[f.id] ?? 0) > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">{pastosPorFazenda[f.id]} pasto{pastosPorFazenda[f.id] > 1 ? 's' : ''}</span>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 mt-0.5">{[f.cidade, f.estado].filter(Boolean).join(' / ') || '-'}</p>
              </div>
              <FarmRowActions fazenda={f} onPastos={() => setPastosFazenda(f)} onDelete={() => handleDeleteFazenda(f)} />
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 text-[12px]"><span className="text-gray-400">Área: </span><span className="font-semibold text-gray-800">{f.area ? `${f.area} ha` : '-'}</span></div>
          </div>
        ))}
      </div>

      {/* Tabela desktop */}
      <div className="hidden lg:block bg-white rounded shadow-sm border border-gray-100">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Cidade</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Área (ha)</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">Carregando...</td></tr>}
            {!isLoading && fazendaList.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Nenhuma fazenda cadastrada.</td></tr>}
            {fazendaList.map((f: any) => (
              <tr key={f.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[#4ECDC4] font-medium">{f.nome}</span>
                    {(pastosPorFazenda[f.id] ?? 0) > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                        {pastosPorFazenda[f.id]} pasto{pastosPorFazenda[f.id] > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-700">{f.cidade || "-"}</td>
                <td className="px-3 py-2 text-gray-700">{f.estado || "-"}</td>
                <td className="px-3 py-2 text-right text-gray-700">{f.area || "-"}</td>
                <td className="px-3 py-2 text-center">
                  <FarmRowActions
                    fazenda={f}
                    onPastos={() => setPastosFazenda(f)}
                    onDelete={() => handleDeleteFazenda(f)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function SubdivisionsPage() {
  const [fazendaId, setFazendaId] = useState<string>("");
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const selectedFazenda = fazendas.find(f => String(f.id) === fazendaId) ?? null;

  useEffect(() => {
    if (!fazendaId && fazendas.length === 1) {
      setFazendaId(String(fazendas[0].id));
    }
  }, [fazendas, fazendaId]);

  return (
    <AppLayout>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-[13px] font-semibold text-gray-800">Subdivisões</h1>
        <FazendaOverviewSelect
          value={fazendaId}
          onChange={setFazendaId}
          fazendas={fazendas}
        />
      </div>
      <FazendaSubdivisoesPanel fazenda={selectedFazenda} />
    </AppLayout>
  );
}

// ============================================================
// MÓDULO REBANHO
// ============================================================

const REBANHO_OVERVIEW_FAZENDA_KEY = "fd-rebanho-overview-fazenda-id";

function BarChart({ items, color }: { items: { label: string; value: number; pct: number }[]; color: string }) {
  if (!items.length) return <p className="text-[11px] text-gray-400">Sem dados</p>;
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600 truncate" style={{ minWidth: 72, maxWidth: 96 }}>{item.label}</span>
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(item.pct, item.value > 0 ? 4 : 0)}%`, backgroundColor: color, opacity: 0.85 }}
            />
          </div>
          <span className="text-[11px] text-gray-700 font-semibold tabular-nums" style={{ minWidth: 24, textAlign: "right" }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

type AlertLevel = "sanitary" | "cadastral" | "management" | "critical";

function AlertCard({
  icon,
  label,
  value,
  hint,
  level,
  onClick,
}: {
  icon: string;
  label: string;
  value: number;
  hint: string;
  level: AlertLevel;
  onClick?: () => void;
}) {
  const neutral = {
    color: "#6B7280",
    card: "border-gray-100 hover:border-gray-200 hover:bg-gray-50/60",
    iconBg: "#F3F4F6",
    valueClass: "text-gray-700",
  };

  const activeStyles: Record<AlertLevel, typeof neutral> = {
    sanitary: {
      color: "#D97706",
      card: "border-amber-200 hover:border-amber-300 hover:bg-amber-50/50",
      iconBg: "#FEF3C7",
      valueClass: "text-amber-700",
    },
    cadastral: {
      color: "#2563EB",
      card: "border-blue-200 hover:border-blue-300 hover:bg-blue-50/50",
      iconBg: "#DBEAFE",
      valueClass: "text-blue-700",
    },
    management: {
      color: "#EA580C",
      card: "border-orange-200 hover:border-orange-300 hover:bg-orange-50/50",
      iconBg: "#FFEDD5",
      valueClass: "text-orange-700",
    },
    critical: {
      color: "#DC2626",
      card: "border-red-300 hover:border-red-400 hover:bg-red-50/80 ring-1 ring-red-200/90",
      iconBg: "#FECACA",
      valueClass: "text-red-700",
    },
  };

  const s = value > 0 ? activeStyles[level] : neutral;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-1.5 bg-white rounded-lg border p-3 text-left w-full min-h-[82px] transition-all",
        "cursor-pointer hover:shadow-sm active:scale-[0.99]",
        s.card,
      )}
    >
      <div className="flex items-start gap-3 w-full">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: s.iconBg }}
        >
          <span className="material-icons text-[18px]" style={{ color: s.color }}>{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("text-[20px] font-bold leading-none tabular-nums", s.valueClass)}>{value}</div>
          <div className="text-[11px] font-medium text-gray-700 leading-tight mt-1">{label}</div>
        </div>
        <span className="material-icons text-[16px] text-gray-300 group-hover:text-gray-500 transition-colors shrink-0">chevron_right</span>
      </div>
      <p className="text-[10px] text-gray-500 leading-snug pl-12">{hint}</p>
    </button>
  );
}

function KpiCard({
  label,
  value,
  icon,
  color,
  onClick,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-lg border border-gray-100 shadow-sm p-3 min-h-[68px] flex items-center transition",
        onClick && "cursor-pointer hover:shadow-sm hover:border-gray-200 active:scale-[0.99]",
      )}
    >
      <div className="flex items-center gap-2.5 w-full min-w-0">
        <div
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden",
          )}
          style={{
            backgroundColor:
              icon === "__scale__"
                ? "#FFF2E5"
                : icon === "__calf__"
                  ? "transparent"
                  : `${color}14`,
          }}
        >
          {icon === "__cow__" ? (
            <img src="/assets/icon-boi-nelore.webp" alt="" width={26} height={26} style={{ objectFit: "contain" }} />
          ) : icon === "__scale__" ? (
            <img
              src="/assets/icon-peso-medio-figure.png"
              alt=""
              width={20}
              height={20}
              className="block shrink-0"
              style={{ objectFit: "contain" }}
              draggable={false}
            />
          ) : icon === "__calf__" ? (
            <img src="/assets/icon-nascimentos.png" alt="" width={30} height={30} style={{ objectFit: "cover", borderRadius: "50%" }} />
          ) : (
            <span className="material-icons text-[19px]" style={{ color }}>{icon}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[17px] font-bold text-gray-800 leading-tight tabular-nums">{value}</div>
          <div className="text-[10px] text-gray-500 leading-tight flex items-center gap-1">
            {label}
            {onClick && <span className="material-icons text-[10px] text-gray-400">open_in_new</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function GmdRankBadge({ position }: { position: number }) {
  const medals: Record<number, string> = { 1: "#2D5A5A", 2: "#64748B", 3: "#94A3B8" };
  const bg = medals[position] ?? "#E2E8F0";
  const text = position <= 3 ? "text-white" : "text-gray-600";
  return (
    <span
      className={cn("inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold shrink-0", text)}
      style={{ backgroundColor: bg }}
    >
      {position}º
    </span>
  );
}

export function HerdOverviewPage() {
  const [, setLocation] = useLocation();
  const [fazendaId, setFazendaId] = useState<number | undefined>(undefined);
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const { data: fazendaList } = trpc.fazendas.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data, isLoading, isError, refetch } = trpc.rebanho.overview.useQuery(
    { fazendaId: fazendaId! },
    { enabled: !!fazendaId, refetchOnWindowFocus: false },
  );

  const TEAL = "#2D5A5A";
  const ORANGE = "#F97316";
  const BLUE = "#3B82F6";
  const PINK = "#EC4899";
  const AMBER = "#F59E0B";
  const PURPLE = "#8B5CF6";

  const selectedFazenda = fazendaList?.find(f => f.id === fazendaId);

  useEffect(() => {
    if (!fazendaList || fazendaInitDone) return;

    if (fazendaList.length === 1) {
      const id = fazendaList[0].id;
      setFazendaId(id);
      try {
        localStorage.setItem(REBANHO_OVERVIEW_FAZENDA_KEY, String(id));
      } catch {
        // ignora falha de gravação
      }
      setFazendaInitDone(true);
      return;
    }

    if (fazendaList.length > 1) {
      try {
        const stored = localStorage.getItem(REBANHO_OVERVIEW_FAZENDA_KEY);
        if (stored) {
          const id = Number(stored);
          if (fazendaList.some(f => f.id === id)) {
            setFazendaId(id);
          }
        }
      } catch {
        // ignora falha de leitura
      }
    }

    setFazendaInitDone(true);
  }, [fazendaList, fazendaInitDone]);

  const handleFazendaChange = (value: string) => {
    const id = value ? Number(value) : undefined;
    setFazendaId(id);
    try {
      if (id) localStorage.setItem(REBANHO_OVERVIEW_FAZENDA_KEY, String(id));
      else localStorage.removeItem(REBANHO_OVERVIEW_FAZENDA_KEY);
    } catch {
      // ignora falha de gravação
    }
  };

  const navigateAnimais = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params);
    if (fazendaId) qs.set("fazendaId", String(fazendaId));
    setLocation(`/rebanho/lista-animais?${qs.toString()}`);
  };

  const headerBlock = (
    <div className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold text-gray-800">Visão Geral do Rebanho</h1>
          {!selectedFazenda && (
            <p className="text-[11px] text-gray-500 mt-1 max-w-xl">
              Selecione uma fazenda para visualizar os indicadores do rebanho.
            </p>
          )}
        </div>
        {fazendaList && fazendaList.length > 0 && (
          <FazendaOverviewSelect
            value={fazendaId != null ? String(fazendaId) : ""}
            onChange={handleFazendaChange}
            fazendas={fazendaList}
          />
        )}
      </div>
    </div>
  );

  if (fazendaList && fazendaList.length === 0) {
    return (
      <AppLayout>
        {headerBlock}
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-8 text-center max-w-md mx-auto mt-12">
          <span className="material-icons text-[40px] text-gray-300 mb-3 block">agriculture</span>
          <p className="text-[13px] font-semibold text-gray-800 mb-1">Nenhuma fazenda cadastrada</p>
          <p className="text-[11px] text-gray-500">
            Cadastre uma fazenda para acompanhar os indicadores do rebanho.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (fazendaInitDone && !fazendaId && fazendaList && fazendaList.length > 1) {
    return (
      <AppLayout>
        {headerBlock}
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-8 text-center max-w-md mx-auto mt-12">
          <span className="material-icons text-[40px] text-gray-300 mb-3 block">agriculture</span>
          <p className="text-[13px] font-semibold text-gray-800 mb-1">Escolha uma fazenda</p>
          <p className="text-[11px] text-gray-500">
            Use o seletor acima para carregar os indicadores, alertas e ranking desta propriedade.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (!fazendaId) {
    return (
      <AppLayout>
        {headerBlock}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-100 p-3 h-[68px] animate-pulse" />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        {headerBlock}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-100 p-3 h-[68px] animate-pulse" />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (!isLoading && !data) {
    return (
      <AppLayout>
        {headerBlock}
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-5 text-center max-w-lg mx-auto mt-8">
          <span className="material-icons text-[32px] text-amber-600 mb-2">cloud_off</span>
          <p className="text-[13px] font-semibold text-gray-800 mb-1">Não foi possível carregar a visão geral</p>
          <p className="text-[11px] text-gray-600 mb-4">
            {isError
              ? "Verifique se o MySQL está ligado (pnpm db:up) ou tente novamente."
              : "Nenhum dado retornado para esta fazenda."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[11px] font-semibold uppercase tracking-wide px-4 py-2 rounded-full text-gray-900"
            style={{ backgroundColor: "#4ECDC4" }}
          >
            Tentar novamente
          </button>
        </div>
      </AppLayout>
    );
  }

  if (!data) return null;

  const hoje = new Date();
  const { de: primeiroDiaMes, ate: ultimoDiaMes } = periodoMesAtual(hoje);

  const kpis = [
    { label: "Total de Animais", value: data.totalAnimais.toString(), icon: "__cow__", color: TEAL, onClick: undefined },
    { label: "Machos", value: data.totalMachos.toString(), icon: "male", color: BLUE, onClick: undefined },
    { label: "Fêmeas", value: data.totalFemeas.toString(), icon: "female", color: PINK, onClick: undefined },
    { label: "Peso Médio", value: data.pesoMedio !== null ? `${data.pesoMedio} kg` : "—", icon: "__scale__", color: AMBER, onClick: undefined },
    { label: "GMD Médio", value: data.gmdMedio !== null ? `${data.gmdMedio} kg/d` : "—", icon: "trending_up", color: PURPLE, onClick: undefined },
    {
      label: "Nascimentos no Mês",
      value: (data.evolucaoEfetivo.nascimentosNoMes ?? 0).toString(),
      icon: "__calf__",
      color: AMBER,
      onClick: () => navigateAnimais({
        dataNascimentoDe: primeiroDiaMes,
        dataNascimentoAte: ultimoDiaMes,
      }),
    },
  ];

  const ORDER_MACHOS = ["Bezerro", "Novilho", "Boi"];
  const ORDER_FEMEAS = ["Bezerra", "Novilha", "Vaca"];

  return (
    <AppLayout>
      {headerBlock}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {kpis.map((kpi, i) => (
          <KpiCard key={i} {...kpi} />
        ))}
      </div>

      {/* ── Distribuições ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <h2 className="text-[12px] font-semibold mb-3 flex items-center gap-1.5" style={{ color: BLUE }}>
            <span className="material-icons text-[14px]">male</span> Machos
          </h2>
          {data.porCategoriaMachos.length > 0
            ? (
              <BarChart
                items={[...data.porCategoriaMachos].sort((a, b) => {
                  const ia = ORDER_MACHOS.indexOf(a.label);
                  const ib = ORDER_MACHOS.indexOf(b.label);
                  if (ia === -1 && ib === -1) return a.label.localeCompare(b.label, "pt-BR");
                  if (ia === -1) return 1;
                  if (ib === -1) return -1;
                  return ia - ib;
                })}
                color={BLUE}
              />
            )
            : <p className="text-[11px] text-gray-400">Nenhum macho cadastrado</p>}
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <h2 className="text-[12px] font-semibold mb-3 flex items-center gap-1.5" style={{ color: PINK }}>
            <span className="material-icons text-[14px]">female</span> Fêmeas
          </h2>
          {data.porCategoriaFemeas.length > 0
            ? (
              <BarChart
                items={[...data.porCategoriaFemeas].sort((a, b) => {
                  const ia = ORDER_FEMEAS.indexOf(a.label);
                  const ib = ORDER_FEMEAS.indexOf(b.label);
                  if (ia === -1 && ib === -1) return a.label.localeCompare(b.label, "pt-BR");
                  if (ia === -1) return 1;
                  if (ib === -1) return -1;
                  return ia - ib;
                })}
                color={PINK}
              />
            )
            : <p className="text-[11px] text-gray-400">Nenhuma fêmea cadastrada</p>}
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <h2 className="text-[12px] font-semibold text-gray-700 mb-3">Por Raça</h2>
          <BarChart items={data.porRaca} color={ORANGE} />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <h2 className="text-[12px] font-semibold text-gray-700 mb-3">Por Faixa de Peso</h2>
          <BarChart items={data.porFaixaPeso} color={PURPLE} />
        </div>
      </div>

      {/* ── Alertas ── */}
      <div className="mb-5">
        <h2 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Alertas e Pendências</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <AlertCard
            icon="folder_off"
            label="Sem Lote"
            value={data.totalSemLote}
            hint="Ver animais sem lote vinculado"
            level="cadastral"
            onClick={() => navigateAnimais({ apenasSemLote: "true" })}
          />
          <AlertCard
            icon="medication"
            label="Em Carência"
            value={data.totalEmCarencia}
            hint="Ver animais com período de carência ativo"
            level="sanitary"
            onClick={() => navigateAnimais({ apenasEmCarencia: "true" })}
          />
          <AlertCard
            icon="scale"
            label="Sem Pesagem (60d)"
            value={data.totalSemPesagemRecente}
            hint="Ver animais sem pesagem nos últimos 60 dias"
            level="management"
            onClick={() => navigateAnimais({ apenasSemPesagem: "true" })}
          />
          <AlertCard
            icon="warning"
            label="Pastos Superlotados"
            value={data.totalLotesSuperLotados}
            hint="Ver mapa do rebanho com lotação acima da capacidade"
            level="critical"
            onClick={() => {
              const params = new URLSearchParams();
              params.set("fazendaId", String(fazendaId));
              params.set("superlotados", "true");
              setLocation(`/rebanho/mapa-rebanho?${params.toString()}`);
            }}
          />
        </div>
      </div>

      {/* ── Faixa etária ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-5 overflow-x-auto">
        <h2 className="text-[12px] font-semibold text-gray-700 mb-3">Faixa Etária por Categoria</h2>
        {data.porFaixaEtariaCategoria.some(r => Object.values(r.categorias).some(v => v > 0)) ? (
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left py-2 px-2 font-semibold text-gray-600 border-b border-gray-200 w-28">Faixa</th>
                {["Bezerro", "Novilho", "Boi", "Bezerra", "Novilha", "Vaca"].map(cat => (
                  <th
                    key={cat}
                    className="text-center py-2 px-2 font-semibold border-b border-gray-200"
                    style={{ color: ["Bezerro", "Novilho", "Boi"].includes(cat) ? BLUE : PINK }}
                  >
                    {cat}
                  </th>
                ))}
                <th className="text-center py-2 px-2 font-semibold text-gray-600 border-b border-gray-200">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.porFaixaEtariaCategoria.map((row, i) => {
                const rowTotal = Object.values(row.categorias).reduce((s, v) => s + v, 0);
                return (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="py-2 px-2 font-medium text-gray-700">{row.faixa}</td>
                    {["Bezerro", "Novilho", "Boi", "Bezerra", "Novilha", "Vaca"].map(cat => (
                      <td key={cat} className="text-center py-2 px-2 text-gray-600">
                        {(row.categorias[cat] || 0) > 0
                          ? <span className="font-semibold">{row.categorias[cat]}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="text-center py-2 px-2 font-semibold text-gray-700">
                      {rowTotal > 0 ? rowTotal : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-[11px] text-gray-400">Sem data de nascimento cadastrada para exibir faixas etárias</p>
        )}
      </div>

      {/* ── Top 5 GMD ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-[12px] font-semibold text-gray-800">Top 5 Animais por GMD (kg/dia)</h2>
          </div>
          <span className="material-icons text-[18px] text-gray-300">leaderboard</span>
        </div>
        {data.top5Gmd.length > 0 ? (
          <>
            <div
              className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_1rem] gap-x-2 sm:gap-x-3 px-3 pb-2 text-[10px] text-gray-500"
              aria-hidden
            >
              <span />
              <span>Brinco</span>
              <span>Categoria</span>
              <span className="text-right">GMD</span>
              <span />
            </div>
            <div className="space-y-2">
              {data.top5Gmd.map((a, i) => {
                const position = i + 1;
                const hasGmd = a.gmd != null && a.gmd !== "" && !Number.isNaN(Number(a.gmd));
                const animalId = "animalId" in a ? a.animalId : undefined;
                const canOpenAnimal = Boolean(animalId || a.brinco);
                return (
                  <button
                    key={animalId ?? a.brinco ?? i}
                    type="button"
                    disabled={!canOpenAnimal}
                    onClick={() => {
                      if (animalId) {
                        setLocation(`/rebanho/detalhes-animal?id=${animalId}`);
                      } else if (a.brinco) {
                        const qs = new URLSearchParams();
                        qs.set("pesquisa", a.brinco);
                        if (fazendaId) qs.set("fazendaId", String(fazendaId));
                        setLocation(`/rebanho/lista-animais?${qs.toString()}`);
                      }
                    }}
                    className={cn(
                      "grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_1rem] gap-x-2 sm:gap-x-3 items-center rounded-lg border px-3 py-2.5 w-full text-left transition",
                      position === 1 ? "border-teal-100 bg-teal-50/40" : "border-gray-100 bg-gray-50/30",
                      canOpenAnimal && "cursor-pointer hover:shadow-sm hover:border-gray-200 active:scale-[0.99]",
                      !canOpenAnimal && "cursor-default",
                    )}
                  >
                    <GmdRankBadge position={position} />
                    <p className="text-[12px] font-semibold text-gray-800 truncate">{a.brinco || "—"}</p>
                    <p className="text-[12px] text-gray-700 truncate">{a.categoria || "—"}</p>
                    <p
                      className="text-[13px] font-bold tabular-nums text-right"
                      style={{ color: hasGmd ? TEAL : "#9CA3AF" }}
                    >
                      {hasGmd ? `${a.gmd} kg/d` : "—"}
                    </p>
                    {canOpenAnimal ? (
                      <span className="material-icons text-[16px] text-gray-300">chevron_right</span>
                    ) : (
                      <span />
                    )}
                  </button>
                );
              })}
            </div>
            {data.top5Gmd.length < 5 && (
              <p className="text-[10px] text-gray-400 mt-3 text-center">
                Exibindo {data.top5Gmd.length} de até 5 animais com melhor GMD.
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-gray-400 py-4 text-center">Sem dados de GMD suficientes para exibir o ranking</p>
        )}
      </div>
    </AppLayout>
  );
}

export function HerdMapPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Mapa do Rebanho</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">swap_horiz</span>
          Nova Movimentação
        </button>
      </div>
      {(() => {
        const subdivisoes = [
          { name: "Pasto 1", m: 12, f: 20, cap: 40 },
          { name: "Pasto 2", m: 10, f: 18, cap: 35 },
          { name: "Pasto 3", m: 15, f: 26, cap: 50 },
          { name: "Retiro Norte", m: 8, f: 14, cap: 30 },
          { name: "Confinamento", m: 25, f: 15, cap: 50 },
          { name: "Maternidade", m: 0, f: 12, cap: 20 },
          { name: "Sede", m: 5, f: 10, cap: 25 },
        ];
        return (
          <>
          {/* Cards mobile */}
          <div className="lg:hidden space-y-2.5">
            {subdivisoes.map((s, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-semibold text-gray-800">{s.name}</p>
                  <span className="text-[13px] font-bold text-[#2D5A5A]">{s.m + s.f} / {s.cap}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">
                  <div><span className="text-gray-400 block text-[10px]">Machos</span><span className="font-medium text-gray-800">{s.m}</span></div>
                  <div><span className="text-gray-400 block text-[10px]">Fêmeas</span><span className="font-medium text-gray-800">{s.f}</span></div>
                  <div className="text-right"><span className="text-gray-400 block text-[10px]">Capacidade</span><span className="font-medium text-gray-800">{s.cap}</span></div>
                </div>
              </div>
            ))}
          </div>
          {/* Tabela desktop */}
          <div className="hidden lg:block bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Subdivisão</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Machos</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Fêmeas</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Capacidade</th>
                </tr>
              </thead>
              <tbody>
                {subdivisoes.map((s, i) => (
                  <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-1.5 text-gray-700 font-medium">{s.name}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{s.m}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{s.f}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-gray-800">{s.m + s.f}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{s.cap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        );
      })()}
    </AppLayout>
  );
}

export function LotsPage() {
  const lots = [
    { name: "Lote Vacas", animals: 69, activity: "Cria", subdivision: "Pasto 1" },
    { name: "Lote Bezerros (as)", animals: 50, activity: "Cria", subdivision: "Maternidade" },
    { name: "Lote Engorda", animals: 52, activity: "Engorda", subdivision: "Confinamento" },
    { name: "Lote Recria", animals: 46, activity: "Recria", subdivision: "Pasto 3" },
    { name: "Lote novilhas da estação", animals: 26, activity: "Cria", subdivision: "Pasto 2" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Gestão de Lotes</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#0ea5e9" }}>
          <span className="material-icons text-[14px]">add</span>
          Novo Lote
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lote</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Atividade</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Subdivisão</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Animais</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-[#4ECDC4] font-medium cursor-pointer hover:underline">{lot.name}</td>
                <td className="px-3 py-1.5 text-gray-700">{lot.activity}</td>
                <td className="px-3 py-1.5 text-gray-500">{lot.subdivision}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{lot.animals}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
          Exibindo 1-{lots.length} de {lots.length} itens
        </div>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO MANEJOS
// ============================================================

function ManagementTabs({ active }: { active: string }) {
  const tabs = ["Meus Manejos", "Criar Manejo", "Listar Manejos", "Manejos Básicos"];
  const paths = ["/manejos/meus", "/manejos/criar", "/manejos/listar", "/manejos/basicos"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function MyManagementsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Meus Manejos</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Novo Manejo
        </button>
      </div>
      <ManagementTabs active="Meus Manejos" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">assignment</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum manejo atribuído a você</p>
      </div>
    </AppLayout>
  );
}

export function CreateManagementPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Criar Manejo</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Cancelar
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            Salvar
          </button>
        </div>
      </div>
      <ManagementTabs active="Criar Manejo" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Tipo de manejo</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700">
              <option>Sanitário</option>
              <option>Reprodutivo</option>
              <option>Pesagem</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Data</label>
            <input type="date" className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Lote</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700">
              <option>Selecione um lote</option>
              <option>Lote Vacas</option>
              <option>Lote Engorda</option>
              <option>Lote Recria</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Responsável</label>
            <input type="text" placeholder="Digite o nome" className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700" />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-[11px] text-gray-600 font-medium mb-1">Observações</label>
          <textarea rows={3} className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 resize-none" placeholder="Notas adicionais..." />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            <span className="material-icons text-[14px]">add</span>
            Adicionar
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

export function ListManagementsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Listar Manejos</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Novo Manejo
        </button>
      </div>
      <ManagementTabs active="Listar Manejos" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lote</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Animais</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Responsável</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-gray-400">Sem Dados</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function BasicManagementsPage() {
  const basics = [
    { name: "Vacinação Aftosa", type: "Sanitário", frequency: "Semestral" },
    { name: "Vermifugação", type: "Sanitário", frequency: "Trimestral" },
    { name: "Pesagem", type: "Pesagem", frequency: "Mensal" },
    { name: "IATF", type: "Reprodutivo", frequency: "Anual" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Manejos Básicos</h1>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
          Clonar
        </button>
      </div>
      <ManagementTabs active="Manejos Básicos" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Frequência</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {basics.map((b, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{b.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{b.type}</td>
                <td className="px-3 py-1.5 text-gray-500">{b.frequency}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO INSUMOS
// ============================================================

function SuppliesTabs({ active }: { active: string }) {
  const tabs = ["Lista de Produtos", "Movimentação", "Monitorados", "Abaixo do Limite"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <button
          key={i}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function SuppliesEntriesPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Insumos - Entradas</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Nova Movimentação
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Cadastrar Produto
          </button>
        </div>
      </div>
      <SuppliesTabs active="Movimentação" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">inventory_2</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de entrada encontrado</p>
      </div>
    </AppLayout>
  );
}

export function SuppliesExitsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Insumos - Saídas</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Movimentação
        </button>
      </div>
      <SuppliesTabs active="Movimentação" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">inventory_2</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de saída encontrado</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO MÁQUINAS
// ============================================================

export function MachineryFuelingPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Abastecimento</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Novo Abastecimento
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Filtros
          </button>
        </div>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Máquina</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Combustível</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Litros</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Custo</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-gray-400">Sem Dados</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function MachineryMaintenancePage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Manutenção</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Manutenção
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">build</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de manutenção</p>
      </div>
    </AppLayout>
  );
}

export function MachineryListPage() {
  const machines = [
    { name: "Trator John Deere 5075", type: "Trator", year: "2020", plate: "-" },
    { name: "Caminhonete Hilux", type: "Veículo", year: "2022", plate: "ABC-1234" },
    { name: "Pulverizador 600L", type: "Implemento", year: "2019", plate: "-" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Máquinas</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Cadastrar Máquina
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Ano</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Placa</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {machines.map((m, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{m.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{m.type}</td>
                <td className="px-3 py-1.5 text-gray-700">{m.year}</td>
                <td className="px-3 py-1.5 text-gray-500">{m.plate}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO REPRODUÇÃO
// ============================================================

function ReproductionTabs({ active }: { active: string }) {
  const tabs = ["Estoque Biológico", "Exposição", "Colheitas"];
  const paths = ["/reproducao/protocolos", "/reproducao/semen", "/reproducao/embrioes"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function ReproductionProtocolsPage() {
  const stock = [
    { name: "Sêmen Nelore PO", type: "Sêmen", qty: 150, batch: "LOT-2025-001" },
    { name: "Sêmen Angus", type: "Sêmen", qty: 80, batch: "LOT-2025-002" },
    { name: "Embrião Nelore", type: "Embrião", qty: 25, batch: "EMB-2025-001" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Estoque Biológico</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Movimentar Estoque
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Novo Estoque Biológico
          </button>
        </div>
      </div>
      <ReproductionTabs active="Estoque Biológico" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Quantidade</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lote</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-20">Ações</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{s.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{s.type}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.qty}</td>
                <td className="px-3 py-1.5 text-gray-500">{s.batch}</td>
                <td className="px-3 py-1.5 text-center flex items-center justify-center gap-1">
                  <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-0.5 rounded hover:bg-gray-100 text-gray-400" title="Extrato">
                    <span className="material-icons text-[14px]">receipt_long</span>
                  </button>
                  <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-0.5 rounded hover:bg-gray-100 text-gray-400" title="Desativar">
                    <span className="material-icons text-[14px]">block</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function ReproductionSemenPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Exposições</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Registrar Nascimento Sem Exposição
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Nova Exposição
          </button>
        </div>
      </div>
      <ReproductionTabs active="Exposição" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">favorite</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de exposição</p>
      </div>
    </AppLayout>
  );
}

export function ReproductionEmbryosPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Colheitas</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Colheita
        </button>
      </div>
      <ReproductionTabs active="Colheitas" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">eco</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de colheita</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO NUTRIÇÃO
// ============================================================

function NutritionTabs({ active }: { active: string }) {
  const tabs = ["Lançamento Nutrição", "Fórmula", "Lote"];
  const paths = ["/nutricao/dietas", "/nutricao/cochos", "/nutricao/cochos"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function NutritionDietsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Nutrição</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Nova Nutrição
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Nova Mistura
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Nova Fórmula
          </button>
        </div>
      </div>
      <NutritionTabs active="Lançamento Nutrição" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">restaurant</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum lançamento de nutrição</p>
      </div>
    </AppLayout>
  );
}

export function NutritionTroughsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Fórmula</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Adicionar Insumo
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Nova Embalagem
          </button>
        </div>
      </div>
      <NutritionTabs active="Fórmula" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">science</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma fórmula cadastrada</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO COMPRA E VENDA
// ============================================================

function PurchaseSaleTabs({ active }: { active: string }) {
  const tabs = ["Borderô de Compra", "Entrada de Animais", "Vendas", "Relatório de Vendas"];
  const paths = ["/compra-venda/compras", "/compra-venda/compras", "/compra-venda/vendas", "/compra-venda/vendas"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function PurchasesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ data: "", fornecedor: "", quantidade: "", valorTotal: "", observacoes: "" });
  const { data: compras, refetch, isLoading } = trpc.compras.list.useQuery();
  const createMutation = trpc.compras.create.useMutation({
    onSuccess: () => { toast.success("Compra registrada com sucesso!"); setShowForm(false); setForm({ data: "", fornecedor: "", quantidade: "", valorTotal: "", observacoes: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.compras.delete.useMutation({
    onSuccess: () => { toast.success("Compra removida."); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <AppLayout>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Borderô de Compra</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Data</Label><Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
            <div><Label>Fornecedor</Label><Input placeholder="Nome do fornecedor" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} /></div>
            <div><Label>Quantidade de Animais</Label><Input type="number" placeholder="0" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} /></div>
            <div><Label>Valor Total (R$)</Label><Input type="number" placeholder="0.00" value={form.valorTotal} onChange={e => setForm(f => ({ ...f, valorTotal: e.target.value }))} /></div>
            <div><Label>Observações</Label><Textarea placeholder="Observações..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate({ data: form.data, fornecedor: form.fornecedor, quantidadeAnimais: parseInt(form.quantidade) || 0, valorTotal: form.valorTotal || "0", observacoes: form.observacoes })} disabled={createMutation.isPending || !form.fornecedor || !form.data}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Borderô de Compra</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <ListExportButtons
            title="Borderô de Compra"
            filename="compras"
            headers={["Data", "Fornecedor", "Quantidade", "Valor Total (R$)"]}
            rows={(compras ?? []).map((c: any) => [
              c.data,
              c.fornecedor,
              c.quantidade,
              Number(c.valorTotal).toFixed(2),
            ])}
            alignRightFrom={2}
          />
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">Buscar Borderôs</button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>Novo Borderô
          </button>
        </div>
      </div>
      <PurchaseSaleTabs active="Borderô de Compra" />
      {isLoading ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center"><p className="text-[12px] text-gray-400">Carregando...</p></div>
      ) : !compras?.length ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <span className="material-icons text-4xl text-gray-200 mb-2 block">shopping_cart</span>
          <p className="text-[12px] text-gray-400">Sem Dados</p>
          <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de compra</p>
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Fornecedor</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qtd</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Valor Total</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c: any) => (
                <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-gray-700">{c.data}</td>
                  <td className="px-3 py-1.5 text-gray-700 font-medium">{c.fornecedor}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{c.quantidade}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">R$ {Number(c.valorTotal).toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <button onClick={() => { if (confirm("Remover esta compra?")) deleteMutation.mutate({ id: c.id }); }} className="p-0.5 rounded hover:bg-red-50 text-red-400" title="Excluir">
                      <span className="material-icons text-[14px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}

export function SalesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ data: "", comprador: "", quantidade: "", valorTotal: "", observacoes: "" });
  const { data: vendas, refetch, isLoading } = trpc.vendas.list.useQuery();
  const createMutation = trpc.vendas.create.useMutation({
    onSuccess: () => { toast.success("Venda registrada com sucesso!"); setShowForm(false); setForm({ data: "", comprador: "", quantidade: "", valorTotal: "", observacoes: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.vendas.delete.useMutation({
    onSuccess: () => { toast.success("Venda removida."); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <AppLayout>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Nova Venda</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Data</Label><Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
            <div><Label>Comprador</Label><Input placeholder="Nome do comprador" value={form.comprador} onChange={e => setForm(f => ({ ...f, comprador: e.target.value }))} /></div>
            <div><Label>Quantidade de Animais</Label><Input type="number" placeholder="0" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} /></div>
            <div><Label>Valor Total (R$)</Label><Input type="number" placeholder="0.00" value={form.valorTotal} onChange={e => setForm(f => ({ ...f, valorTotal: e.target.value }))} /></div>
            <div><Label>Observações</Label><Textarea placeholder="Observações..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate({ data: form.data, comprador: form.comprador, quantidadeAnimais: parseInt(form.quantidade) || 0, valorTotal: form.valorTotal || "0", observacoes: form.observacoes })} disabled={createMutation.isPending || !form.comprador || !form.data}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Vendas</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <ListExportButtons
            title="Vendas"
            filename="vendas"
            headers={["Data", "Comprador", "Quantidade", "Valor Total (R$)"]}
            rows={(vendas ?? []).map((v: any) => [
              v.data,
              v.comprador,
              v.quantidade,
              Number(v.valorTotal).toFixed(2),
            ])}
            alignRightFrom={2}
          />
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">Buscar Vendas</button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>Registrar Nova Venda
          </button>
        </div>
      </div>
      <PurchaseSaleTabs active="Vendas" />
      {isLoading ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center"><p className="text-[12px] text-gray-400">Carregando...</p></div>
      ) : !vendas?.length ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <span className="material-icons text-4xl text-gray-200 mb-2 block">point_of_sale</span>
          <p className="text-[12px] text-gray-400">Sem Dados</p>
          <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de venda</p>
        </div>
      ) : (
        <>
        {/* Cards mobile */}
        <div className="lg:hidden space-y-2.5">
          {vendas.map((v: any) => (
            <div key={v.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-gray-800 truncate">{v.comprador}</p>
                  <p className="text-[12px] text-gray-400 mt-0.5">{v.data} · {v.quantidade} un.</p>
                </div>
                <button onClick={() => { if (confirm('Remover esta venda?')) deleteMutation.mutate({ id: v.id }); }} className="grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition shrink-0" style={{ minWidth: 40, minHeight: 40 }} aria-label="Excluir"><span className="material-icons text-[20px]">delete</span></button>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 text-[15px] font-bold text-green-600">R$ {Number(v.valorTotal).toFixed(2)}</div>
            </div>
          ))}
        </div>
        {/* Tabela desktop */}
        <div className="hidden lg:block bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Comprador</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qtd</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Valor Total</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v: any) => (
                <tr key={v.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-gray-700">{v.data}</td>
                  <td className="px-3 py-1.5 text-gray-700 font-medium">{v.comprador}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{v.quantidade}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">R$ {Number(v.valorTotal).toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <button onClick={() => { if (confirm("Remover esta venda?")) deleteMutation.mutate({ id: v.id }); }} className="p-0.5 rounded hover:bg-red-50 text-red-400" title="Excluir">
                      <span className="material-icons text-[14px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </AppLayout>
  );
}

// ============================================================
// MÓDULO FINANCEIRO
// ============================================================

function FinancialTabs({ active }: { active: string }) {
  const tabs = ["Contas", "Importar Extrato", "Movimentações", "Rateio de Custo", "Listagem Rateio", "Receita x Despesa"];
  const paths = ["/financeiro/contas", "/financeiro/movimentacao", "/financeiro/movimentacao", "/financeiro/categorias", "/financeiro/categorias", "/financeiro/pessoas"];
  return (
    <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function FinancialTransactionsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Movimentações</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4CAF50" }}>
            Lançar Receita
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#F44336" }}>
            Lançar Despesa
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Lançar Transferência
          </button>
        </div>
      </div>
      <FinancialTabs active="Movimentações" />
      {/* Navegação por mês */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <span className="material-icons text-[18px]">chevron_left</span>
        </button>
        <span className="text-[13px] font-medium text-gray-700">Maio 2026</span>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <span className="material-icons text-[18px]">chevron_right</span>
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">account_balance</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma movimentação neste período</p>
      </div>
    </AppLayout>
  );
}

export function FinancialCategoriesPage() {
  const categories = [
    { name: "Alimentação Animal", type: "Despesa", icon: "restaurant" },
    { name: "Medicamentos", type: "Despesa", icon: "medical_services" },
    { name: "Combustível", type: "Despesa", icon: "local_gas_station" },
    { name: "Mão de Obra", type: "Despesa", icon: "people" },
    { name: "Venda de Animais", type: "Receita", icon: "payments" },
    { name: "Venda de Leite", type: "Receita", icon: "water_drop" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Categorias</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Categoria
        </button>
      </div>
      <FinancialTabs active="Rateio de Custo" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Categoria</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium flex items-center gap-2">
                  <span className="material-icons text-[14px] text-gray-400">{c.icon}</span>
                  {c.name}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${c.type === "Receita" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {c.type}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function FinancialPeoplePage() {
  const people = [
    { name: "João Silva", type: "Funcionário", role: "Vaqueiro" },
    { name: "Agropecuária Central", type: "Fornecedor", role: "Insumos" },
    { name: "Frigorífico São Paulo", type: "Cliente", role: "Comprador" },
    { name: "Maria Santos", type: "Funcionário", role: "Administrativa" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Pessoas</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Pessoa
        </button>
      </div>
      <FinancialTabs active="Receita x Despesa" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Função</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((p, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{p.name}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                    p.type === "Funcionário" ? "bg-blue-100 text-blue-700" :
                    p.type === "Fornecedor" ? "bg-amber-100 text-amber-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {p.type}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-500">{p.role}</td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO RELATÓRIOS
// ============================================================

function ReportsTabs({ active }: { active: string }) {
  const tabs = ["Gerenciais", "Evolução", "Reprodutivos", "Operacionais"];
  const paths = ["/relatorios/gerenciais", "/relatorios/evolucao", "/relatorios/reprodutivos", "/relatorios/operacionais"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function ReportsManagerialPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Relatórios Gerenciais</h1>
      <ReportsTabs active="Gerenciais" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[
          { title: "Visão Geral", icon: "dashboard", desc: "Relatório geral da fazenda" },
          { title: "Mapa de Manejos", icon: "map", desc: "Mapa de atividades de manejo" },
          { title: "Custo Unitário Animal", icon: "attach_money", desc: "Custo por unidade animal" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#4ECDC4" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

export function ReportsEvolutionPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Relatórios de Evolução</h1>
      <ReportsTabs active="Evolução" />
      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Evolução de Peso", icon: "trending_up", desc: "Acompanhe o ganho de peso ao longo do tempo" },
          { title: "Evolução de Escore", icon: "star", desc: "Acompanhamento do escore de condição corporal" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#4ECDC4" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

export function ReportsReproductivePage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Relatórios Reprodutivos</h1>
      <ReportsTabs active="Reprodutivos" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[
          { title: "Índices Reprodutivos", icon: "analytics", desc: "Taxas de concepção e prenhez" },
          { title: "Reproduções", icon: "favorite", desc: "Histórico de reproduções" },
          { title: "Previsão de Partos", icon: "event", desc: "Calendário de partos previstos" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#4ECDC4" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

export function ReportsOperationalPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Relatórios Operacionais</h1>
      <ReportsTabs active="Operacionais" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[
          { title: "Movimentação de Estoque", icon: "inventory", desc: "Entradas e saídas de insumos" },
          { title: "Abastecimento", icon: "local_gas_station", desc: "Histórico de abastecimentos" },
          { title: "Manutenções", icon: "build", desc: "Registro de manutenções realizadas" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#4ECDC4" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO SIMULAÇÕES
// ============================================================

export function SimulationsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Minhas Simulações</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Simulação
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">calculate</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma simulação cadastrada</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO ADMINISTRATIVO
// ============================================================

export function AdminOverviewPage() {
  const [, setLocation] = useLocation();
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">Administrativo - Visão Geral</h1>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <h2 className="text-[13px] font-medium text-gray-800 mb-3">Benfeitorias</h2>
          <div className="text-center py-4">
            <span className="material-icons text-3xl text-gray-200">construction</span>
            <p className="text-[11px] text-gray-400 mt-2">Nenhuma benfeitoria cadastrada</p>
          </div>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="w-full mt-2 flex items-center justify-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Cadastrar Benfeitoria
          </button>
        </div>
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <h2 className="text-[13px] font-medium text-gray-800 mb-3">Acesso Rápido</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Cadastrar Fazenda", icon: "home_work", path: "/fazendas/cadastro" },
              { label: "Cadastrar Rebanho", icon: "pets" },
              { label: "Cadastrar Insumo", icon: "inventory_2" },
              { label: "Cadastrar Máquina", icon: "agriculture" },
            ].map((item, i) => (
              <button
                onClick={() => item.path ? setLocation(item.path) : toast.info("Funcionalidade em desenvolvimento")}
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <span className="material-icons text-[16px] text-gray-400">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO SIMULAÇÕES - CONFINAMENTO / SEMI-CONFINAMENTO
// ============================================================

export function SimulationsFeedlotPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Simulação - Confinamento</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Simulação
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">calculate</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma simulação de confinamento cadastrada</p>
      </div>
    </AppLayout>
  );
}

export function SimulationsSemiFeedlotPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Simulação - Semi-Confinamento</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Simulação
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">calculate</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma simulação de semi-confinamento cadastrada</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO ADMINISTRATIVO - BENFEITORIAS
// ============================================================

export function AdministrativeOverviewPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">Benfeitorias - Visão Geral</h1>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">construction</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma benfeitoria cadastrada</p>
      </div>
    </AppLayout>
  );
}

export function ImprovementsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Lista de Benfeitorias</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Cadastrar Benfeitoria
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">construction</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma benfeitoria cadastrada</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// ACESSO RÁPIDO
// ============================================================

function QuickAccessCardIcon({ icon }: { icon: string }) {
  if (icon === "fd_farm_land") {
    return (
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="h-[30px] w-[30px]"
        fill="none"
        shapeRendering="geometricPrecision"
      >
        <path
          d="M7.2 14.1 16 6.85l8.8 7.25"
          stroke="currentColor"
          strokeWidth="2.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9.4 13.7v12.15h13.2V13.7L16 8.25Z" fill="currentColor" />
        <rect x="13.55" y="12.1" width="2.25" height="2.5" rx=".25" fill="#ECFDF5" />
        <rect x="16.25" y="12.1" width="2.25" height="2.5" rx=".25" fill="#ECFDF5" />
        <path d="M12.6 18.05h6.8v7.8h-6.8Z" fill="#ECFDF5" />
        <path
          d="M12.6 18.05 19.4 25.85M19.4 18.05 12.6 25.85M16 18.05v7.8"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "__calf__" || icon === "pets") {
    return (
      <img
        src="/assets/icon-nascimentos-green.png"
        alt="Vaca com bezerro"
        width="32"
        height="32"
        style={{ objectFit: "contain" }}
      />
    );
  }

  if (icon === "fd_supply_bag") {
    return (
      <img
        src="/assets/icon-insumo-saco-green.png"
        alt="Saco de insumo"
        width="28"
        height="28"
        style={{ objectFit: "contain" }}
      />
    );
  }

  if (icon === "fd_tractor") {
    return (
      <img
        src="/assets/icon-maquina-trator-green.png"
        alt="Trator"
        width="32"
        height="32"
        style={{ objectFit: "contain" }}
      />
    );
  }

  if (icon === "fd_management_checklist") {
    return (
      <img
        src="/assets/icon-manejo-checklist-green.png"
        alt="Checklist de manejo"
        width="30"
        height="30"
        style={{ objectFit: "contain" }}
      />
    );
  }

  if (icon === "fd_finance_cycle") {
    return (
      <img
        src="/assets/icon-financeiro-ciclo-green.png"
        alt="Financeiro"
        width="30"
        height="30"
        style={{ width: "30px", height: "30px", objectFit: "contain", display: "block" }}
      />
    );
  }

  return <span className="material-icons text-[20px]">{icon}</span>;
}

export function QuickAccessPage() {
  const [, setLocation] = useLocation();
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">Acesso Rápido</h1>
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Cadastrar Fazenda", icon: "fd_farm_land", path: "/fazendas/cadastro" },
          { label: "Cadastrar Rebanho", icon: "__calf__", path: "/rebanho/lista-animais" },
          { label: "Cadastrar Insumo", icon: "fd_supply_bag", path: "/insumos/cadastro" },
          { label: "Cadastrar Máquina", icon: "fd_tractor", path: "/maquinas/visao-geral" },
          { label: "Lançar Manejo", icon: "fd_management_checklist", path: "/manejos/criar" },
          { label: "Lançar Financeiro", icon: "fd_finance_cycle", path: "/financeiro/movimentacao" },
        ].map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLocation(item.path)}
            className="flex items-center gap-3 p-4 bg-white rounded shadow-sm border border-gray-100 border-l-[4px] border-l-[#4ECDC4] hover:shadow-md hover:border-l-[#4ECDC4] transition-shadow text-left w-full"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#ECFDF5" }}>
              <div className="text-[#4ECDC4]">
                <QuickAccessCardIcon icon={item.icon} />
              </div>
            </div>
            <span className="text-[13px] font-medium text-gray-700">{item.label}</span>
          </button>
        ))}
      </div>
    </AppLayout>
  );
}
