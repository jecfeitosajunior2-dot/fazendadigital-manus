import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import MobileCard from "@/components/MobileCard";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter, { type TablePageSize } from "@/components/TablePaginationFooter";
import { FD_PRIMARY, FormInput, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { formatDateBR, formatDateInputLocal } from "@/lib/date-utils";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
  FINANCEIRO_ORIGEM_MANUTENCAO,
} from "@shared/financeiroNucleo";
import { FINANCEIRO_CONTAS_V2_PATH, MSG_SEM_CONTA_V2_ATIVA, deveOrientarCadastroContaV2, type ContaFinanceiraV2Oficial } from "@/lib/contasFinanceirasV2";
import {
  FILTRO_ATIVOS,
  FILTRO_SEM_FAZENDA,
  FILTRO_TODOS,
  TEXTO_A_DEFINIR,
  contasAPagarDetalhePath,
  contasAPagarListagemPath,
  detalhesDoUsuarioAutenticado,
  filtrarLinhasContasAPagar,
  filtrosContasAPagarDaQuery,
  idsTitulosAPagar,
  linhaVencida,
  linhasDaListagemAPagar,
  nomeFazendaDaLinha,
  opcoesFornecedorContasAPagar,
  opcoesOrigemContasAPagar,
  opcoesSituacaoContasAPagar,
  ordenarLinhasContasAPagar,
  paginarContasAPagar,
  periodoMesAnterior,
  periodoMesSeguinte,
  rotuloMesAno,
  rotuloOrigemTitulo,
  rotuloParcela,
  rotuloSituacaoLinha,
  tituloEstaCancelado,
  vencimentoOuSaldoADefinir,
  type FiltrosContasAPagar,
  type LinhaContasAPagar,
  type TituloV2DetalheOficial,
  type TituloV2ListaBruta,
} from "@/lib/contasAPagarListagem";
import {
  MSG_DESPESA_CADASTRADA,
  MSG_DESPESA_OCUPADA,
  MSG_DESPESA_SEM_CAIXA,
  aplicarModalidadeDespesa,
  aplicarQuantidadeDespesa,
  caminhoNovoFornecedorDespesa,
  fornecedoresAtivosDespesa,
  mensagemErroDespesaManual,
  novaChaveIdempotenciaTituloManual,
  rascunhoDespesaVazio,
  redistribuirParcelasDespesa,
  validarDespesaManual,
  type ErrosDespesaManual,
  type ModalidadeDespesaManual,
  type RascunhoDespesaManual,
} from "@/lib/contasAPagarDespesa";

const FILTER_EMPTY = "__all__";
const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 shrink-0 focus:outline-none focus:border-[#4ECDC4]";

const TABLE_COLUMNS = [
  { key: "fornecedor", label: "Fornecedor", align: "left" as const },
  { key: "origem", label: "Origem", align: "left" as const },
  { key: "fazenda", label: "Fazenda", align: "left" as const },
  { key: "parcela", label: "Parcela", align: "center" as const },
  { key: "vencimento", label: "Vencimento", align: "center" as const },
  { key: "valor", label: "Valor", align: "right" as const },
  { key: "saldo", label: "Saldo em aberto", align: "right" as const },
  { key: "situacao", label: "Situação", align: "center" as const },
];

function formatarValorOficial(valor: string | number | null | undefined): string {
  if (valor == null || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return formatCurrencyBrl(String(Math.round(n * 100)));
}

function classeSituacaoLinha(linha: LinhaContasAPagar): string {
  const texto = rotuloSituacaoLinha(linha);
  if (texto === "Cancelado") return "bg-gray-100 text-gray-500";
  if (texto === "Quitada" || texto === "Liquidado") return "bg-emerald-50 text-emerald-700";
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

function classeOrigem(origemTipo: string): string {
  if (origemTipo === FINANCEIRO_ORIGEM_COMPRA_INSUMOS) return "bg-amber-50 text-amber-800";
  if (origemTipo === FINANCEIRO_ORIGEM_MANUTENCAO) return "bg-orange-50 text-orange-800";
  return "bg-gray-100 text-gray-600";
}

export default function ContasAPagarPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const utils = trpc.useUtils();
  const hojeISO = formatDateInputLocal();
  const [filtros, setFiltros] = useState(() => filtrosContasAPagarDaQuery(search, hojeISO));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [detalhes, setDetalhes] = useState<TituloV2DetalheOficial[] | null>(null);
  const [detalheErro, setDetalheErro] = useState<string | null>(null);
  const [detalheLoading, setDetalheLoading] = useState(false);
  const [despesaAberta, setDespesaAberta] = useState(false);
  const [despesa, setDespesa] = useState<RascunhoDespesaManual>(() => rascunhoDespesaVazio(hojeISO));
  const [errosDespesa, setErrosDespesa] = useState<ErrosDespesaManual>({});
  const chaveDespesaRef = useRef(novaChaveIdempotenciaTituloManual());
  const cargaSeq = useRef(0);

  const listQuery = trpc.financeiroV2.titulosList.useQuery();
  const contasV2 = trpc.financeiroV2.contasList.useQuery();
  const fazendasQuery = trpc.fazendas.list.useQuery();
  const fazendas = fazendasQuery.data ?? [];
  const pessoasQuery = trpc.pessoas.list.useQuery({ tipo: "fornecedor" });
  const fornecedores = fornecedoresAtivosDespesa(pessoasQuery.data ?? []);
  const criarDespesa = trpc.financeiroV2.titulosCreateManual.useMutation({
    onSuccess: async resultado => {
      toast.success(MSG_DESPESA_CADASTRADA);
      chaveDespesaRef.current = novaChaveIdempotenciaTituloManual();
      setDespesaAberta(false);
      setDespesa(rascunhoDespesaVazio(hojeISO));
      setErrosDespesa({});
      await utils.financeiroV2.titulosList.invalidate();
      if (resultado.id) setLocation(contasAPagarDetalhePath(resultado.id, filtros));
    },
    onError: erro => toast.error(mensagemErroDespesaManual(erro.data?.code, erro.message)),
  });

  const carregarDetalhes = useCallback(async (titulos: TituloV2ListaBruta[]) => {
    const ordem = ++cargaSeq.current;
    const ids = idsTitulosAPagar(titulos);
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
      setDetalheErro(erro instanceof Error ? erro.message : "Não foi possível carregar as contas a pagar.");
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
    const next = filtrosContasAPagarDaQuery(search, hojeISO);
    setFiltros(next);
    const raw = search.startsWith("?") ? search.slice(1) : search;
    if (!new URLSearchParams(raw).has("mes")) {
      setLocation(contasAPagarListagemPath(next), { replace: true });
    }
  }, [hojeISO, search, setLocation]);

  useEffect(() => {
    setPage(1);
  }, [filtros, pageSize]);

  const atualizarFiltro = (patch: Partial<FiltrosContasAPagar>) => {
    const next = { ...filtros, ...patch };
    setFiltros(next);
    setLocation(contasAPagarListagemPath(next), { replace: true });
  };

  const abrirDetalhe = (tituloId: number) => {
    setLocation(contasAPagarDetalhePath(tituloId, filtros));
  };

  const enviarDespesa = () => {
    if (criarDespesa.isPending) {
      toast.error(MSG_DESPESA_OCUPADA);
      return;
    }
    const validado = validarDespesaManual({ rascunho: despesa, fornecedores, fazendas });
    if (!validado.ok) {
      setErrosDespesa(validado.erros);
      return;
    }
    setErrosDespesa({});
    criarDespesa.mutate({ ...validado.payload, idempotencyKey: chaveDespesaRef.current });
  };

  const userId = user?.id;
  const linhas = useMemo(() => {
    if (!detalhes) return [];
    const doUsuario = typeof userId === "number"
      ? detalhesDoUsuarioAutenticado(detalhes, userId)
      : detalhes;
    return ordenarLinhasContasAPagar(
      filtrarLinhasContasAPagar(linhasDaListagemAPagar(doUsuario), filtros, hojeISO),
    );
  }, [detalhes, filtros, hojeISO, userId]);

  const linhasBase = useMemo(() => {
    if (!detalhes) return [];
    const doUsuario = typeof userId === "number"
      ? detalhesDoUsuarioAutenticado(detalhes, userId)
      : detalhes;
    return linhasDaListagemAPagar(doUsuario);
  }, [detalhes, userId]);

  const pageItems = paginarContasAPagar(linhas, page, pageSize);
  const loading = listQuery.isLoading || detalheLoading || (listQuery.isSuccess && detalhes === null && !detalheErro);
  const erro = listQuery.error?.message ?? detalheErro;
  const temFiltro = Boolean(
    filtros.fazendaId
    || (filtros.situacao && filtros.situacao !== FILTRO_ATIVOS)
    || filtros.fornecedorId
    || filtros.origemTipo
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
                Contas a Pagar
              </h1>
              <p className="text-[12px] text-gray-500 mt-0.5">
                Despesas do Financeiro. O pagamento é feito no detalhe da conta.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  chaveDespesaRef.current = novaChaveIdempotenciaTituloManual();
                  setDespesa(rascunhoDespesaVazio(hojeISO));
                  setErrosDespesa({});
                  setDespesaAberta(true);
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-semibold text-white"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                <span className="material-icons text-[16px]">add</span>
                Nova despesa
              </button>
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
                  placeholder="Pesquisar"
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
              <div className="w-[160px] min-w-0">
                <FormSelect
                  variant="light"
                  value={filtros.situacao || FILTRO_ATIVOS}
                  onChange={v => atualizarFiltro({ situacao: v || FILTRO_ATIVOS })}
                  placeholder="Situação"
                  triggerClassName={listControlClass}
                >
                  {opcoesSituacaoContasAPagar().map(opcao => (
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
                  placeholder="Fornecedor"
                  triggerClassName={listControlClass}
                >
                  <SelectItem value={FILTER_EMPTY} className="text-[12px]">Todos os fornecedores</SelectItem>
                  {opcoesFornecedorContasAPagar(linhasBase).map(opcao => (
                    <SelectItem key={opcao.value} value={opcao.value} className="text-[12px]">
                      {opcao.label}
                    </SelectItem>
                  ))}
                </FormSelect>
              </div>
              <div className="w-[170px] min-w-0">
                <FormSelect
                  variant="light"
                  value={filtros.origemTipo || FILTER_EMPTY}
                  onChange={v => atualizarFiltro({ origemTipo: v === FILTER_EMPTY ? FILTRO_TODOS : v })}
                  placeholder="Origem"
                  triggerClassName={listControlClass}
                >
                  <SelectItem value={FILTER_EMPTY} className="text-[12px]">Todas as origens</SelectItem>
                  {opcoesOrigemContasAPagar(linhasBase).map(opcao => (
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
              <p className="text-[14px] font-medium text-gray-800">Não foi possível consultar as contas a pagar.</p>
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
                  <p className="py-10 text-center text-[13px] text-gray-400">Carregando contas a pagar...</p>
                ) : pageItems.length === 0 ? (
                  <EmptyState temFiltro={temFiltro} periodo={filtros.periodo} />
                ) : (
                  <>
                    {pageItems.map(linha => (
                      <MobileCard
                        key={linha.key}
                        onClick={() => abrirDetalhe(linha.tituloId)}
                        title={linha.fornecedor || "Fornecedor não informado"}
                        subtitle={`${rotuloOrigemTitulo(linha.origemTipo)} · ${rotuloParcela(linha)}`}
                        badge={
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacaoLinha(linha))}>
                            {rotuloSituacaoLinha(linha)}
                          </span>
                        }
                        fields={[
                          { label: "Fazenda", value: nomeFazendaDaLinha(linha.fazendaOrigemId, fazendas) },
                          { label: "Vencimento", value: formatarVencimentoLinha(linha.vencimento) },
                          { label: "Valor", value: formatarValorOficial(linha.valor), emphasis: true },
                          { label: "Saldo em aberto", value: formatarSaldoLinha(linha.saldoAberto), emphasis: true },
                        ]}
                      />
                    ))}
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
                  <table className="w-full min-w-[920px] table-fixed text-[11px] border-collapse">
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
                            Carregando contas a pagar...
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
                        return (
                          <tr
                            key={linha.key}
                            className="border-b border-gray-100 hover:bg-gray-50/60 cursor-pointer"
                            onClick={() => abrirDetalhe(linha.tituloId)}
                          >
                            <td className="px-3 py-2.5 text-gray-800 font-medium truncate">
                              {linha.fornecedor || "—"}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeOrigem(linha.origemTipo))}>
                                {rotuloOrigemTitulo(linha.origemTipo)}
                              </span>
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
                            <td className="px-3 py-2.5 text-right text-gray-800 font-medium tabular-nums">
                              {formatarSaldoLinha(linha.saldoAberto)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacaoLinha(linha))}>
                                {rotuloSituacaoLinha(linha)}
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

      <Dialog open={despesaAberta} onOpenChange={aberto => { if (!aberto && !criarDespesa.isPending) setDespesaAberta(false); }}>
        <DialogContent className="max-w-lg bg-white p-0 gap-0 max-h-[90vh] overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100">
            <DialogTitle className="text-[16px] font-semibold text-gray-900">Nova despesa</DialogTitle>
            <DialogDescription className="text-[12px] text-gray-500 mt-1">
              {MSG_DESPESA_SEM_CAIXA}
            </DialogDescription>
          </div>
          <form
            className="px-4 py-4 space-y-3"
            onSubmit={evento => {
              evento.preventDefault();
              enviarDespesa();
            }}
          >
            <Campo label="Fornecedor" erro={errosDespesa.pessoaId}>
              <FormSelect
                variant="light"
                modal={false}
                required
                value={despesa.pessoaId}
                invalid={Boolean(errosDespesa.pessoaId)}
                placeholder="Selecione"
                onChange={pessoaId => setDespesa(atual => ({ ...atual, pessoaId }))}
              >
                {fornecedores.map(pessoa => (
                  <SelectItem key={pessoa.id} value={String(pessoa.id)}>{pessoa.nome}</SelectItem>
                ))}
              </FormSelect>
            </Campo>
            <button
              type="button"
              className="text-[12px] font-semibold underline underline-offset-2"
              style={{ color: FD_PRIMARY }}
              onClick={() => setLocation(caminhoNovoFornecedorDespesa())}
            >
              Cadastrar fornecedor
            </button>
            <Campo label="Fazenda (opcional)" erro={errosDespesa.fazendaOrigemId}>
              <FormSelect
                variant="light"
                modal={false}
                value={despesa.fazendaOrigemId}
                invalid={Boolean(errosDespesa.fazendaOrigemId)}
                placeholder="Sem fazenda"
                onChange={fazendaOrigemId => setDespesa(atual => ({ ...atual, fazendaOrigemId }))}
              >
                {fazendas.map(fazenda => (
                  <SelectItem key={fazenda.id} value={String(fazenda.id)}>{fazenda.nome}</SelectItem>
                ))}
              </FormSelect>
            </Campo>
            <Campo label="Descrição" erro={errosDespesa.descricao}>
              <FormInput
                variant="light"
                required
                value={despesa.descricao}
                invalid={Boolean(errosDespesa.descricao)}
                onChange={descricao => setDespesa(atual => ({ ...atual, descricao }))}
              />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Valor total" erro={errosDespesa.valorOriginal}>
                <FormInput
                  variant="light"
                  required
                  inputMode="decimal"
                  value={despesa.valorOriginal}
                  invalid={Boolean(errosDespesa.valorOriginal)}
                  onChange={valorOriginal => setDespesa(atual => redistribuirParcelasDespesa({ ...atual, valorOriginal }))}
                />
              </Campo>
              <Campo label="Data de emissão" erro={errosDespesa.dataCompetencia}>
                <FormInput
                  variant="light"
                  required
                  type="date"
                  value={despesa.dataCompetencia}
                  invalid={Boolean(errosDespesa.dataCompetencia)}
                  onChange={dataCompetencia => setDespesa(atual => ({ ...atual, dataCompetencia }))}
                />
              </Campo>
            </div>
            <Campo label="Condição de pagamento">
              <FormSelect
                variant="light"
                modal={false}
                value={despesa.modalidade}
                onChange={modalidade => setDespesa(atual => aplicarModalidadeDespesa(atual, modalidade as ModalidadeDespesaManual))}
              >
                <SelectItem value="unico">Pagamento único</SelectItem>
                <SelectItem value="parcelado">Parcelado</SelectItem>
                <SelectItem value="a_definir">Definir vencimentos depois</SelectItem>
              </FormSelect>
            </Campo>
            {despesa.modalidade === "parcelado" ? (
              <Campo label="Quantidade de parcelas" erro={errosDespesa.quantidade}>
                <FormInput
                  variant="light"
                  inputMode="numeric"
                  value={String(despesa.quantidade || "")}
                  invalid={Boolean(errosDespesa.quantidade)}
                  onChange={quantidade => setDespesa(atual => aplicarQuantidadeDespesa(atual, Number(quantidade) || 2))}
                />
              </Campo>
            ) : null}
            {despesa.modalidade !== "a_definir" ? despesa.linhas.map(linha => (
              <div key={linha.numero} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo
                  label={despesa.modalidade === "unico" ? "Vencimento" : `Parcela ${linha.numero} — valor`}
                  erro={despesa.modalidade === "unico"
                    ? errosDespesa.linhas?.[linha.numero]?.vencimento
                    : errosDespesa.linhas?.[linha.numero]?.valor}
                >
                  {despesa.modalidade === "unico" ? (
                    <FormInput
                      variant="light"
                      type="date"
                      value={linha.vencimento}
                      invalid={Boolean(errosDespesa.linhas?.[linha.numero]?.vencimento)}
                      onChange={vencimento => setDespesa(atual => ({
                        ...atual,
                        linhas: atual.linhas.map(item => item.numero === linha.numero ? { ...item, vencimento } : item),
                      }))}
                    />
                  ) : (
                    <FormInput
                      variant="light"
                      inputMode="decimal"
                      value={linha.valor}
                      invalid={Boolean(errosDespesa.linhas?.[linha.numero]?.valor)}
                      onChange={valor => setDespesa(atual => ({
                        ...atual,
                        linhas: atual.linhas.map(item => item.numero === linha.numero ? { ...item, valor } : item),
                      }))}
                    />
                  )}
                </Campo>
                {despesa.modalidade === "unico" ? (
                  <Campo label="Valor da parcela" erro={errosDespesa.linhas?.[linha.numero]?.valor}>
                    <FormInput variant="light" readOnly value={linha.valor} />
                  </Campo>
                ) : (
                  <Campo label={`Vencimento ${linha.numero}`} erro={errosDespesa.linhas?.[linha.numero]?.vencimento}>
                    <FormInput
                      variant="light"
                      type="date"
                      value={linha.vencimento}
                      invalid={Boolean(errosDespesa.linhas?.[linha.numero]?.vencimento)}
                      onChange={vencimento => setDespesa(atual => ({
                        ...atual,
                        linhas: atual.linhas.map(item => item.numero === linha.numero ? { ...item, vencimento } : item),
                      }))}
                    />
                  </Campo>
                )}
              </div>
            )) : (
              <p className="text-[12px] text-gray-500">O vencimento pode ser definido depois, no detalhe. Enquanto isso, a despesa não aceita pagamento.</p>
            )}
            <Campo label="Observações (opcional)">
              <FormInput
                variant="light"
                value={despesa.observacoes}
                onChange={observacoes => setDespesa(atual => ({ ...atual, observacoes }))}
              />
            </Campo>
            {errosDespesa.geral ? <p className="text-[12px] text-red-600">{errosDespesa.geral}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-700"
                disabled={criarDespesa.isPending}
                onClick={() => setDespesaAberta(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={criarDespesa.isPending}
                className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {criarDespesa.isPending ? "Salvando..." : "Cadastrar despesa"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Campo({ label, erro, children }: { label: string; erro?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
      {erro ? <span className="block text-[11px] text-red-600 mt-1">{erro}</span> : null}
    </label>
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
      ? `Nenhuma conta a pagar com vencimento em ${rotuloMesAno(periodo.anoMes ?? "")}.`
      : temFiltro
        ? "Nenhuma conta a pagar com esses filtros."
        : "Nenhuma conta a pagar encontrada.";
  return (
    <div className="max-w-md mx-auto text-center">
      <p className="text-[14px] font-medium text-gray-800">{titulo}</p>
      <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
        {temFiltro || periodo.tipo !== "todas"
          ? "Ajuste a pesquisa, o mês, a fazenda, a situação, o fornecedor ou a origem. Títulos sem parcela ficam em Sem vencimento definido ou Todas as datas."
          : "Quando uma compra ou outra origem do Financeiro V2 gerar um título a pagar, ele aparece aqui."}
      </p>
    </div>
  );
}
