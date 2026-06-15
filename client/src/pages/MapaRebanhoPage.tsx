/**
 * Mapa do Rebanho — Redesenhado
 * Estrutura: Fazenda → Subdivisão → Lotes
 * Foco: Total de Animais, Área (ha), Taxa de Lotação, Histórico de Movimentação
 * Rota: /rebanho/mapa-rebanho
 */
import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import ListExportButtons from "@/components/ListExportButtons";

const GREEN = "#2D5A5A";
const FILTERS_KEY = "fd:mapa-rebanho-v2-filtros";

type FiltersState = { fazendaId: string; pastoId: string; search: string };
const INITIAL_FILTERS: FiltersState = { fazendaId: "", pastoId: "", search: "" };

function hojeStr() { return new Date().toISOString().slice(0, 10); }
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
function statusBadge(status: string | null) {
  if (!status) return null;
  const map: Record<string, { label: string; color: string }> = {
    ativo: { label: "Ativo", color: "bg-green-100 text-green-700" },
    descanso: { label: "Descanso", color: "bg-yellow-100 text-yellow-700" },
    vazio: { label: "Vazio", color: "bg-gray-100 text-gray-500" },
  };
  const s = map[status] ?? { label: status, color: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

// ─── Modal Mover Lote ─────────────────────────────────────────────────────────
type LoteInfo = { loteId: number; loteNome: string; totalAnimais: number; dataEntradaPasto: string | null };
type SubdivisaoInfo = {
  pastoId: number; pastoNome: string; pastoSigla: string | null; pastoStatus: string | null;
  areaHa: string | null; taxaLotacao: number | null; totalAnimais: number; lotes: LoteInfo[];
};

function ModalMoverLote({
  lote, fazendaId, pastoAtualId, onClose, onSuccess,
}: {
  lote: LoteInfo; fazendaId: number; pastoAtualId: number | null;
  onClose: () => void; onSuccess: () => void;
}) {
  const [pastoDestinoId, setPastoDestinoId] = useState("");
  const [data, setData] = useState(hojeStr());
  const [obs, setObs] = useState("");

  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery({ fazendaId });
  const moveMutation = trpc.lotes.moveToPasto.useMutation({
    onSuccess: () => { toast.success(`Lote ${lote.loteNome} movido com sucesso!`); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const pastosDisponiveis = (pastos as { id: number; nome: string }[]).filter(p => p.id !== pastoAtualId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-md shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-[14px] font-semibold text-gray-800 mb-1">Mover Lote para Subdivisão</h2>
        <p className="text-[12px] text-gray-500 mb-4">
          Lote: <strong>{lote.loteNome}</strong>
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Subdivisão Destino *</label>
            <select value={pastoDestinoId} onChange={e => setPastoDestinoId(e.target.value)}
              className="w-full h-[38px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A]">
              <option value="">Selecione a subdivisão</option>
              {pastosDisponiveis.map(p => <option key={p.id} value={String(p.id)}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Data da Movimentação *</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full h-[38px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A]" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Opcional"
              className="w-full px-3 py-2 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A] resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-sm hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="button" onClick={() => {
            if (!pastoDestinoId) { toast.error("Selecione a subdivisão destino."); return; }
            moveMutation.mutate({ loteId: lote.loteId, pastoId: Number(pastoDestinoId), observacoes: obs || undefined });
          }} disabled={moveMutation.isPending}
            className="px-5 py-2 text-[12px] font-semibold text-white rounded-sm hover:brightness-95 disabled:opacity-50 transition"
            style={{ backgroundColor: GREEN }}>
            {moveMutation.isPending ? "Movendo..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Mover Animal ────────────────────────────────────────────────────────
function ModalMoverAnimal({
  lote, fazendaId, onClose, onSuccess,
}: {
  lote: LoteInfo; fazendaId: number; onClose: () => void; onSuccess: () => void;
}) {
  const [loteDestinoId, setLoteDestinoId] = useState("");
  const [data, setData] = useState(hojeStr());
  const [selectedAnimais, setSelectedAnimais] = useState<number[]>([]);

  const { data: animaisData } = trpc.animais.list.useQuery({ fazendaId, loteId: lote.loteId });
  const animaisList = (animaisData ?? []) as { id: number; brinco: string; categoria: string; sexo: string }[];

  const { data: lotesData } = trpc.lotes.list.useQuery();
  const lotesDisponiveis = ((lotesData as { id: number; nome: string; fazendaId?: number | null }[] | undefined) ?? [])
    .filter(l => l.id !== lote.loteId && l.fazendaId === fazendaId);

  const moveMutation = trpc.lotes.movimentarAnimais.useMutation({
    onSuccess: (res) => {
      toast.success(`${(res as { count?: number }).count ?? selectedAnimais.length} animal(is) movido(s)!`);
      onSuccess(); onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleAnimal = (id: number) =>
    setSelectedAnimais(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  const toggleAll = () =>
    setSelectedAnimais(selectedAnimais.length === animaisList.length ? [] : animaisList.map(a => a.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-md shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-[14px] font-semibold text-gray-800 mb-1">Mover Animal para Outro Lote</h2>
        <p className="text-[12px] text-gray-500 mb-4">Lote origem: <strong>{lote.loteNome}</strong></p>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium text-gray-600">Selecionar Animais *</label>
            <button type="button" onClick={toggleAll} className="text-[11px] text-[#2D5A5A] hover:underline">
              {selectedAnimais.length === animaisList.length ? "Desmarcar todos" : "Selecionar todos"}
            </button>
          </div>
          <div className="border border-gray-200 rounded-sm max-h-[150px] overflow-y-auto bg-[#EEEEEE]">
            {animaisList.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-gray-400 text-center">Nenhum animal neste lote</p>
            ) : animaisList.map(a => (
              <label key={a.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 cursor-pointer">
                <input type="checkbox" checked={selectedAnimais.includes(a.id)} onChange={() => toggleAnimal(a.id)}
                  className="accent-[#2D5A5A]" />
                <span className="text-[12px] text-gray-700">
                  Brinco <strong>{a.brinco}</strong> — {a.categoria} — {a.sexo}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Lote Destino *</label>
          <select value={loteDestinoId} onChange={e => setLoteDestinoId(e.target.value)}
            className="w-full h-[38px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A]">
            <option value="">Selecione o lote destino</option>
            {lotesDisponiveis.map(l => <option key={l.id} value={String(l.id)}>{l.nome}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Data da Movimentação *</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            className="w-full h-[38px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A]" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-sm hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="button" onClick={() => {
            if (selectedAnimais.length === 0) { toast.error("Selecione ao menos um animal."); return; }
            if (!loteDestinoId) { toast.error("Selecione o lote destino."); return; }
            moveMutation.mutate({ loteOrigemId: lote.loteId, loteDestinoId: Number(loteDestinoId), animalIds: selectedAnimais, dataMovimentacao: data });
          }} disabled={moveMutation.isPending}
            className="px-5 py-2 text-[12px] font-semibold text-white rounded-sm hover:brightness-95 disabled:opacity-50 transition"
            style={{ backgroundColor: GREEN }}>
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
  pastoOrigemNome: string | null; pastoDestinoNome: string | null;
  dataEntrada: string; dataSaida: string | null;
  diasNoPasto: number | null; qtdAnimais: number | null; observacoes: string | null;
};

function ModalHistorico({
  fazendaId, loteId, pastoId, loteNome, onClose,
}: {
  fazendaId: number; loteId?: number; pastoId?: number; loteNome?: string; onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);

  const { data: historico = [], isLoading } = trpc.lotes.mapaRebanhoHistorico.useQuery({
    fazendaId,
    loteId,
    pastoId,
    limit: 100,
  });

  const excluirMov = trpc.lotes.excluirMovimentacao.useMutation({
    onSuccess: () => {
      setConfirmandoId(null);
      utils.lotes.mapaRebanhoHistorico.invalidate();
      utils.lotes.mapaRebanhoV2.invalidate();
    },
    onError: (err) => {
      setConfirmandoId(null);
      alert(err.message);
    },
  });

  const rows = historico as HistoricoRow[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-md shadow-xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: "85vh" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">Histórico de Movimentação</h2>
            {loteNome && <p className="text-[12px] text-gray-500 mt-0.5">Lote: <strong>{loteNome}</strong></p>}
            {!loteNome && <p className="text-[12px] text-gray-500 mt-0.5">Todos os lotes da fazenda</p>}
          </div>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-[18px] leading-none font-light transition">✕</button>
        </div>
        <div className="overflow-auto flex-1">
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
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Lote</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">De</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Para</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Entrada</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Saída</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Dias</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Animais</th>
                  <th className="px-2 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{r.loteNome}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.pastoOrigemNome ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-gray-800">{r.pastoDestinoNome ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{formatDate(r.dataEntrada)}</td>
                    <td className="px-4 py-2.5 text-center text-gray-500">
                      {r.dataSaida ? formatDate(r.dataSaida) : <span className="text-green-600 font-medium">Atual</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{r.diasNoPasto ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{r.qtdAnimais ?? "—"}</td>
                    <td className="px-2 py-2.5 text-center">
                      {/* Só permite excluir movimentações encerradas (dataSaida preenchida) */}
                      {r.dataSaida ? (
                        confirmandoId === r.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => excluirMov.mutate({ movimentacaoId: r.id })}
                              disabled={excluirMov.isPending}
                              className="px-2 py-0.5 text-[10px] font-semibold text-white bg-red-500 rounded hover:bg-red-600 transition disabled:opacity-50"
                            >
                              {excluirMov.isPending ? "..." : "Sim"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoId(null)}
                              className="px-2 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            title="Excluir movimentação"
                            onClick={() => setConfirmandoId(r.id)}
                            className="p-1 text-gray-300 hover:text-red-500 transition rounded"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )
                      ) : (
                        <span title="Movimentação atual não pode ser excluída" className="text-gray-200 cursor-not-allowed p-1 inline-block">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            <svg className="w-3 h-3 inline mr-1 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Movimentação atual não pode ser excluída
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
  lote, fazendaId, pastoAtualId, onRefresh,
}: {
  lote: LoteInfo; fazendaId: number; pastoAtualId: number | null; onRefresh: () => void;
}) {
  const [modalMoverLote, setModalMoverLote] = useState(false);
  const [modalMoverAnimal, setModalMoverAnimal] = useState(false);
  const [modalHistorico, setModalHistorico] = useState(false);

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
        <td className="pl-10 pr-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-300">└</span>
            <span className="text-[12px] font-medium text-gray-700">{lote.loteNome}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-center">
          <span className="text-[12px] font-semibold text-gray-800">{lote.totalAnimais}</span>
        </td>
        <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">—</td>
        <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">
          {lote.dataEntradaPasto ? formatDate(lote.dataEntradaPasto) : "—"}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-center gap-1.5">
            <button type="button" onClick={() => setModalHistorico(true)}
              title="Ver histórico de movimentação"
              className="px-2 py-1 text-[10px] font-medium text-gray-500 border border-gray-200 rounded hover:bg-gray-100 transition">
              Histórico
            </button>
            <button type="button" onClick={() => setModalMoverLote(true)}
              title="Mover lote para outra subdivisão"
              className="px-2 py-1 text-[10px] font-semibold text-white rounded hover:brightness-95 transition"
              style={{ backgroundColor: GREEN }}>
              Mover Lote
            </button>
            <button type="button" onClick={() => setModalMoverAnimal(true)}
              title="Mover animais para outro lote"
              className="px-2 py-1 text-[10px] font-medium border rounded hover:bg-gray-50 transition"
              style={{ color: GREEN, borderColor: GREEN }}>
              Mover Animal
            </button>
          </div>
        </td>
      </tr>

      {modalMoverLote && createPortal(
        <ModalMoverLote lote={lote} fazendaId={fazendaId} pastoAtualId={pastoAtualId}
          onClose={() => setModalMoverLote(false)} onSuccess={onRefresh} />,
        document.body
      )}
      {modalMoverAnimal && createPortal(
        <ModalMoverAnimal lote={lote} fazendaId={fazendaId}
          onClose={() => setModalMoverAnimal(false)} onSuccess={onRefresh} />,
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
        className="border-b border-gray-200 cursor-pointer select-none"
        style={{ backgroundColor: "#f0f5f5" }}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 transition-transform" style={{ display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
            <div>
              <span className="text-[13px] font-semibold text-gray-800">{sub.pastoNome}</span>
              {sub.pastoSigla && <span className="ml-1.5 text-[10px] text-gray-400">({sub.pastoSigla})</span>}
            </div>
            {statusBadge(sub.pastoStatus)}
            <span className="ml-1 text-[10px] text-gray-400">{sub.lotes.length} lote{sub.lotes.length !== 1 ? "s" : ""}</span>
          </div>
        </td>
        <td className="px-3 py-3 text-center">
          <span className="text-[13px] font-bold" style={{ color: GREEN }}>{sub.totalAnimais}</span>
        </td>
        <td className="px-3 py-3 text-center text-[12px] text-gray-700">{formatArea(sub.areaHa)} ha</td>
        <td className="px-3 py-3 text-center text-[12px] text-gray-700">{formatTaxa(sub.taxaLotacao)} UA/ha</td>
        <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-center">
            <button type="button"
              onClick={e => { e.stopPropagation(); setModalHistorico(true); }}
              className="px-2 py-1 text-[10px] font-medium text-gray-500 border border-gray-200 rounded hover:bg-gray-100 transition bg-white">
              Histórico
            </button>
          </div>
        </td>
      </tr>

      {expanded && sub.lotes.map(lote => (
        <LoteRow key={lote.loteId} lote={lote} fazendaId={fazendaId}
          pastoAtualId={sub.pastoId} onRefresh={onRefresh} />
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

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function MapaRebanhoPage() {
  const [filters, setFilters] = usePersistedState<FiltersState>(FILTERS_KEY, INITIAL_FILTERS);
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

  const totalAnimais = useMemo(() => {
    if (fazendaId) {
      const s = subdivisoes.reduce((acc, s) => acc + s.totalAnimais, 0);
      const sem = semSubdivisao.reduce((acc, l) => acc + l.totalAnimais, 0);
      return s + sem;
    }
    return fazendasGeral.reduce((acc, f) => acc + f.totalAnimais, 0);
  }, [fazendaId, subdivisoes, semSubdivisao, fazendasGeral]);

  // Dados para exportação — coluna Fazenda só aparece na visão geral (todas as fazendas)
  const exportHeaders = fazendaId
    ? ["Subdivisão", "Lote", "Total Animais", "Área (ha)", "Taxa Lotação (UA/ha)", "Entrada no Pasto"]
    : ["Fazenda", "Subdivisão", "Lote", "Total Animais", "Área (ha)", "Taxa Lotação (UA/ha)", "Entrada no Pasto"];
  const exportRows = useMemo(() => {
    const rows: (string | number | null)[][] = [];
    if (fazendaId) {
      subdivisoes.forEach(sub => {
        sub.lotes.forEach(lote => {
          rows.push([
            sub.pastoNome,
            lote.loteNome,
            lote.totalAnimais,
            sub.areaHa ? Number(sub.areaHa) : null,
            sub.taxaLotacao,
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
            rows.push([faz.fazendaNome, sub.pastoNome, lote.loteNome, lote.totalAnimais, sub.areaHa ? Number(sub.areaHa) : null, sub.taxaLotacao, lote.dataEntradaPasto ? new Date(lote.dataEntradaPasto).toLocaleDateString("pt-BR") : null]);
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
              <button type="button" onClick={() => setModalHistoricoGeral(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-sm hover:bg-gray-50 transition bg-white">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              alignRightFrom={3}
              fazendaNome={fazendasList.find(f => String(f.id) === filters.fazendaId)?.nome}
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

        {/* Conteúdo */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#2D5A5A] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : fazendaId ? (
          /* ─── VISÃO ESPECÍFICA DA FAZENDA ─── */
          (subdivisoes.length === 0 && semSubdivisao.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-[13px] font-medium text-gray-400">Nenhum lote encontrado para esta fazenda</p>
            </div>
          ) : (
            <TabelaMapa
              subdivisoes={subdivisoes}
              semSubdivisao={semSubdivisao}
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
          fazendasGeral.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <p className="text-[13px] font-medium text-gray-400">Nenhuma fazenda cadastrada</p>
            </div>
          ) : (
            <>


              {/* Tabela por fazenda */}
              <div className="space-y-3">
                {fazendasGeral.map(fazenda => (
                  <div key={fazenda.fazendaId} className="border border-gray-200 rounded-md overflow-hidden">
                    {/* Cabeçalho da fazenda */}
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                      style={{ backgroundColor: GREEN }}
                      onClick={() => toggleFazenda(fazenda.fazendaId)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-white/70 transition-transform" style={{ display: "inline-block", transform: expandedFazendas.has(fazenda.fazendaId) ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                        <span className="text-[14px] font-bold text-white">{fazenda.fazendaNome}</span>
                        <span className="text-[11px] text-white/60">{fazenda.subdivisoes.length} subdivisão(oes) · {fazenda.subdivisoes.reduce((a, s) => a + s.lotes.length, 0) + fazenda.semSubdivisao.length} lote(s)</span>
                      </div>
                      <span className="text-[13px] font-bold text-white">{fazenda.totalAnimais} animais</span>
                    </div>

                    {/* Tabela da fazenda (expandida) */}
                    {expandedFazendas.has(fazenda.fazendaId) && (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Subdivisão / Lote</th>
                            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-28">Total Animais</th>
                            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-28">Área (ha)</th>
                            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-32">Taxa Lotação</th>
                            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-32">Entrada no Pasto</th>
                            <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-48">Ações</th>
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
                              <tr className="border-b border-gray-200" style={{ backgroundColor: "#f7f7f7" }}>
                                <td className="px-4 py-2.5">
                                  <span className="text-[12px] font-semibold text-gray-500 italic">Sem Subdivisão</span>
                                  <span className="ml-2 text-[10px] text-gray-400">{fazenda.semSubdivisao.length} lote(s)</span>
                                </td>
                                <td className="px-3 py-2.5 text-center text-[12px] font-bold text-gray-500">{fazenda.semSubdivisao.reduce((a, l) => a + l.totalAnimais, 0)}</td>
                                <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">—</td>
                                <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">—</td>
                                <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">—</td>
                                <td className="px-3 py-2.5" />
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
            <tr className="border-b border-gray-200" style={{ backgroundColor: GREEN }}>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-white uppercase tracking-wide">Subdivisão / Lote</th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-28">Total Animais</th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-28">Área (ha)</th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-32">Taxa Lotação</th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-32">Entrada no Pasto</th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-white uppercase tracking-wide w-48">Ações</th>
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
                  className="border-b border-gray-200 cursor-pointer select-none"
                  style={{ backgroundColor: "#f7f7f7" }}
                  onClick={onToggleSemSubdivisao}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400" style={{ display: "inline-block", transform: semSubdivisaoExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                      <span className="text-[13px] font-semibold text-gray-500 italic">Sem Subdivisão</span>
                      <span className="text-[10px] text-gray-400">{semSubdivisao.length} lote{semSubdivisao.length !== 1 ? "s" : ""}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center"><span className="text-[13px] font-bold text-gray-500">{semSubdivisao.reduce((a, l) => a + l.totalAnimais, 0)}</span></td>
                  <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                  <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                  <td className="px-3 py-3 text-center text-[12px] text-gray-400">—</td>
                  <td className="px-3 py-3" />
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
