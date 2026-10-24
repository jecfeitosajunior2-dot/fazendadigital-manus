import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import MobileCard from "@/components/MobileCard";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter, { type TablePageSize } from "@/components/TablePaginationFooter";
import { FD_PRIMARY, FormInput, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { formatDateBR, formatDateInputLocal } from "@/lib/date-utils";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { FINANCEIRO_CONTAS_V2_PATH, MSG_SEM_CONTA_V2_ATIVA, deveOrientarCadastroContaV2, type ContaFinanceiraV2Oficial } from "@/lib/contasFinanceirasV2";
import type { TituloV2DetalheOficial, TituloV2ListaBruta } from "@/lib/contasAPagarListagem";
import {
  FILTRO_ATIVOS,
  FILTRO_SEM_FAZENDA,
  FILTRO_TODOS,
  TEXTO_A_DEFINIR,
  clienteDaLinha,
  contasAReceberDetalhePath,
  contasAReceberListagemPath,
  filtrarLinhasContasAReceber,
  filtrosContasAReceberDaQuery,
  idsTitulosAReceber,
  linhaVencida,
  linhasDaListagemAReceber,
  nomeFazendaDaLinha,
  opcoesClienteContasAReceber,
  opcoesSituacaoContasAReceber,
  ordenarLinhasContasAReceber,
  paginarContasAReceber,
  periodoMesAnterior,
  periodoMesSeguinte,
  rotuloMesAno,
  rotuloParcela,
  rotuloSituacaoLinhaReceber,
  textoListagemOrigemVendaAnimais,
  vencimentoOuSaldoADefinir,
  type FiltrosContasAReceber,
  type LinhaContasAReceber,
  detalhesDoUsuarioAutenticado,
} from "@/lib/contasAReceberListagem";

const FILTER_EMPTY = "__all__";
const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 shrink-0 focus:outline-none focus:border-[#4ECDC4]";

const TABLE_COLUMNS = [
  { key: "cliente", label: "Cliente", align: "left" as const },
  { key: "descricao", label: "Descrição", align: "left" as const },
  { key: "fazenda", label: "Fazenda", align: "left" as const },
  { key: "parcela", label: "Parcela", align: "center" as const },
  { key: "vencimento", label: "Vencimento", align: "center" as const },
  { key: "valor", label: "Valor original", align: "right" as const },
  { key: "recebido", label: "Valor recebido", align: "right" as const },
  { key: "saldo", label: "Saldo a receber", align: "right" as const },
  { key: "situacao", label: "Situação", align: "center" as const },
];

function formatarValorOficial(valor: string | number | null | undefined): string {
  if (valor == null || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return formatCurrencyBrl(String(Math.round(n * 100)));
}

function classeSituacaoLinha(linha: LinhaContasAReceber): string {
  const texto = rotuloSituacaoLinhaReceber(linha);
  if (texto === "Cancelado") return "bg-gray-100 text-gray-500";
  if (texto === "Recebida" || texto === "Liquidado") return "bg-emerald-50 text-emerald-700";
  if (texto === "Vencido") return "bg-red-50 text-red-700";
  if (texto === "Parcial") return "bg-amber-50 text-amber-800";
  return "bg-sky-50 text-sky-800";
}

function formatarVencimentoLinha(vencimento: string | null): string {
  if (vencimentoOuSaldoADefinir(vencimento)) return TEXTO_A_DEFINIR;
  return formatDateBR(vencimento);
}

function formatarSaldoLinha(saldo: number | null): string {
  if (vencimentoOuSaldoADefinir(saldo)) return TEXTO_A_DEFINIR;
  return formatarValorOficial(saldo);
}

export default function ContasAReceberPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const utils = trpc.useUtils();
  const hojeISO = formatDateInputLocal();
  const [filtros, setFiltros] = useState(() => filtrosContasAReceberDaQuery(search, hojeISO));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [detalhes, setDetalhes] = useState<TituloV2DetalheOficial[] | null>(null);
  const [detalheErro, setDetalheErro] = useState<string | null>(null);
  const [detalheLoading, setDetalheLoading] = useState(false);
  const cargaSeq = useRef(0);

  const listQuery = trpc.financeiroV2.titulosList.useQuery();
  const contasV2 = trpc.financeiroV2.contasList.useQuery();
  const fazendasQuery = trpc.fazendas.list.useQuery();
  const fazendas = fazendasQuery.data ?? [];

  const carregarDetalhes = useCallback(async (titulos: TituloV2ListaBruta[]) => {
    const ordem = ++cargaSeq.current;
    const ids = idsTitulosAReceber(titulos);
    setDetalheLoading(true);
    setDetalheErro(null);
    try {
      if (ids.length === 0) {
        if (ordem === cargaSeq.current) setDetalhes([]);
        return;
      }
      const rows = await Promise.all(
        ids.map(id => utils.financeiroV2.titulosGet.fetch({ id })),
      );
      if (ordem !== cargaSeq.current) return;
      setDetalhes(rows as TituloV2DetalheOficial[]);
    } catch (erro) {
      if (ordem !== cargaSeq.current) return;
      setDetalhes(null);
      setDetalheErro(erro instanceof Error ? erro.message : "Não foi possível carregar as contas a receber.");
    } finally {
      if (ordem === cargaSeq.current) setDetalheLoading(false);
    }
  }, [utils]);

  useEffect(() => {
    if (!listQuery.data) return;
    void carregarDetalhes(listQuery.data);
  }, [listQuery.data, carregarDetalhes]);

  const atualizar = useCallback(async () => {
    const lista = await listQuery.refetch();
    if (lista.error) {
      toast.error("Não foi possível atualizar a listagem.");
      return;
    }
    if (lista.data) await carregarDetalhes(lista.data);
    toast.success("Listagem atualizada.");
  }, [carregarDetalhes, listQuery]);

  const { containerRef, state } = usePullToRefresh({
    onRefresh: atualizar,
    enabled: true,
  });

  useEffect(() => {
    const next = filtrosContasAReceberDaQuery(search, hojeISO);
    setFiltros(next);
    const raw = search.startsWith("?") ? search.slice(1) : search;
    if (!new URLSearchParams(raw).has("mes")) {
      setLocation(contasAReceberListagemPath(next), { replace: true });
    }
  }, [hojeISO, search, setLocation]);

  useEffect(() => {
    setPage(1);
  }, [filtros, pageSize]);

  const atualizarFiltro = (patch: Partial<FiltrosContasAReceber>) => {
    const next = { ...filtros, ...patch };
    setFiltros(next);
    setLocation(contasAReceberListagemPath(next), { replace: true });
  };

  const abrirDetalhe = (tituloId: number) => {
    setLocation(contasAReceberDetalhePath(tituloId, filtros));
  };

  const userId = user?.id;
  const linhas = useMemo(() => {
    if (!detalhes) return [];
    const doUsuario = typeof userId === "number"
      ? detalhesDoUsuarioAutenticado(detalhes, userId)
      : detalhes;
    return ordenarLinhasContasAReceber(
      filtrarLinhasContasAReceber(linhasDaListagemAReceber(doUsuario), filtros, hojeISO),
    );
  }, [detalhes, filtros, hojeISO, userId]);

  const linhasBase = useMemo(() => {
    if (!detalhes) return [];
    const doUsuario = typeof userId === "number"
      ? detalhesDoUsuarioAutenticado(detalhes, userId)
      : detalhes;
    return linhasDaListagemAReceber(doUsuario);
  }, [detalhes, userId]);

  const pageItems = paginarContasAReceber(linhas, page, pageSize);
  const loading = listQuery.isLoading || detalheLoading || (listQuery.isSuccess && detalhes === null && !detalheErro);
  const erro = listQuery.error?.message ?? detalheErro;
  const temFiltro = Boolean(
    filtros.fazendaId
    || (filtros.situacao && filtros.situacao !== FILTRO_ATIVOS)
    || filtros.fornecedorId
    || filtros.pesquisa.trim()
    || filtros.periodo.tipo !== "mes",
  );
  const orientarContaV2 = deveOrientarCadastroContaV2({
    carregando: contasV2.isLoading,
    erro: Boolean(contasV2.error),
    contas: contasV2.data as ContaFinanceiraV2Oficial[] | undefined,
  });

  return (
    <AppLayout>
      <PullToRefreshIndicator
        pullDistance={state.pullDistance}
        isRefreshing={state.isRefreshing}
      />
      <div
        ref={containerRef}
        className="overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 200px)" }}
      >
        <div className="bg-white rounded border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="text-[20px] font-semibold text-gray-900"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                Contas a Receber
              </h1>
              <p className="text-[12px] text-gray-500 mt-0.5">
                Somente consulta. O recebimento é registrado no detalhe do título.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLocation(FINANCEIRO_CONTAS_V2_PATH)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Contas do caixa
              </button>
              <button
                type="button"
                onClick={() => void atualizar()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="material-icons text-[16px]" style={{ color: FD_PRIMARY }}>refresh</span>
                Atualizar
              </button>
            </div>
          </div>

          {orientarContaV2 ? (
            <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/70 text-[13px] text-amber-900">
              <p>{MSG_SEM_CONTA_V2_ATIVA}</p>
              <button
                type="button"
                onClick={() => setLocation(FINANCEIRO_CONTAS_V2_PATH)}
                className="mt-1 text-[12px] font-semibold underline underline-offset-2"
                style={{ color: FD_PRIMARY }}
              >
                Cadastrar conta do caixa
              </button>
            </div>
          ) : null}

          <div className="px-4 py-3 border-b border-gray-50 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <span className="material-icons pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">
                  search
                </span>
                <FormInput
                  variant="light"
                  type="search"
                  value={filtros.pesquisa}
                  onChange={v => atualizarFiltro({ pesquisa: v })}
                  placeholder="Pesquisar descrição"
                  className={`${listControlClass} w-full pl-8`}
                />
              </div>
              <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => atualizarFiltro({ periodo: periodoMesAnterior(filtros.periodo, hojeISO) })}
                  className="h-9 w-9 inline-flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-l-lg"
                  aria-label="Mês anterior"
                >
                  <span className="material-icons text-[18px]">chevron_left</span>
                </button>
                <div className="min-w-[168px] px-2 text-center text-[12px] font-semibold text-gray-800">
                  {filtros.periodo.tipo === "mes"
                    ? rotuloMesAno(filtros.periodo.anoMes)
                    : filtros.periodo.tipo === "todas"
                      ? "Todas as datas"
                      : "Sem vencimento definido"}
                </div>
                <button
                  type="button"
                  onClick={() => atualizarFiltro({ periodo: periodoMesSeguinte(filtros.periodo, hojeISO) })}
                  className="h-9 w-9 inline-flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-r-lg"
                  aria-label="Próximo mês"
                >
                  <span className="material-icons text-[18px]">chevron_right</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => atualizarFiltro({ periodo: { tipo: "todas" } })}
                className={cn(
                  "h-9 px-3 rounded-lg border text-[12px] font-medium transition",
                  filtros.periodo.tipo === "todas"
                    ? "border-[#4ECDC4] bg-[#4ECDC414] text-gray-800"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                Todas as datas
              </button>
              <button
                type="button"
                onClick={() => atualizarFiltro({ periodo: { tipo: "sem_vencimento" } })}
                className={cn(
                  "h-9 px-3 rounded-lg border text-[12px] font-medium transition",
                  filtros.periodo.tipo === "sem_vencimento"
                    ? "border-[#4ECDC4] bg-[#4ECDC414] text-gray-800"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                Sem vencimento definido
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[180px] min-w-0">
                <FormSelect
                  variant="light"
                  value={filtros.fazendaId || FILTER_EMPTY}
                  onChange={v => atualizarFiltro({ fazendaId: v === FILTER_EMPTY ? FILTRO_TODOS : v })}
                  placeholder="Fazenda"
                  triggerClassName={listControlClass}
                >
                  <SelectItem value={FILTER_EMPTY} className="text-[12px]">Todas as fazendas</SelectItem>
                  <SelectItem value={FILTRO_SEM_FAZENDA} className="text-[12px]">Sem fazenda</SelectItem>
                  {fazendas.map(fazenda => (
                    <SelectItem key={fazenda.id} value={String(fazenda.id)} className="text-[12px]">
                      {fazenda.nome}
                    </SelectItem>
                  ))}
                </FormSelect>
              </div>
              <div className="w-[180px] min-w-0">
                <FormSelect
                  variant="light"
                  value={filtros.situacao || FILTRO_ATIVOS}
                  onChange={v => atualizarFiltro({ situacao: v || FILTRO_ATIVOS })}
                  placeholder="Situação"
                  triggerClassName={listControlClass}
                >
                  {opcoesSituacaoContasAReceber().map(opcao => (
                    <SelectItem key={opcao.value} value={opcao.value} className="text-[12px]">
                      {opcao.label}
                    </SelectItem>
                  ))}
                </FormSelect>
              </div>
              <div className="w-[180px] min-w-0">
                <FormSelect
                  variant="light"
                  value={filtros.fornecedorId || FILTER_EMPTY}
                  onChange={v => atualizarFiltro({ fornecedorId: v === FILTER_EMPTY ? FILTRO_TODOS : v })}
                  placeholder="Cliente"
                  triggerClassName={listControlClass}
                >
                  <SelectItem value={FILTER_EMPTY} className="text-[12px]">Todos os clientes</SelectItem>
                  {opcoesClienteContasAReceber(linhasBase).map(opcao => (
                    <SelectItem key={opcao.value} value={opcao.value} className="text-[12px]">
                      {opcao.label}
                    </SelectItem>
                  ))}
                </FormSelect>
              </div>
            </div>
          </div>

          {erro ? (
            <div className="px-4 py-16 text-center">
              <p className="text-[14px] font-medium text-gray-800">Não foi possível consultar as contas a receber.</p>
              <p className="text-[12px] text-gray-500 mt-2">{erro}</p>
              <button
                type="button"
                onClick={() => void atualizar()}
                className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-white text-[12px] font-semibold"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                Tentar de novo
              </button>
            </div>
          ) : (
            <>
              <div className="lg:hidden px-4 py-3 space-y-3">
                {loading ? (
                  <p className="py-10 text-center text-[13px] text-gray-400">Carregando contas a receber...</p>
                ) : pageItems.length === 0 ? (
                  <EmptyState temFiltro={temFiltro} periodo={filtros.periodo} />
                ) : (
                  <>
                    {pageItems.map(linha => {
                      const origemVenda = textoListagemOrigemVendaAnimais(linha.origemTipo, linha.origemId);
                      return (
                      <MobileCard
                        key={linha.key}
                        onClick={() => abrirDetalhe(linha.tituloId)}
                        title={clienteDaLinha(linha) || "Cliente não informado"}
                        subtitle={`${linha.descricao || "Sem descrição"} · ${rotuloParcela(linha)}`}
                        badge={
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacaoLinha(linha))}>
                            {rotuloSituacaoLinhaReceber(linha)}
                          </span>
                        }
                        fields={[
                          { label: "Fazenda", value: nomeFazendaDaLinha(linha.fazendaOrigemId, fazendas) },
                          ...(origemVenda ? [{ label: "Origem", value: origemVenda }] : []),
                          { label: "Vencimento", value: formatarVencimentoLinha(linha.vencimento) },
                          { label: "Valor original", value: formatarValorOficial(linha.valor), emphasis: true },
                          { label: "Valor recebido", value: formatarSaldoLinha(linha.principalLiquidado) },
                          { label: "Saldo a receber", value: formatarSaldoLinha(linha.saldoAberto), emphasis: true },
                        ]}
                      />
                      );
                    })}
                    <TablePaginationFooter
                      page={page}
                      pageSize={pageSize}
                      totalItems={linhas.length}
                      onPageChange={setPage}
                      onPageSizeChange={setPageSize}
                      itemLabel="vencimentos"
                    />
                  </>
                )}
              </div>

              <div className="hidden lg:block">
                <TableHorizontalScroll
                  fitWidth
                  footer={
                    !loading && !erro ? (
                      <TablePaginationFooter
                        page={page}
                        pageSize={pageSize}
                        totalItems={linhas.length}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="vencimentos"
                      />
                    ) : null
                  }
                >
                  <table className="w-full min-w-[1080px] table-fixed text-[11px] border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {TABLE_COLUMNS.map(col => (
                          <th
                            key={col.key}
                            className={cn(
                              "px-3 py-2.5 align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap",
                              col.align === "center" && "text-center",
                              col.align === "right" && "text-right",
                              col.align === "left" && "text-left",
                            )}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={TABLE_COLUMNS.length} className="px-4 py-10 text-center text-gray-400">
                            Carregando contas a receber...
                          </td>
                        </tr>
                      )}
                      {!loading && pageItems.length === 0 && (
                        <tr>
                          <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16">
                            <EmptyState temFiltro={temFiltro} periodo={filtros.periodo} />
                          </td>
                        </tr>
                      )}
                      {!loading && pageItems.map(linha => {
                        const vencida = linhaVencida(linha, hojeISO);
                        const origemVenda = textoListagemOrigemVendaAnimais(linha.origemTipo, linha.origemId);
                        return (
                          <tr
                            key={linha.key}
                            className="border-b border-gray-100 hover:bg-gray-50/60 cursor-pointer"
                            onClick={() => abrirDetalhe(linha.tituloId)}
                          >
                            <td className="px-3 py-2.5 text-gray-800 font-medium truncate">
                              {clienteDaLinha(linha) || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600">
                              <div className="truncate">{linha.descricao || "—"}</div>
                              {origemVenda ? (
                                <div className="text-[10px] text-gray-400 truncate">{origemVenda}</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 truncate">
                              {nomeFazendaDaLinha(linha.fazendaOrigemId, fazendas)}
                            </td>
                            <td className="px-3 py-2.5 text-center text-gray-600">{rotuloParcela(linha)}</td>
                            <td className={cn("px-3 py-2.5 text-center tabular-nums", vencida && "text-red-700 font-medium")}>
                              {formatarVencimentoLinha(linha.vencimento)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-800 tabular-nums">
                              {formatarValorOficial(linha.valor)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-800 tabular-nums">
                              {formatarSaldoLinha(linha.principalLiquidado)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-800 font-medium tabular-nums">
                              {formatarSaldoLinha(linha.saldoAberto)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacaoLinha(linha))}>
                                {rotuloSituacaoLinhaReceber(linha)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableHorizontalScroll>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function EmptyState({
  temFiltro,
  periodo,
}: {
  temFiltro: boolean;
  periodo: { tipo: "mes" | "todas" | "sem_vencimento"; anoMes?: string };
}) {
  const titulo = periodo.tipo === "sem_vencimento"
    ? "Nenhum título sem vencimento definido."
    : periodo.tipo === "mes"
      ? `Nenhuma conta a receber com vencimento em ${rotuloMesAno(periodo.anoMes ?? "")}.`
      : temFiltro
        ? "Nenhuma conta a receber com esses filtros."
        : "Nenhuma conta a receber encontrada.";
  return (
    <div className="max-w-md mx-auto text-center">
      <p className="text-[14px] font-medium text-gray-800">{titulo}</p>
      <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
        {temFiltro || periodo.tipo !== "todas"
          ? "Ajuste a pesquisa, o mês, a fazenda, a situação ou o cliente. Títulos sem parcela ficam em Sem vencimento definido ou Todas as datas."
          : "Quando um título a receber do Financeiro V2 for lançado, ele aparece aqui."}
      </p>
    </div>
  );
}
