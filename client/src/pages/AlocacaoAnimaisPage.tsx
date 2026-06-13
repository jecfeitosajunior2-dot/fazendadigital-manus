/**
 * Alocação de Animais — cópia fiel do iRancho (Nova Movimentação no Mapa do Rebanho)
 * Rota: /rebanho/alocacao-animais
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FormLabel, FormDatePicker, FormNativeSelect } from "@/components/FormFields";
import SelecionarAnimaisAlocacaoDialog from "@/components/rebanho/SelecionarAnimaisAlocacaoDialog";
import type { AnimalAlocacaoRow } from "@/components/rebanho/alocacao-types";
import { formatDateBR } from "@/lib/date-utils";

const IRANCHO_BTN_GREEN = "#8ab83d";
const IRANCHO_PETROL = "#2D5A5A";
const IRANCHO_BTN_GREY = "#C0C0C0";

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function displaySexo(sexo: AnimalAlocacaoRow["sexo"]) {
  return sexo === "macho" ? "Macho" : "Fêmea";
}

export default function AlocacaoAnimaisPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const fazendaInicial = searchParams.get("fazendaId") || "";
  const pastoInicial = searchParams.get("pastoId") || "";

  const [selecionarOpen, setSelecionarOpen] = useState(false);
  const [animais, setAnimais] = useState<AnimalAlocacaoRow[]>([]);
  const [fazendaDestinoId, setFazendaDestinoId] = useState(fazendaInicial);
  const [pastoDestinoId, setPastoDestinoId] = useState(pastoInicial);
  const [loteDestinoId, setLoteDestinoId] = useState("");
  const [dataMovimentacao, setDataMovimentacao] = useState(hojeISO());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const utils = trpc.useUtils();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const fazendaNum = fazendaDestinoId ? Number(fazendaDestinoId) : 0;
  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: fazendaNum },
    { enabled: fazendaNum > 0 },
  );
  const pastoNum = pastoDestinoId ? Number(pastoDestinoId) : 0;
  const { data: lotesPasto = [] } = trpc.lotes.listByPasto.useQuery(
    { pastoId: pastoNum },
    { enabled: pastoNum > 0 },
  );

  const animalIds = useMemo(() => animais.map(a => a.id), [animais]);
  const { data: ultimasMov = {} } = trpc.lotes.ultimaMovimentacaoPorAnimais.useQuery(
    { animalIds },
    { enabled: animalIds.length > 0 },
  );

  const lotesAtivosPasto = useMemo(
    () => lotesPasto.filter(l => l.ativo !== false),
    [lotesPasto],
  );

  useEffect(() => {
    if (lotesAtivosPasto.length === 1) {
      setLoteDestinoId(String(lotesAtivosPasto[0].id));
    } else if (lotesAtivosPasto.length === 0) {
      setLoteDestinoId("");
    } else if (loteDestinoId && !lotesAtivosPasto.some(l => String(l.id) === loteDestinoId)) {
      setLoteDestinoId("");
    }
  }, [lotesAtivosPasto, loteDestinoId]);

  useEffect(() => {
    setPage(1);
  }, [animais.length, perPage]);

  const animaisExibidos = useMemo(
    () =>
      animais.map(a => ({
        ...a,
        ultimaMovimentacao: ultimasMov[a.id] ?? a.ultimaMovimentacao,
      })),
    [animais, ultimasMov],
  );

  const jaSelecionadosIds = useMemo(() => new Set(animais.map(a => a.id)), [animais]);

  const transferirMutation = trpc.lotes.transferirAnimaisAlocacao.useMutation({
    onSuccess: data => {
      toast.success(
        `${data.count} ${data.count === 1 ? "animal transferido" : "animais transferidos"} para o lote ${data.loteDestinoNome}.`,
      );
      utils.animais.list.invalidate();
      utils.lotes.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      utils.lotes.mapaRebanho.invalidate();
      setLocation("/rebanho/mapa-rebanho");
    },
    onError: e => toast.error(e.message),
  });

  const totalPages = Math.max(1, Math.ceil(animaisExibidos.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = animaisExibidos.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const inicio = animaisExibidos.length === 0 ? 0 : (pageSafe - 1) * perPage + 1;
  const fim = Math.min(pageSafe * perPage, animaisExibidos.length);

  const handleAdicionarAnimais = (novos: AnimalAlocacaoRow[]) => {
    setAnimais(prev => {
      const map = new Map(prev.map(a => [a.id, a]));
      for (const n of novos) map.set(n.id, n);
      return [...map.values()];
    });
  };

  const handleLimpar = () => {
    setAnimais([]);
    setFazendaDestinoId(fazendaInicial);
    setPastoDestinoId(pastoInicial);
    setLoteDestinoId("");
    setDataMovimentacao(hojeISO());
    setPage(1);
  };

  const handleTransferir = () => {
    if (animais.length === 0) {
      toast.error("Selecione ao menos um animal.");
      return;
    }
    if (!fazendaDestinoId) {
      toast.error("Selecione a fazenda de destino.");
      return;
    }
    if (!pastoDestinoId) {
      toast.error("Selecione a subdivisão de destino.");
      return;
    }
    if (!dataMovimentacao) {
      toast.error("Selecione a data de movimentação.");
      return;
    }
    if (lotesAtivosPasto.length === 0) {
      toast.error("Não há lotes ativos nesta subdivisão. Cadastre um lote antes de transferir.");
      return;
    }
    if (!loteDestinoId) {
      toast.error("Selecione o lote de destino.");
      return;
    }

    transferirMutation.mutate({
      animalIds: animais.map(a => a.id),
      loteDestinoId: Number(loteDestinoId),
      pastoDestinoId: Number(pastoDestinoId),
      fazendaDestinoId: Number(fazendaDestinoId),
      dataMovimentacao,
    });
  };

  const thClass =
    "px-3 py-2.5 text-[10px] font-semibold text-gray-600 uppercase tracking-wide text-center whitespace-nowrap border-r border-gray-200 last:border-r-0";

  const loteDestinoOptions = lotesAtivosPasto.map(l => ({
    value: String(l.id),
    label: l.nome,
  }));

  const mostrarLoteDestino = lotesAtivosPasto.length > 1;

  return (
    <AppLayout>
      <SelecionarAnimaisAlocacaoDialog
        open={selecionarOpen}
        onClose={() => setSelecionarOpen(false)}
        jaSelecionados={jaSelecionadosIds}
        onConfirm={handleAdicionarAnimais}
      />

      <div className="p-4 sm:p-6">
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
          {/* Cabeçalho */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
            <h1 className="text-[15px] font-semibold text-gray-900">Alocação de Animais</h1>
            <button
              type="button"
              onClick={() => setLocation("/rebanho/mapa-rebanho")}
              className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95 transition"
              style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 36 }}
            >
              Voltar
            </button>
          </div>

          <div className="px-5 py-4">
            <button
              type="button"
              onClick={() => setSelecionarOpen(true)}
              className="mb-4 px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 transition"
              style={{ backgroundColor: IRANCHO_PETROL, minHeight: 40 }}
            >
              Selecionar Animais
            </button>

            {/* Destino */}
            <div className={`grid grid-cols-1 gap-4 mb-4 ${mostrarLoteDestino ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}>
              <div>
                <FormLabel required>Fazenda Destino</FormLabel>
                <FormNativeSelect
                  value={fazendaDestinoId}
                  onChange={v => {
                    setFazendaDestinoId(v);
                    setPastoDestinoId("");
                    setLoteDestinoId("");
                  }}
                  placeholder="Selecione a fazenda"
                  required
                  options={fazendas.map(f => ({ value: String(f.id), label: f.nome }))}
                />
              </div>
              <div>
                <FormLabel required>Subdivisão Destino</FormLabel>
                <div>
                  <FormNativeSelect
                    value={pastoDestinoId}
                    onChange={v => {
                      setPastoDestinoId(v);
                      setLoteDestinoId("");
                    }}
                    placeholder="Selecione a subdivisão"
                    disabled={!fazendaDestinoId}
                    required
                    options={pastos.map(p => ({ value: String(p.id), label: p.nome }))}
                  />
                </div>
              </div>
              <div>
                <FormLabel required>Data de Movimentação</FormLabel>
                <FormDatePicker
                  value={dataMovimentacao}
                  onChange={setDataMovimentacao}
                  placeholder="Selecione a data de movimentação"
                  required
                />
              </div>
              {mostrarLoteDestino && (
                <div>
                  <FormLabel required>Lote Destino</FormLabel>
                  <FormNativeSelect
                    value={loteDestinoId}
                    onChange={setLoteDestinoId}
                    placeholder="Selecione o lote"
                    disabled={!pastoDestinoId}
                    required
                    options={loteDestinoOptions}
                  />
                </div>
              )}
            </div>

            {/* Tabela */}
            <div className="border border-gray-200 rounded-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] min-w-[780px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className={thClass}>Brinco</th>
                      <th className={thClass}>Nº RFID</th>
                      <th className={thClass}>Lote</th>
                      <th className={thClass}>Sexo</th>
                      <th className={thClass}>Fazenda - Subdivisão</th>
                      <th className={`${thClass} border-r-0`}>Última Movimentação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-gray-400">
                          Sem dados
                        </td>
                      </tr>
                    ) : (
                      paginated.map((animal, idx) => (
                        <tr
                          key={animal.id}
                          className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}
                        >
                          <td className="px-3 py-2 text-center text-gray-700 border-r border-gray-100">{animal.numeroVisual}</td>
                          <td className="px-3 py-2 text-center text-gray-600 border-r border-gray-100">{animal.numeroRfid}</td>
                          <td className="px-3 py-2 text-center text-gray-600 border-r border-gray-100">{animal.loteNome}</td>
                          <td className="px-3 py-2 text-center text-gray-600 border-r border-gray-100">{displaySexo(animal.sexo)}</td>
                          <td className="px-3 py-2 text-center text-gray-600 border-r border-gray-100">{animal.fazendaSubdivisao}</td>
                          <td className="px-3 py-2 text-gray-600">
                            <span className="block text-center">{animal.ultimaMovimentacao ? formatDateBR(animal.ultimaMovimentacao) : "—"}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
                <select
                  value={perPage}
                  onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                  className="h-8 px-2 border border-gray-200 rounded-sm bg-white text-[11px] text-gray-700 focus:outline-none focus:border-[#2D5A5A]"
                >
                  <option value={10}>10 itens por página</option>
                  <option value={25}>25 itens por página</option>
                  <option value={50}>50 itens por página</option>
                  <option value={100}>100 itens por página</option>
                </select>
                <div className="flex items-center gap-3">
                  <span>
                    Mostrando {animaisExibidos.length === 0 ? 0 : inicio}–{animaisExibidos.length === 0 ? 0 : fim} de {animaisExibidos.length} itens
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={pageSafe <= 1}
                      onClick={() => setPage(p => p - 1)}
                      className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    >
                      <span className="material-icons text-[16px]">chevron_left</span>
                    </button>
                    <span
                      className="w-7 h-7 flex items-center justify-center rounded text-white text-[11px] font-semibold"
                      style={{ backgroundColor: IRANCHO_PETROL }}
                    >
                      {pageSafe}
                    </span>
                    <button
                      type="button"
                      disabled={pageSafe >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                      className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    >
                      <span className="material-icons text-[16px]">chevron_right</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={handleLimpar}
                disabled={transferirMutation.isPending}
                className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95 disabled:opacity-50 transition"
                style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={handleTransferir}
                disabled={transferirMutation.isPending}
                className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 disabled:opacity-50 transition"
                style={{ backgroundColor: IRANCHO_PETROL, minHeight: 40 }}
              >
                {transferirMutation.isPending ? "Transferindo..." : "Transferir Animais"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
