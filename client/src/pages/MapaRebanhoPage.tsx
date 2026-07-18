/**
 * Mapa do Rebanho — Redesenhado
 * Estrutura: Fazenda → Subdivisão → Lotes
 * Foco: Total de Animais, Área (ha), Taxa de Lotação, Histórico de Movimentação
 * Rota: /rebanho/mapa-rebanho
 */
import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";
import { createPortal } from "react-dom";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useDebounce } from "@/hooks/useDebounce";
import { usePersistedState } from "@/hooks/usePersistedState";
import { toast } from "sonner";
import ListExportButtons from "@/components/ListExportButtons";
import { exportMapaRebanhoPdf, exportMapaRebanhoXlsx, countMapaRebanhoRegistros, type MapaSubdivisaoExport, type MapaFazendaExport, type MapaLoteExport } from "@/lib/exportList";
import { calcDiasNoPastoISO, normalizarDataISO } from "@shared/entradaPastoDisplay";
import { FormDatePicker, FormLabel, FormSelect, FD_PRIMARY } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { DeleteActionIcon, TableIconButton } from "@/components/icons/FarmActionIcons";

const FILTERS_KEY = "fd:mapa-rebanho-v2-filtros";

type FiltersState = { fazendaId: string; pastoId: string; search: string };
const INITIAL_FILTERS: FiltersState = { fazendaId: "", pastoId: "", search: "" };

function hojeStr() { return new Date().toISOString().slice(0, 10); }
// ISO (AAAA-MM-DD) -> BR (DD/MM/AAAA)
function isoToBr(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}
// Aplica máscara DD/MM/AAAA enquanto digita
function maskBrDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}
// BR (DD/MM/AAAA) completo -> ISO (AAAA-MM-DD), ou null se incompleto/inválido
function brToIso(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (dt.getFullYear() !== Number(yyyy) || dt.getMonth() !== Number(mm) - 1 || dt.getDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
}
function formatArea(area: string | null) {
  if (!area) return "—";
  const n = Number(area);
  return Number.isNaN(n) ? area : (Number.isInteger(n) ? String(n) : n.toFixed(2));
}
function formatTaxa(taxa: number | null) {
  if (taxa === null || taxa === undefined) return "—";
  return taxa.toFixed(2);
}
function formatDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function calcDiasNoPasto(dataEntradaPasto: string | null): number | null {
  if (!dataEntradaPasto) return null;
  const entrada = new Date(dataEntradaPasto);
  if (isNaN(entrada.getTime())) return null;
  const hoje = new Date();
  const diffMs = hoje.getTime() - entrada.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
function formatDiasNoPasto(dias: number): string {
  return `${dias} dia${dias !== 1 ? "s" : ""} no pasto`;
}

/** Entrada no pasto — linha de subdivisão */
function EntradaPastoSubdivisao({ sub }: { sub: SubdivisaoInfo }) {
  if (sub.totalAnimais === 0) {
    if (sub.diasVazio != null) {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[12px] text-gray-600">Sem animais</span>
          <span className="text-[10px] text-amber-600 font-medium">{sub.diasVazio}d vazio</span>
        </div>
      );
    }
    return <span className="text-[12px] text-gray-600">Sem animais</span>;
  }
  return <span className="text-[12px] text-gray-400">—</span>;
}

/** Entrada no pasto — linha de lote */
function EntradaPastoLote({ dataEntradaPasto }: { dataEntradaPasto: string | null }) {
  if (!dataEntradaPasto) {
    return <span className="text-[12px] text-gray-500 italic">Sem histórico</span>;
  }
  const dias = calcDiasNoPasto(dataEntradaPasto);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[12px] text-gray-700 tabular-nums">{formatDate(dataEntradaPasto)}</span>
      {dias !== null && (
        <span className="text-[10px] text-gray-500">{formatDiasNoPasto(dias)}</span>
      )}
    </div>
  );
}

const MAPA_TABLE_HEADERS = (
  <>
    <th
      className="px-4 py-3 text-left text-[11px] font-semibold text-white uppercase tracking-wide"
      title="Subdivisão e lotes vinculados"
    >
      Subdivisão e Lotes
    </th>
    <th
      className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-24"
      title="Total de animais"
    >
      Animais
    </th>
    <th
      className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-24"
      title="Área (ha)"
    >
      Área
    </th>
    <th
      className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-28"
      title="Taxa de lotação (UA/ha)"
    >
      Lotação
    </th>
    <th
      className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-28"
      title="Entrada no pasto"
    >
      Entrada
    </th>
    <th className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-44">
      Ações
    </th>
  </>
);

const MAPA_TABLE_HEADERS_LIGHT = (
  <>
    <th
      className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
      title="Subdivisão e lotes vinculados"
    >
      Subdivisão e Lotes
    </th>
    <th
      className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-24"
      title="Total de animais"
    >
      Animais
    </th>
    <th
      className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-24"
      title="Área (ha)"
    >
      Área
    </th>
    <th
      className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-28"
      title="Taxa de lotação (UA/ha)"
    >
      Lotação
    </th>
    <th
      className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-28"
      title="Entrada no pasto"
    >
      Entrada
    </th>
    <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-44">
      Ações
    </th>
  </>
);

function statusBadge(status: string | null) {
  if (!status) return null;
  const map: Record<string, { label: string; bg: string; border: string; text: string }> = {
    ativo:    { label: "Ativo",    bg: "#f0fdf4", border: "#16a34a", text: "#15803d" },
    descanso: { label: "Descanso", bg: "#fefce8", border: "#ca8a04", text: "#a16207" },
    vazio:    { label: "Vazio",    bg: "#f9fafb", border: "#9ca3af", text: "#6b7280" },
  };
  const s = map[status] ?? { label: status, bg: "#f9fafb", border: "#9ca3af", text: "#6b7280" };
  return mapaStatusBadge(s.label, s.bg, s.border, s.text);
}

function mapaStatusBadge(label: string, bg: string, border: string, text: string) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 7px",
        borderRadius: "3px",
        border: `1.5px solid ${border}`,
        backgroundColor: bg,
        color: text,
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.02em",
        lineHeight: "16px",
      }}
    >
      {label}
    </span>
  );
}

function loteCountBadge(count: number) {
  const label = count === 1 ? "1 Lote" : `${count} Lotes`;
  return mapaStatusBadge(label, "#fffbeb", "#d97706", "#b45309");
}

function SemSubdivisaoTitulo({
  count,
  expanded,
  showChevron = false,
}: {
  count: number;
  expanded?: boolean;
  showChevron?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {showChevron ? (
        <span
          className="text-[13px] text-amber-700 shrink-0 w-4 text-center leading-none"
          aria-hidden
        >
          {expanded ? "▾" : "▸"}
        </span>
      ) : (
        <span className="shrink-0 w-4" aria-hidden />
      )}
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="text-[13px] font-semibold italic text-amber-900">Sem Subdivisão</span>
        {loteCountBadge(count)}
      </div>
    </div>
  );
}

// ─── Modal Mover Lote ─────────────────────────────────────────────────────────
type LoteInfo = { loteId: number; loteNome: string; totalAnimais: number; dataEntradaPasto: string | null };
type SubdivisaoInfo = {
  pastoId: number; pastoNome: string; pastoSigla: string | null; pastoStatus: string | null;
  areaHa: string | null; capacidade?: number | null; taxaLotacao: number | null; totalAnimais: number;
  diasVazio?: number | null;
  lotes: LoteInfo[];
};

function ModalMoverLote({
  lote, fazendaId, pastoAtualId, onClose, onSuccess,
}: {
  lote: LoteInfo; fazendaId: number; pastoAtualId: number | null;
  onClose: () => void; onSuccess: () => void;
}) {
  const [pastoDestinoId, setPastoDestinoId] = useState("");
  const [data, setData] = useState(hojeStr());

  const fazendaIdNum = typeof fazendaId === 'number' ? fazendaId : Number(fazendaId);
  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: fazendaIdNum },
    { enabled: fazendaIdNum > 0 }
  );
  const moveMutation = trpc.lotes.moveToPasto.useMutation({
    onSuccess: () => { toast.success(`Lote ${lote.loteNome} movido com sucesso!`); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const pastosDisponiveis = (pastos as { id: number; nome: string }[])
    .filter(p => p.id !== pastoAtualId)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-md shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-[14px] font-semibold text-gray-800">Mover Lote para Subdivisão</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">Lote: <strong>{lote.loteNome}</strong></p>
        </div>
        {/* Body */}
        <div className="px-6 py-4 space-y-3">
          {/* Data da Movimentação */}
          <div>
            <FormLabel required>Data de Movimentação</FormLabel>
            <FormDatePicker value={data} onChange={setData} required max={hojeStr()} />
          </div>
          {/* Subdivisão Destino */}
          <div>
            <FormLabel required>Subdivisão Destino</FormLabel>
            <FormSelect
              value={pastoDestinoId}
              onChange={setPastoDestinoId}
              placeholder="Selecione a subdivisão"
              required
            >
              {pastosDisponiveis.map(p => (
                <SelectItem key={p.id} value={String(p.id)} className="text-[13px]">
                  {p.nome}
                </SelectItem>
              ))}
            </FormSelect>
          </div>
        </div>
        {/* Footer */}
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-sm hover:bg-gray-50 transition bg-white">
            Cancelar
          </button>
          <button type="button" onClick={() => {
            if (!pastoDestinoId) { toast.error("Selecione a subdivisão destino."); return; }
            if (!data) { toast.error("Informe uma data válida."); return; }
            moveMutation.mutate({ loteId: lote.loteId, pastoId: Number(pastoDestinoId), dataEntrada: data });
          }} disabled={moveMutation.isPending}
            className="px-5 py-2 text-[12px] font-semibold text-white rounded-sm hover:brightness-95 disabled:opacity-50 transition"
            style={{ backgroundColor: FD_PRIMARY }}>
            {moveMutation.isPending ? "Movendo..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Histórico ───────────────────────────────────────────────────────────
type HistoricoRow = {
  id: number; loteId: number; loteNome: string;
  pastoOrigemId?: number | null;
  pastoOrigemNome: string | null;
  pastoDestinoId?: number | null;
  pastoDestinoNome: string | null;
  dataEntrada: string; dataSaida: string | null;
  diasNoPasto: number | null; qtdAnimais: number | null; observacoes: string | null;
};

function temOrigemRegistrada(row: HistoricoRow): boolean {
  return row.pastoOrigemId != null || !!row.pastoOrigemNome?.trim();
}

const CONFIRMACAO_EXCLUSAO_MOV_ENCERRADA = {
  titulo: "Excluir movimentação",
  mensagem:
    "Tem certeza que deseja excluir esta movimentação encerrada? Essa ação pode afetar o histórico do Lote.",
  confirmar: "Excluir movimentação",
  confirmarPendente: "Excluindo...",
  confirmarClass: "bg-red-600 hover:bg-red-700 text-white",
};

function ConfirmExclusaoMovimentacao({
  onCancelar,
  onExcluir,
  isPending,
}: {
  onCancelar: () => void;
  onExcluir: () => void;
  isPending: boolean;
}) {
  const cfg = CONFIRMACAO_EXCLUSAO_MOV_ENCERRADA;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        className="bg-white rounded-md shadow-xl w-full max-w-md p-5"
        role="alertdialog"
        aria-labelledby="confirm-excluir-mov-title"
        aria-describedby="confirm-excluir-mov-desc"
      >
        <h3 id="confirm-excluir-mov-title" className="text-[14px] font-semibold text-gray-800">
          {cfg.titulo}
        </h3>
        <p id="confirm-excluir-mov-desc" className="text-[12px] text-gray-600 mt-2 leading-relaxed">
          {cfg.mensagem}
        </p>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancelar}
            disabled={isPending}
            className="px-4 py-2 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-sm hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onExcluir}
            disabled={isPending}
            className={`px-4 py-2 text-[12px] font-semibold rounded-sm transition disabled:opacity-50 ${cfg.confirmarClass}`}
          >
            {isPending ? cfg.confirmarPendente : cfg.confirmar}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TimelineCard({
  row, isFirst, onSolicitarExclusao,
}: {
  row: HistoricoRow;
  isFirst: boolean;
  onSolicitarExclusao: (row: HistoricoRow) => void;
}) {
  const isAtual = !row.dataSaida;
  const dias = row.diasNoPasto;
  const diasLabel = dias != null ? `${dias}d no pasto` : null;
  const comOrigem = temOrigemRegistrada(row);
  const destinoNome = row.pastoDestinoNome?.trim() || "—";
  const podeExcluir = row.id > 0 && row.dataSaida != null;

  return (
    <div className="flex gap-3">
      {/* Linha vertical + ponto */}
      <div className="flex flex-col items-center" style={{ width: 28, flexShrink: 0 }}>
        <div
          style={{
            width: 12, height: 12, borderRadius: "50%", flexShrink: 0, marginTop: 4,
            backgroundColor: isAtual ? "#16a34a" : "#2D5A5A",
            border: `2px solid ${isAtual ? "#16a34a" : "#2D5A5A"}`,
            boxShadow: isAtual ? "0 0 0 3px #dcfce7" : "none",
          }}
        />
        {/* Linha conectora (não renderiza no último item) */}
        <div style={{ flex: 1, width: 2, backgroundColor: "#e5e7eb", minHeight: 24 }} />
      </div>

      {/* Card */}
      <div
        className="flex-1 mb-3"
        style={{
          border: `1px solid ${isAtual ? "#bbf7d0" : "#e5e7eb"}`,
          borderRadius: 6,
          backgroundColor: isAtual ? "#f0fdf4" : "#fff",
          padding: "10px 14px",
        }}
      >
        {/* Cabeçalho do card */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Lote */}
            <span
              style={{
                fontSize: 11, fontWeight: 700, color: "#374151",
                backgroundColor: "#f3f4f6", borderRadius: 3,
                padding: "1px 6px", border: "1px solid #e5e7eb",
              }}
            >
              {row.loteNome}
            </span>
            {/* Badge atual */}
            {isAtual && (
              <span
                style={{
                  fontSize: 10, fontWeight: 600, color: "#15803d",
                  backgroundColor: "#dcfce7", borderRadius: 3,
                  padding: "1px 6px", border: "1px solid #86efac",
                }}
              >
                Atual
              </span>
            )}
          </div>
          {/* Exclusão só em movimentações encerradas (histórico) */}
          {podeExcluir && (
            <TableIconButton
              label="Excluir movimentação encerrada"
              onClick={() => onSolicitarExclusao(row)}
              tone="danger"
              compact
            >
              <DeleteActionIcon size={16} />
            </TableIconButton>
          )}
        </div>

        {/* Rota ou registro inicial */}
        {comOrigem ? (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <div
              style={{
                fontSize: 11, color: "#6b7280",
                backgroundColor: "#f9fafb", borderRadius: 3,
                padding: "2px 8px", border: "1px solid #e5e7eb",
                maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
              title={row.pastoOrigemNome ?? undefined}
            >
              <span style={{ fontWeight: 600, color: "#9ca3af", marginRight: 4 }}>Origem:</span>
              {row.pastoOrigemNome}
            </div>
            <svg style={{ width: 14, height: 14, color: "#9ca3af", flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <div
              style={{
                fontSize: 11, fontWeight: 600, color: "#2D5A5A",
                backgroundColor: "#f0fdf4", borderRadius: 3,
                padding: "2px 8px", border: "1px solid #bbf7d0",
                maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
              title={destinoNome}
            >
              <span style={{ fontWeight: 600, color: "#6b7280", marginRight: 4 }}>Destino:</span>
              {destinoNome}
            </div>
          </div>
        ) : (
          <p
            className="mt-2 text-[12px] font-semibold text-[#2D5A5A] leading-snug"
            title="Primeiro registro conhecido no sistema — origem anterior não registrada"
          >
            Registro inicial no {destinoNome}
          </p>
        )}

        {/* Datas e metadados */}
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            <span style={{ fontWeight: 600, color: "#374151" }}>Entrada:</span>{" "}
            {formatDate(row.dataEntrada)}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            <span style={{ fontWeight: 600, color: "#374151" }}>Saída:</span>{" "}
            {row.dataSaida
              ? formatDate(row.dataSaida)
              : <span style={{ color: "#16a34a", fontWeight: 600 }}>Em andamento</span>}
          </div>
          {diasLabel && (
            <div
              style={{
                fontSize: 10, fontWeight: 600,
                color: isAtual ? "#15803d" : "#6b7280",
                backgroundColor: isAtual ? "#dcfce7" : "#f3f4f6",
                borderRadius: 3, padding: "1px 6px",
                border: `1px solid ${isAtual ? "#86efac" : "#e5e7eb"}`,
              }}
            >
              {diasLabel}
            </div>
          )}
          {row.qtdAnimais != null && (
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              <span style={{ fontWeight: 600, color: "#374151" }}>Animais:</span>{" "}
              {row.qtdAnimais}
            </div>
          )}
        </div>

        {/* Observações */}
        {row.observacoes && (
          <div
            style={{
              marginTop: 6, fontSize: 11, color: "#6b7280",
              fontStyle: "italic", borderTop: "1px solid #f3f4f6", paddingTop: 6,
            }}
          >
            {row.observacoes}
          </div>
        )}
      </div>
    </div>
  );
}

function ModalHistorico({
  fazendaId, loteId, pastoId, loteNome, onClose,
}: {
  fazendaId: number; loteId?: number; pastoId?: number; loteNome?: string; onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [excluirConfirmRow, setExcluirConfirmRow] = useState<HistoricoRow | null>(null);

  const { data: historico = [], isLoading } = trpc.lotes.mapaRebanhoHistorico.useQuery({
    fazendaId,
    loteId,
    pastoId,
    limit: 100,
  });

  const excluirMov = trpc.lotes.excluirMovimentacao.useMutation({
    onSuccess: () => {
      setExcluirConfirmRow(null);
      utils.lotes.mapaRebanhoHistorico.invalidate();
      utils.lotes.mapaRebanhoV2.invalidate();
    },
    onError: (err) => {
      setExcluirConfirmRow(null);
      toast.error(err.message);
    },
  });

  // Mais recentes no topo: ordena por dataEntrada DESC, com movimentação atual (dataSaida null) sempre primeiro
  const rows = [...(historico as HistoricoRow[])].sort((a, b) => {
    // Atual (sem dataSaida) sempre no topo
    if (!a.dataSaida && b.dataSaida) return -1;
    if (a.dataSaida && !b.dataSaida) return 1;
    // Demais: dataEntrada mais recente primeiro
    const da = a.dataEntrada ?? "";
    const db = b.dataEntrada ?? "";
    return db.localeCompare(da);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-md shadow-xl w-full max-w-xl mx-4 flex flex-col" style={{ maxHeight: "88vh" }}>
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">Histórico de Movimentação</h2>
            {loteNome
              ? <p className="text-[12px] text-gray-500 mt-0.5">Lote: <strong>{loteNome}</strong></p>
              : <p className="text-[12px] text-gray-500 mt-0.5">Todos os lotes da fazenda</p>}
          </div>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-[18px] leading-none font-light transition">✕</button>
        </div>

        {/* Corpo — timeline */}
        <div className="overflow-auto flex-1 px-5 pt-5 pb-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-[#2D5A5A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-[12px]">Nenhuma movimentação registrada</p>
            </div>
          ) : (
            <div>
              {/* Legenda */}
              <div className="flex items-center gap-4 mb-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#16a34a", boxShadow: "0 0 0 3px #dcfce7" }} />
                  <span style={{ fontSize: 11, color: "#6b7280" }}>Movimentação atual</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#2D5A5A" }} />
                  <span style={{ fontSize: 11, color: "#6b7280" }}>Encerrada</span>
                </div>
                <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
                  {rows.length} movimentaç{rows.length === 1 ? "ão" : "ões"}
                </span>
              </div>

              {/* Cards da timeline */}
              {rows.map((r, i) => (
                <TimelineCard
                  key={r.id}
                  row={r}
                  isFirst={i === 0}
                  onSolicitarExclusao={setExcluirConfirmRow}
                />
              ))}
            </div>
          )}
        </div>

        {excluirConfirmRow && (
          <ConfirmExclusaoMovimentacao
            onCancelar={() => setExcluirConfirmRow(null)}
            onExcluir={() => excluirMov.mutate({ movimentacaoId: excluirConfirmRow.id })}
            isPending={excluirMov.isPending}
          />
        )}

        {/* Rodapé */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            Movimentação encerrada: use a lixeira para corrigir o histórico. Movimentação atual: use Mover Lote.
          </p>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-sm hover:bg-gray-50 transition">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Linha de Lote dentro da Subdivisão ───────────────────────────────────────
function LoteRow({
  lote, fazendaId, pastoAtualId, onRefresh, taxaLotacaoPasto, totalAnimaisPasto,
}: {
  lote: LoteInfo; fazendaId: number; pastoAtualId: number | null; onRefresh: () => void;
  taxaLotacaoPasto?: number | null; totalAnimaisPasto?: number;
}) {
  // Contribuição proporcional: taxa_pasto × (animais_lote / total_animais_pasto)
  const taxaProporcional: number | null =
    taxaLotacaoPasto != null &&
    totalAnimaisPasto != null &&
    totalAnimaisPasto > 0
      ? Math.round((taxaLotacaoPasto * (lote.totalAnimais / totalAnimaisPasto)) * 100) / 100
      : null;
  const [modalMoverLote, setModalMoverLote] = useState(false);
  const [modalHistorico, setModalHistorico] = useState(false);

  return (
    <>
      <tr className="border-b border-gray-100 bg-white hover:bg-gray-50/50 transition-colors">
        <td className="pl-12 pr-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[12px] text-[#4ECDC4]/80 shrink-0" aria-hidden>└</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">LOTE</span>
            <span className="text-[12px] font-normal text-gray-700 truncate">{lote.loteNome}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-center">
          <span className="text-[12px] font-medium text-gray-700 tabular-nums">{lote.totalAnimais}</span>
        </td>
        <td className="px-3 py-2 text-center text-[12px] text-gray-400">—</td>
        <td className="px-3 py-2 text-center">
          {taxaProporcional !== null ? (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[12px] text-gray-600 tabular-nums">{formatTaxa(taxaProporcional)} UA/ha</span>
              <span
                className="text-[10px] text-gray-400 cursor-help underline decoration-dotted decoration-gray-300 underline-offset-2"
                title="Contribuição deste lote na taxa de lotação da subdivisão."
              >
                contribuição
              </span>
            </div>
          ) : <span className="text-[12px] text-gray-400">—</span>}
        </td>
        <td className="px-3 py-2 text-center">
          <EntradaPastoLote dataEntradaPasto={lote.dataEntradaPasto} />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-center gap-1.5">
            <button type="button" onClick={() => setModalHistorico(true)}
              title="Histórico do lote"
              className="inline-flex items-center justify-center px-2 py-1 text-[10px] font-medium leading-none text-gray-500 border border-gray-200 rounded hover:bg-gray-100 transition bg-white">
              Histórico
            </button>
            <button type="button" onClick={() => setModalMoverLote(true)}
              title="Mover lote para outra subdivisão"
              className="px-2 py-1 text-[10px] font-semibold text-white rounded hover:brightness-95 transition"
              style={{ backgroundColor: FD_PRIMARY }}>
              Mover Lote
            </button>
          </div>
        </td>
      </tr>

      {modalMoverLote && createPortal(
        <ModalMoverLote lote={lote} fazendaId={fazendaId} pastoAtualId={pastoAtualId}
          onClose={() => setModalMoverLote(false)} onSuccess={onRefresh} />,
        document.body
      )}

      {modalHistorico && createPortal(
        <ModalHistorico fazendaId={fazendaId} loteId={lote.loteId} loteNome={lote.loteNome}
          onClose={() => setModalHistorico(false)} />,
        document.body
      )}
    </>
  );
}

// ─── Linha de Subdivisão (cabeçalho do grupo) ─────────────────────────────────
function SubdivisaoRow({
  sub, fazendaId, expanded, onToggle, onRefresh,
}: {
  sub: SubdivisaoInfo; fazendaId: number; expanded: boolean;
  onToggle: () => void; onRefresh: () => void;
}) {
  const [modalHistorico, setModalHistorico] = useState(false);

  return (
    <>
      <tr
        className="border-b border-gray-200 cursor-pointer select-none hover:brightness-[0.99] transition-colors"
        style={(() => {
          const sup = sub.capacidade != null && sub.capacidade > 0 && sub.totalAnimais > sub.capacidade;
          return { backgroundColor: sup ? "#fff5f5" : "#eef4f4" };
        })()}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[13px] text-[#2D5A5A] shrink-0 w-4 text-center leading-none"
              aria-hidden
            >
              {expanded ? "▾" : "▸"}
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900">{sub.pastoNome}</span>
              {sub.pastoSigla && (
                <span className="text-[10px] font-medium text-gray-400">({sub.pastoSigla})</span>
              )}
              {statusBadge(sub.pastoStatus)}
            </div>
          </div>
        </td>
        <td className="px-3 py-3 text-center">
          {(() => {
            const cap = sub.capacidade != null && sub.capacidade > 0 ? sub.capacidade : null;
            const superlotado = cap !== null && sub.totalAnimais > cap;
            const pct = cap !== null ? Math.round((sub.totalAnimais / cap) * 100) : null;
            // Cores discretas e profissionais
            // Cinza neutro quando vazio (0 animais) ou sem capacidade cadastrada
            const isEmpty = sub.totalAnimais === 0;
            const trackColor = (pct === null || isEmpty) ? '#e5e7eb' : pct >= 100 ? '#fee2e2' : pct >= 80 ? '#fef3c7' : '#dcfce7';
            const fillColor  = (pct === null || isEmpty) ? '#d1d5db' : pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#16a34a';
            const textColor  = (pct === null || isEmpty) ? '#9ca3af' : pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#15803d';
            return (
              <div className="flex flex-col items-center gap-1.5" style={{ minWidth: 72 }}>
                {/* Número + badge de status */}
                <div className="flex items-center gap-1.5 justify-center">
                  <span className={`text-[15px] font-bold leading-none ${superlotado ? 'text-red-600' : 'text-gray-800'}`}>
                    {sub.totalAnimais}
                  </span>
                  {superlotado && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm"
                      style={{ backgroundColor: '#dc2626', color: '#fff', letterSpacing: '0.06em' }}
                    >
                      LOTADO
                    </span>
                  )}
                </div>
                {/* Barra de ocupação */}
                {cap !== null && (
                  <div className="w-full flex flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-full overflow-hidden"
                      style={{ height: 5, backgroundColor: trackColor }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(pct!, 100)}%`,
                          backgroundColor: fillColor,
                          transition: 'width 0.4s cubic-bezier(0.23,1,0.32,1)',
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: textColor }}>
                      {sub.totalAnimais} / {cap} UA
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </td>
        <td className="px-3 py-3 text-center text-[12px] text-gray-700 tabular-nums">
          {sub.areaHa ? `${formatArea(sub.areaHa)} ha` : <span className="text-gray-400">—</span>}
        </td>
        <td className="px-3 py-3 text-center text-[12px] font-medium text-gray-700 tabular-nums">
          {sub.taxaLotacao != null ? `${formatTaxa(sub.taxaLotacao)} UA/ha` : <span className="text-gray-400 font-normal">—</span>}
        </td>
        <td className="px-3 py-3 text-center">
          <EntradaPastoSubdivisao sub={sub} />
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-center">
            <button type="button"
              title="Histórico da subdivisão"
              onClick={e => { e.stopPropagation(); setModalHistorico(true); }}
              className="inline-flex items-center justify-center px-2 py-1 text-[10px] font-medium leading-none text-gray-600 border border-gray-200 rounded hover:bg-white transition bg-white/80">
              Histórico
            </button>
          </div>
        </td>
      </tr>

      {expanded && sub.lotes.map(lote => (
        <LoteRow key={lote.loteId} lote={lote} fazendaId={fazendaId}
          pastoAtualId={sub.pastoId} onRefresh={onRefresh}
          taxaLotacaoPasto={sub.taxaLotacao}
          totalAnimaisPasto={sub.totalAnimais} />
      ))}

      {modalHistorico && createPortal(
        <ModalHistorico fazendaId={fazendaId} pastoId={sub.pastoId} loteNome={sub.pastoNome}
          onClose={() => setModalHistorico(false)} />,
        document.body
      )}
    </>
  );
}

// ─── Tipos para visão geral ───────────────────────────────────────────────────
type FazendaMapaRow = {
  fazendaId: number;
  fazendaNome: string;
  subdivisoes: SubdivisaoInfo[];
  semSubdivisao: LoteInfo[];
  totalAnimais: number;
};

function isSubdivisaoSuperlotada(sub: SubdivisaoInfo): boolean {
  const cap = sub.capacidade != null && sub.capacidade > 0 ? sub.capacidade : null;
  return cap !== null && sub.totalAnimais > cap;
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function MapaRebanhoPage() {
  const searchString = useSearch();

  const { urlFazendaId, urlSuperlotados } = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const val = params.get("fazendaId");
    return {
      urlFazendaId: val === "0" ? "__clear__" : val || "",
      urlSuperlotados: params.get("superlotados") === "true",
    };
  }, [searchString]);

  const initialFilters = useMemo(() => {
    if (urlFazendaId === '__clear__') return INITIAL_FILTERS;
    if (urlFazendaId) return { ...INITIAL_FILTERS, fazendaId: urlFazendaId };
    return undefined; // usa o valor persistido
  }, [urlFazendaId]);

  const [filters, setFilters] = usePersistedState<FiltersState>(
    FILTERS_KEY,
    initialFilters ?? INITIAL_FILTERS
  );

  // Se a URL trouxer um fazendaId diferente do estado persistido, sobrescreve
  useEffect(() => {
    if (urlFazendaId === '__clear__') {
      setFilters(INITIAL_FILTERS);
    } else if (urlFazendaId && filters.fazendaId !== urlFazendaId) {
      setFilters(f => ({ ...f, fazendaId: urlFazendaId, pastoId: '' }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFazendaId]);
  const debouncedSearch = useDebounce(filters.search, 300);
  const [expandedSubdivisoes, setExpandedSubdivisoes] = useState<Set<number>>(new Set());
  const [expandedFazendas, setExpandedFazendas] = useState<Set<number>>(new Set());
  const [semSubdivisaoExpanded, setSemSubdivisaoExpanded] = useState(true);
  const [modalHistoricoGeral, setModalHistoricoGeral] = useState(false);

  const fazendaId = filters.fazendaId ? Number(filters.fazendaId) : null;
  const pastoId = filters.pastoId ? Number(filters.pastoId) : undefined;

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const fazendasList = fazendas as { id: number; nome: string }[];

  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: fazendaId! },
    { enabled: !!fazendaId }
  );
  const pastosList = (pastos as { id: number; nome: string }[]).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // Query para fazenda específica
  const {
    data: mapaData,
    isLoading: isLoadingFazenda,
    refetch: refetchFazenda,
  } = trpc.lotes.mapaRebanhoV2.useQuery(
    { fazendaId: fazendaId!, pastoId, search: debouncedSearch || undefined },
    { enabled: !!fazendaId }
  );

  // Query para visão geral (todas as fazendas)
  const {
    data: mapaGeralData,
    isLoading: isLoadingGeral,
    refetch: refetchGeral,
  } = trpc.lotes.mapaRebanhoGeral.useQuery(
    { search: debouncedSearch || undefined },
    { enabled: !fazendaId }
  );

  const isLoading = fazendaId ? isLoadingFazenda : isLoadingGeral;

  const subdivisoes: SubdivisaoInfo[] = (mapaData?.subdivisoes ?? []) as SubdivisaoInfo[];
  const semSubdivisao: LoteInfo[] = (mapaData?.semSubdivisao ?? []) as LoteInfo[];
  const fazendasGeral: FazendaMapaRow[] = (mapaGeralData ?? []) as FazendaMapaRow[];

  const subdivisoesExibidas = useMemo(() => {
    if (!urlSuperlotados) return subdivisoes;
    return subdivisoes.filter(isSubdivisaoSuperlotada);
  }, [subdivisoes, urlSuperlotados]);

  const fazendasGeralExibidas = useMemo(() => {
    if (!urlSuperlotados) return fazendasGeral;
    return fazendasGeral
      .map(fazenda => ({
        ...fazenda,
        subdivisoes: fazenda.subdivisoes.filter(isSubdivisaoSuperlotada),
      }))
      .filter(fazenda => fazenda.subdivisoes.length > 0);
  }, [fazendasGeral, urlSuperlotados]);

  // Auto-expandir subdivisões quando os dados carregam
  useEffect(() => {
    if (fazendaId && subdivisoes.length > 0) {
      const alvo = urlSuperlotados
        ? subdivisoes.filter(isSubdivisaoSuperlotada)
        : subdivisoes;
      setExpandedSubdivisoes(new Set(alvo.map(s => s.pastoId)));
    }
  }, [fazendaId, subdivisoes, urlSuperlotados]);

  // Na visão geral, abrir fazendas e subdivisões por padrão para ficar igual ao Manus.
  useEffect(() => {
    if (!fazendaId && fazendasGeral.length > 0) {
      const fazendas = urlSuperlotados ? fazendasGeralExibidas : fazendasGeral;
      setExpandedFazendas(new Set(fazendas.map(f => f.fazendaId)));
      setExpandedSubdivisoes(new Set(fazendas.flatMap(f => f.subdivisoes.map(s => s.pastoId))));
    }
  }, [fazendaId, fazendasGeral, fazendasGeralExibidas, urlSuperlotados]);

  const totalAnimais = useMemo(() => {
    if (fazendaId) {
      const s = subdivisoesExibidas.reduce((acc, s) => acc + s.totalAnimais, 0);
      const sem = urlSuperlotados ? 0 : semSubdivisao.reduce((acc, l) => acc + l.totalAnimais, 0);
      return s + sem;
    }
    return fazendasGeralExibidas.reduce((acc, f) => acc + f.totalAnimais, 0);
  }, [fazendaId, subdivisoesExibidas, semSubdivisao, fazendasGeralExibidas, urlSuperlotados]);

  // Dados para exportação — coluna Fazenda só aparece na visão geral (todas as fazendas)
  const exportHeaders = fazendaId
    ? ["Subdivisão", "Lote", "Total Animais", "Área (ha)", "Taxa Lotação (UA/ha)", "Entrada no Pasto"]
    : ["Fazenda", "Subdivisão", "Lote", "Total Animais", "Área (ha)", "Taxa Lotação (UA/ha)", "Entrada no Pasto"];
  const exportRows = useMemo(() => {
    const rows: (string | number | null)[][] = [];
    // Helper: calcula taxa proporcional do lote dentro do pasto
    const calcTaxaProp = (taxaPasto: number | null, totalPasto: number, totalLote: number): number | null =>
      taxaPasto != null && totalPasto > 0
        ? Math.round((taxaPasto * (totalLote / totalPasto)) * 100) / 100
        : null;

    if (fazendaId) {
      subdivisoes.forEach(sub => {
        sub.lotes.forEach(lote => {
          const taxaProp = calcTaxaProp(sub.taxaLotacao, sub.totalAnimais, lote.totalAnimais);
          rows.push([
            sub.pastoNome,
            lote.loteNome,
            lote.totalAnimais,
            sub.areaHa ? Number(sub.areaHa) : null,
            taxaProp,
            lote.dataEntradaPasto ? new Date(lote.dataEntradaPasto).toLocaleDateString("pt-BR") : null,
          ]);
        });
        if (sub.lotes.length === 0) {
          rows.push([sub.pastoNome, "—", sub.totalAnimais, sub.areaHa ? Number(sub.areaHa) : null, sub.taxaLotacao, null]);
        }
      });
      semSubdivisao.forEach(lote => {
        rows.push(["Sem Subdivisão", lote.loteNome, lote.totalAnimais, null, null, lote.dataEntradaPasto ? new Date(lote.dataEntradaPasto).toLocaleDateString("pt-BR") : null]);
      });
    } else {
      fazendasGeral.forEach(faz => {
        faz.subdivisoes.forEach((sub: SubdivisaoInfo) => {
          sub.lotes.forEach((lote: LoteInfo) => {
            const taxaProp = calcTaxaProp(sub.taxaLotacao, sub.totalAnimais, lote.totalAnimais);
            rows.push([faz.fazendaNome, sub.pastoNome, lote.loteNome, lote.totalAnimais, sub.areaHa ? Number(sub.areaHa) : null, taxaProp, lote.dataEntradaPasto ? new Date(lote.dataEntradaPasto).toLocaleDateString("pt-BR") : null]);
          });
          if (sub.lotes.length === 0) {
            rows.push([faz.fazendaNome, sub.pastoNome, "—", sub.totalAnimais, sub.areaHa ? Number(sub.areaHa) : null, sub.taxaLotacao, null]);
          }
        });
        faz.semSubdivisao?.forEach((lote: LoteInfo) => {
          rows.push([faz.fazendaNome, "Sem Subdivisão", lote.loteNome, lote.totalAnimais, null, null, null]);
        });
      });
    }
    return rows;
  }, [fazendaId, subdivisoes, semSubdivisao, fazendasGeral, fazendasList, filters.fazendaId]);

  // Dados hierárquicos para o PDF especializado
  const exportPdfData = useMemo((): MapaFazendaExport[] => {
    const hoje = hojeStr();
    const calcTaxaProp = (taxaPasto: number | null, totalPasto: number, totalLote: number): number | null =>
      taxaPasto != null && totalPasto > 0
        ? Math.round((taxaPasto * (totalLote / totalPasto)) * 100) / 100
        : null;
    const formatDataEntrada = (dataEntrada: string | null): string | null => {
      const iso = normalizarDataISO(dataEntrada);
      if (!iso) return null;
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    };
    const toLote = (lote: LoteInfo, taxaPasto: number | null, totalPasto: number): MapaLoteExport => {
      const iso = normalizarDataISO(lote.dataEntradaPasto);
      return {
        loteNome: lote.loteNome,
        totalAnimais: lote.totalAnimais,
        taxaProporcional: calcTaxaProp(taxaPasto, totalPasto, lote.totalAnimais),
        dataEntradaPasto: formatDataEntrada(lote.dataEntradaPasto),
        diasNoPasto: iso ? calcDiasNoPastoISO(iso, hoje) : null,
      };
    };
    const toSub = (sub: SubdivisaoInfo): MapaSubdivisaoExport => ({
      pastoNome: sub.pastoNome,
      pastoSigla: sub.pastoSigla,
      pastoStatus: sub.pastoStatus,
      totalAnimais: sub.totalAnimais,
      areaHa: sub.areaHa ? Number(sub.areaHa) : null,
      taxaLotacao: sub.taxaLotacao,
      capacidade: sub.capacidade ?? null,
      diasVazio: sub.diasVazio ?? null,
      lotes: (sub.lotes ?? []).map(l => toLote(l, sub.taxaLotacao, sub.totalAnimais)),
    });
    if (fazendaId) {
      const fazNome = fazendasList.find(f => String(f.id) === filters.fazendaId)?.nome ?? "Fazenda";
      return [{
        fazendaNome: fazNome,
        subdivisoes: subdivisoesExibidas.map(toSub),
        semSubdivisao: (urlSuperlotados ? [] : semSubdivisao).map(l => toLote(l, null, 0)),
      }];
    }
    return fazendasGeralExibidas.map(faz => ({
      fazendaNome: faz.fazendaNome,
      subdivisoes: (faz.subdivisoes ?? []).map(toSub),
      semSubdivisao: (faz.semSubdivisao ?? []).map((l: LoteInfo) => toLote(l, null, 0)),
    }));
  }, [fazendaId, subdivisoesExibidas, semSubdivisao, fazendasGeralExibidas, fazendasList, filters.fazendaId, urlSuperlotados]);

  const exportTemDados = countMapaRebanhoRegistros(exportPdfData) > 0;

  const toggleSubdivisao = (pastoId: number) => {
    setExpandedSubdivisoes(prev => {
      const next = new Set(prev);
      if (next.has(pastoId)) next.delete(pastoId);
      else next.add(pastoId);
      return next;
    });
  };

  const toggleFazenda = (fId: number) => {
    setExpandedFazendas(prev => {
      const next = new Set(prev);
      if (next.has(fId)) next.delete(fId);
      else next.add(fId);
      return next;
    });
  };

  const expandAll = () => {
    if (fazendaId) {
      setExpandedSubdivisoes(new Set(subdivisoes.map(s => s.pastoId)));
      setSemSubdivisaoExpanded(true);
    } else {
      setExpandedFazendas(new Set(fazendasGeral.map(f => f.fazendaId)));
      setExpandedSubdivisoes(new Set(fazendasGeral.flatMap(f => f.subdivisoes.map(s => s.pastoId))));
      setSemSubdivisaoExpanded(true);
    }
  };
  const collapseAll = () => {
    setExpandedSubdivisoes(new Set());
    setExpandedFazendas(new Set());
    setSemSubdivisaoExpanded(false);
  };

  const handleRefresh = () => { fazendaId ? refetchFazenda() : refetchGeral(); };

  return (
    <AppLayout>
      <div className="px-6 py-5 max-w-[1200px] mx-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[18px] font-bold text-gray-800">Mapa do Rebanho</h1>

          </div>
          <div className="flex items-center gap-2">
            {fazendaId && (
              <button
                type="button"
                onClick={() => setModalHistoricoGeral(true)}
                title="Histórico de movimentação de todos os lotes da fazenda"
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg text-[12px] font-semibold text-[#2D5A5A] border border-[#2D5A5A]/25 bg-white hover:bg-[#eef4f4] transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Histórico Geral
              </button>
            )}
            <ListExportButtons
              title="Mapa do Rebanho"
              filename="mapa-rebanho"
              headers={exportHeaders}
              rows={exportRows}
              variant="secondary"
              disabled={isLoading || !exportTemDados}
              fazendaNome={fazendasList.find(f => String(f.id) === filters.fazendaId)?.nome}
              onExportSpreadsheet={() =>
                void exportMapaRebanhoXlsx(exportPdfData, {
                  fazendaNome: fazendasList.find(f => String(f.id) === filters.fazendaId)?.nome,
                  subdivisaoNome: filters.pastoId
                    ? pastosList.find(p => String(p.id) === filters.pastoId)?.nome
                    : undefined,
                })
              }
              onExportPdf={() =>
                exportMapaRebanhoPdf(exportPdfData, {
                  fazendaNome: fazendasList.find(f => String(f.id) === filters.fazendaId)?.nome,
                })
              }
            />
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500">Fazenda</label>
            <select
              value={filters.fazendaId}
              onChange={e => setFilters(f => ({ ...f, fazendaId: e.target.value, pastoId: "" }))}
              className="h-[36px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A] min-w-[200px]">
              <option value="">Selecione uma fazenda</option>
              {fazendasList.map(f => <option key={f.id} value={String(f.id)}>{f.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500">Subdivisão</label>
            <select
              value={filters.pastoId}
              onChange={e => setFilters(f => ({ ...f, pastoId: e.target.value }))}
              disabled={!fazendaId}
              className="h-[36px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A] min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed">
              <option value="">Todas as subdivisões</option>
              {pastosList.map(p => <option key={p.id} value={String(p.id)}>{p.nome}</option>)}
            </select>
          </div>

        </div>

        {urlSuperlotados && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md">
            <span className="material-icons text-[16px] text-red-600">warning</span>
            <span className="text-[12px] font-medium text-red-700">
              Exibindo apenas pastos com lotação acima da capacidade
            </span>
          </div>
        )}

        {/* Conteúdo */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#2D5A5A] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : fazendaId ? (
          /* ─── VISÃO ESPECÍFICA DA FAZENDA ─── */
          (subdivisoesExibidas.length === 0 && (urlSuperlotados || semSubdivisao.length === 0)) ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-[13px] font-medium text-gray-400">
                {urlSuperlotados
                  ? "Nenhum pasto superlotado encontrado para esta fazenda"
                  : "Nenhum lote encontrado para esta fazenda"}
              </p>
            </div>
          ) : (
            <TabelaMapa
              subdivisoes={subdivisoesExibidas}
              semSubdivisao={urlSuperlotados ? [] : semSubdivisao}
              fazendaId={fazendaId}
              totalAnimais={totalAnimais}
              expandedSubdivisoes={expandedSubdivisoes}
              semSubdivisaoExpanded={semSubdivisaoExpanded}
              onToggleSubdivisao={toggleSubdivisao}
              onToggleSemSubdivisao={() => setSemSubdivisaoExpanded(v => !v)}
              onExpandAll={expandAll}
              onCollapseAll={collapseAll}
              onRefresh={handleRefresh}
            />
          )
        ) : (
          /* ─── VISÃO GERAL (TODAS AS FAZENDAS) ─── */
          fazendasGeralExibidas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <p className="text-[13px] font-medium text-gray-400">
                {urlSuperlotados
                  ? "Nenhum pasto superlotado encontrado"
                  : "Nenhuma fazenda cadastrada"}
              </p>
            </div>
          ) : (
            <>


              {/* Tabela por fazenda */}
              <div className="space-y-3">
                {fazendasGeralExibidas.map(fazenda => (
                  <div key={fazenda.fazendaId} className="border border-gray-200 rounded-md overflow-hidden">
                    {/* Cabeçalho da fazenda */}
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                      style={{ backgroundColor: FD_PRIMARY }}
                      onClick={() => toggleFazenda(fazenda.fazendaId)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="text-[11px] text-white/70 shrink-0 transition-transform"
                          style={{
                            display: "inline-block",
                            transform: expandedFazendas.has(fazenda.fazendaId) ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                          aria-hidden
                        >
                          ▶
                        </span>
                        <span className="text-[14px] font-bold text-white truncate">
                          {fazenda.fazendaNome}
                          <span className="font-semibold text-white/90"> — </span>
                          {fazenda.totalAnimais} animais
                        </span>
                      </div>
                    </div>

                    {/* Tabela da fazenda (expandida) */}
                    {expandedFazendas.has(fazenda.fazendaId) && (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            {MAPA_TABLE_HEADERS_LIGHT}
                          </tr>
                        </thead>
                        <tbody>
                          {fazenda.subdivisoes.map(sub => (
                            <SubdivisaoRow
                              key={sub.pastoId}
                              sub={sub}
                              fazendaId={fazenda.fazendaId}
                              expanded={expandedSubdivisoes.has(sub.pastoId)}
                              onToggle={() => toggleSubdivisao(sub.pastoId)}
                              onRefresh={handleRefresh}
                            />
                          ))}
                          {fazenda.semSubdivisao.length > 0 && (
                            <>
                              <tr
                                className="border-b border-amber-100 cursor-default"
                                style={{ backgroundColor: "#fffbeb" }}
                              >
                                <td className="px-4 py-3 border-l-[3px] border-l-amber-300">
                                  <SemSubdivisaoTitulo count={fazenda.semSubdivisao.length} />
                                </td>
                                <td className="px-3 py-3 text-center text-[12px] font-bold text-gray-800 tabular-nums">
                                  {fazenda.semSubdivisao.reduce((a, l) => a + l.totalAnimais, 0)}
                                </td>
                                <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                                <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                                <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                                <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                              </tr>
                              {fazenda.semSubdivisao.map(lote => (
                                <LoteRow key={lote.loteId} lote={lote} fazendaId={fazenda.fazendaId}
                                  pastoAtualId={null} onRefresh={handleRefresh} />
                              ))}
                            </>
                          )}
                          {fazenda.subdivisoes.length === 0 && fazenda.semSubdivisao.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-4 text-center text-[12px] text-gray-400">Nenhum lote nesta fazenda</td></tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </div>

      {/* Modal Histórico Geral */}
      {modalHistoricoGeral && fazendaId && (
        <ModalHistorico fazendaId={fazendaId} onClose={() => setModalHistoricoGeral(false)} />
      )}
    </AppLayout>
  );
}

// ─── Componente auxiliar TabelaMapa (visão de uma fazenda específica) ────────────────
function TabelaMapa({
  subdivisoes, semSubdivisao, fazendaId, totalAnimais,
  expandedSubdivisoes, semSubdivisaoExpanded,
  onToggleSubdivisao, onToggleSemSubdivisao, onExpandAll, onCollapseAll, onRefresh,
}: {
  subdivisoes: SubdivisaoInfo[];
  semSubdivisao: LoteInfo[];
  fazendaId: number;
  totalAnimais: number;
  expandedSubdivisoes: Set<number>;
  semSubdivisaoExpanded: boolean;
  onToggleSubdivisao: (id: number) => void;
  onToggleSemSubdivisao: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200" style={{ backgroundColor: FD_PRIMARY }}>
              {MAPA_TABLE_HEADERS}
            </tr>
          </thead>
          <tbody>
            {subdivisoes.map(sub => (
              <SubdivisaoRow
                key={sub.pastoId}
                sub={sub}
                fazendaId={fazendaId}
                expanded={expandedSubdivisoes.has(sub.pastoId)}
                onToggle={() => onToggleSubdivisao(sub.pastoId)}
                onRefresh={onRefresh}
              />
            ))}
            {semSubdivisao.length > 0 && (
              <>
                <tr
                  className="border-b border-amber-100 cursor-pointer select-none hover:bg-amber-50/80 transition-colors"
                  style={{ backgroundColor: "#fffbeb" }}
                  onClick={onToggleSemSubdivisao}
                >
                  <td className="px-4 py-3 border-l-[3px] border-l-amber-300">
                    <SemSubdivisaoTitulo
                      count={semSubdivisao.length}
                      expanded={semSubdivisaoExpanded}
                      showChevron
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-[13px] font-bold text-gray-800 tabular-nums">
                      {semSubdivisao.reduce((a, l) => a + l.totalAnimais, 0)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                  <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                  <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                  <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                </tr>
                {semSubdivisaoExpanded && semSubdivisao.map(lote => (
                  <LoteRow key={lote.loteId} lote={lote} fazendaId={fazendaId}
                    pastoAtualId={null} onRefresh={onRefresh} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
