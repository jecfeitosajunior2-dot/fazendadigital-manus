import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import {
  UNIDADES_OPCOES,
  TIPOS_MOVIMENTACAO,
  sinalDoTipo,
  normalizarUnidade,
  nomeUnidadeExibicao,
  formatDataBr,
  toDateInput,
} from "@/lib/produto-types";

// ─── Estilos compartilhados ─────────────────────────────────────────────────
const inputCls =
  "w-full border border-gray-300 rounded px-3 py-2 text-[13px] text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:border-[#4ECDC4] focus:ring-1 focus:ring-[#4ECDC4]";
const selectCls =
  "w-full border border-gray-300 rounded px-3 py-2 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-[#4ECDC4] focus:ring-1 focus:ring-[#4ECDC4] appearance-none";
const labelCls = "block text-[12px] font-medium text-gray-600 mb-1";
const sectionTitleCls =
  "text-[12px] font-semibold text-gray-600 uppercase tracking-wide";

const fmtMoeda = (v: string) => {
  if (!v) return "R$ 0,00";
  const n = parseFloat(v.replace(",", "."));
  if (isNaN(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ─── Tipo local de produto adicionado ───────────────────────────────────────
type ProdutoLinha = {
  localId: string;
  estoqueId: string;
  unidadeMov: string;
  dataValidade: string;
  valorUnitario: string;
  quantidade: string;
};

// ─── Componente ─────────────────────────────────────────────────────────────
export default function InsumosNovaMovimentacaoPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const movId = searchParams.get("id") ? parseInt(searchParams.get("id")!, 10) : null;
  const isEdit = movId != null && !isNaN(movId);

  // Campos globais da movimentação
  const [direcao, setDirecao] = useState("Entrada");
  const [tipoMov, setTipoMov] = useState("Compra");
  const [fazendaId, setFazendaId] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [dataEntrada, setDataEntrada] = useState(() => new Date().toISOString().slice(0, 10));
  const [frete, setFrete] = useState("");

  // Mini-formulário de produto (linha sendo adicionada)
  const [prodEstoqueId, setProdEstoqueId] = useState("");
  const [prodUnidade, setProdUnidade] = useState("");
  const [prodDataValidade, setProdDataValidade] = useState("");
  const [prodValorUnitario, setProdValorUnitario] = useState("");
  const [prodQuantidade, setProdQuantidade] = useState("");

  // Lista de produtos da movimentação
  const [produtos, setProdutos] = useState<ProdutoLinha[]>([]);

  // Inicialização no modo edição
  const [initialized, setInitialized] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: estoqueList = [] } = trpc.estoque.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: movimentacao, isLoading: loadingMov } = trpc.estoque.getMovimentacao.useQuery(
    { id: movId! },
    { enabled: isEdit }
  );

  const utils = trpc.useUtils();

  // ── Derived ───────────────────────────────────────────────────────────────
  const tiposFiltrados = useMemo(() => {
    if (direcao === "Entrada") return TIPOS_MOVIMENTACAO.filter(t => t.sinal === "entrada");
    return TIPOS_MOVIMENTACAO.filter(t => t.sinal === "saida");
  }, [direcao]);

  // ── Inicializar edição ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !movimentacao || initialized) return;

    const sinal = sinalDoTipo(movimentacao.tipo ?? undefined);
    setDirecao(sinal === "entrada" ? "Entrada" : "Saída");
    setTipoMov(movimentacao.tipo ?? "");
    if (movimentacao.fazendaId) setFazendaId(String(movimentacao.fazendaId));
    setFornecedor(movimentacao.fornecedor ?? "");
    setNotaFiscal(movimentacao.notaFiscal ?? "");
    setDataEntrada(toDateInput(movimentacao.dataMovimentacao));
    setFrete(movimentacao.frete != null ? String(movimentacao.frete) : "");

    // Produto como linha única
    setProdutos([{
      localId: "edit-0",
      estoqueId: String(movimentacao.estoqueId),
      unidadeMov: normalizarUnidade(movimentacao.unidade),
      dataValidade: toDateInput(movimentacao.dataValidade),
      valorUnitario: movimentacao.valor != null ? String(movimentacao.valor) : "",
      quantidade: String(Math.abs(Number(movimentacao.quantidade))),
    }]);

    setInitialized(true);
  }, [isEdit, movimentacao, initialized]);

  // ── Auto-preencher unidade ao selecionar produto ──────────────────────────
  const onProdutoChange = (id: string) => {
    setProdEstoqueId(id);
    const prod = estoqueList.find(p => String(p.id) === id);
    if (prod) setProdUnidade(normalizarUnidade(prod.unidade));
    else setProdUnidade("");
  };

  // ── Ao mudar direção, reajustar tipo se necessário ────────────────────────
  const onDirecaoChange = (dir: string) => {
    setDirecao(dir);
    const tipos = dir === "Entrada"
      ? TIPOS_MOVIMENTACAO.filter(t => t.sinal === "entrada")
      : TIPOS_MOVIMENTACAO.filter(t => t.sinal === "saida");
    if (!tipos.find(t => t.value === tipoMov)) {
      setTipoMov(tipos[0]?.value ?? "");
    }
  };

  // ── Adicionar produto à lista ─────────────────────────────────────────────
  const adicionarProduto = () => {
    if (!prodEstoqueId) { toast.error("Selecione o produto."); return; }
    if (!prodQuantidade) { toast.error("Informe a quantidade."); return; }
    if (!prodUnidade) { toast.error("Selecione a unidade de movimentação."); return; }
    setProdutos(prev => [
      ...prev,
      {
        localId: String(Date.now()),
        estoqueId: prodEstoqueId,
        unidadeMov: prodUnidade,
        dataValidade: prodDataValidade,
        valorUnitario: prodValorUnitario,
        quantidade: prodQuantidade,
      },
    ]);
    setProdEstoqueId("");
    setProdUnidade("");
    setProdDataValidade("");
    setProdValorUnitario("");
    setProdQuantidade("");
  };

  const removerProduto = (localId: string) =>
    setProdutos(prev => prev.filter(p => p.localId !== localId));

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = trpc.estoque.createMovimentacao.useMutation({
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.estoque.updateMovimentacao.useMutation({
    onSuccess: () => {
      toast.success("Movimentação atualizada!");
      utils.estoque.listMovimentacoes.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.resumo.invalidate();
      setLocation("/insumos/visao-geral");
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  // ── Salvar ────────────────────────────────────────────────────────────────
  const salvar = async () => {
    if (!tipoMov) { toast.error("Selecione o tipo de movimentação."); return; }
    if (produtos.length === 0) { toast.error("Adicione ao menos um produto."); return; }

    const sinal = sinalDoTipo(tipoMov);

    if (isEdit && movId && produtos[0]) {
      const p = produtos[0];
      const qtd = parseFloat(p.quantidade.replace(",", "."));
      if (isNaN(qtd) || qtd === 0) { toast.error("Quantidade inválida."); return; }
      const qtdFinal = sinal === "saida" ? -Math.abs(qtd) : Math.abs(qtd);
      updateMutation.mutate({
        id: movId,
        estoqueId: Number(p.estoqueId),
        fazendaId: fazendaId ? Number(fazendaId) : undefined,
        tipo: tipoMov,
        dataMovimentacao: dataEntrada,
        quantidade: String(qtdFinal),
        dataValidade: p.dataValidade || undefined,
        fornecedor: fornecedor.trim() || undefined,
        notaFiscal: notaFiscal.trim() || undefined,
        frete: frete.trim() ? frete.replace(",", ".") : undefined,
        valor: p.valorUnitario.trim() ? p.valorUnitario.replace(",", ".") : undefined,
        modo: "direto",
        sinal,
        unidadeLancamento: p.unidadeMov || undefined,
      });
      return;
    }

    try {
      for (const p of produtos) {
        const qtd = parseFloat(p.quantidade.replace(",", "."));
        if (isNaN(qtd) || qtd === 0) { toast.error("Quantidade inválida em um dos produtos."); return; }
        const qtdFinal = sinal === "saida" ? -Math.abs(qtd) : Math.abs(qtd);
        const vu = p.valorUnitario ? parseFloat(p.valorUnitario.replace(",", ".")) : undefined;
        const valorTotal =
          vu != null && !isNaN(vu) ? String(vu * Math.abs(qtd)) : undefined;

        await createMutation.mutateAsync({
          estoqueId: Number(p.estoqueId),
          fazendaId: fazendaId ? Number(fazendaId) : undefined,
          tipo: tipoMov,
          dataMovimentacao: dataEntrada,
          quantidade: String(qtdFinal),
          dataValidade: p.dataValidade || undefined,
          unidadeLancamento: p.unidadeMov || undefined,
          fornecedor: fornecedor.trim() || undefined,
          notaFiscal: notaFiscal.trim() || undefined,
          frete: frete.trim() ? frete.replace(",", ".") : undefined,
          valor: valorTotal,
          modo: "direto",
          sinal,
        });
      }
      toast.success(
        produtos.length > 1
          ? `${produtos.length} movimentações registradas!`
          : "Movimentação registrada!"
      );
      utils.estoque.listMovimentacoes.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.resumo.invalidate();
      setLocation("/insumos/visao-geral");
    } catch (_) {}
  };

  // ── Loading state para edição ─────────────────────────────────────────────
  if (isEdit && (loadingMov || !initialized)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          Carregando...
        </div>
      </AppLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      {/* Overlay escuro */}
      <div className="fixed inset-0 bg-black/40 z-[60]" />

      {/* Modal scrollável */}
      <div className="fixed inset-0 z-[70] overflow-y-auto flex items-start justify-center py-8 px-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl">

          {/* ── Cabeçalho ── */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-[18px] font-semibold text-gray-900">
              {isEdit ? "Editar Movimentação" : "Nova Movimentação"}
            </h2>
          </div>

          <div className="px-6 py-5 space-y-5">

            {/* ── Movimentação + Tipo ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  Movimentação <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={direcao}
                    onChange={e => onDirecaoChange(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Selecione uma movimentação</option>
                    <option value="Entrada">Entrada</option>
                    <option value="Saída">Saída</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 material-icons text-gray-400 text-[18px]">
                    expand_more
                  </span>
                </div>
              </div>
              <div>
                <label className={labelCls}>
                  Tipo de Movimentação <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={tipoMov}
                    onChange={e => setTipoMov(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Selecione um tipo de movimentação</option>
                    {tiposFiltrados.map(t => (
                      <option key={t.value} value={t.value}>
                        {t.value}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 material-icons text-gray-400 text-[18px]">
                    expand_more
                  </span>
                </div>
              </div>
            </div>

            {/* ── Estoque Destino ── */}
            <div>
              <label className={labelCls}>
                Estoque Destino{" "}
                <span className="text-red-500 text-[11px]">**</span>
              </label>
              <div className="relative">
                <select
                  value={fazendaId}
                  onChange={e => setFazendaId(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Selecione um estoque</option>
                  {fazendas.map(f => (
                    <option key={f.id} value={String(f.id)}>
                      {f.nome}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 material-icons text-gray-400 text-[18px]">
                  expand_more
                </span>
              </div>
            </div>

            {/* ── Botão Brinco SISBOV ── */}
            <button
              type="button"
              className="w-full py-2.5 border border-gray-300 rounded text-[11px] font-semibold uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors"
            >
              ENTRADA DE BRINCO SISBOV
            </button>

            {/* ── Dados Nota Fiscal ── */}
            <div>
              <p className={sectionTitleCls + " mb-3"}>Dados Nota Fiscal</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    Fornecedor <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={fornecedor}
                    onChange={e => setFornecedor(e.target.value)}
                    placeholder="Selecione um fornecedor"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Número da NF</label>
                  <input
                    value={notaFiscal}
                    onChange={e => setNotaFiscal(e.target.value)}
                    placeholder="Ex. 323.567"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    Data de Entrada <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={dataEntrada}
                      onChange={e => setDataEntrada(e.target.value)}
                      className={inputCls + " pr-9"}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 material-icons text-gray-400 text-[18px]">
                      calendar_today
                    </span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Frete</label>
                  <input
                    value={frete}
                    onChange={e => setFrete(e.target.value)}
                    placeholder="R$ 0,00"
                    inputMode="decimal"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>

            {/* ── Produtos ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className={sectionTitleCls}>Produtos</p>
                <button
                  type="button"
                  onClick={adicionarProduto}
                  className="px-4 py-1.5 rounded border border-gray-400 text-[11px] font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  ADICIONAR PRODUTO
                </button>
              </div>

              {/* Mini-formulário de produto */}
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>
                      Produto <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={prodEstoqueId}
                        onChange={e => onProdutoChange(e.target.value)}
                        className={selectCls}
                      >
                        <option value="">Selecione o produto</option>
                        {estoqueList.map(p => (
                          <option key={p.id} value={String(p.id)}>
                            {p.nome}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 material-icons text-gray-400 text-[18px]">
                        expand_more
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Unidade Movimentação <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={prodUnidade}
                        onChange={e => setProdUnidade(e.target.value)}
                        className={selectCls}
                      >
                        <option value="">Selecione a unidade</option>
                        {UNIDADES_OPCOES.map(u => (
                          <option key={u.sigla} value={u.sigla}>
                            {u.legenda.charAt(0).toUpperCase() + u.legenda.slice(1)}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 material-icons text-gray-400 text-[18px]">
                        expand_more
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Data de Validade</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={prodDataValidade}
                        onChange={e => setProdDataValidade(e.target.value)}
                        className={inputCls + " pr-9"}
                        placeholder="Selecione a data"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 material-icons text-gray-400 text-[18px]">
                        calendar_today
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Valor Unitário <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={prodValorUnitario}
                      onChange={e => setProdValorUnitario(e.target.value)}
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      Quantidade <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={prodQuantidade}
                      onChange={e => setProdQuantidade(e.target.value)}
                      placeholder="Quantidade de produtos"
                      inputMode="decimal"
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              {/* Tabela de produtos adicionados */}
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {[
                        "PRODUTO",
                        "QTD",
                        "UNIDADE",
                        "VALIDADE",
                        "VALOR UN.",
                      ].map(h => (
                        <th
                          key={h}
                          className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-8 text-center text-[12px] text-gray-400"
                        >
                          Sem dados
                        </td>
                      </tr>
                    ) : (
                      produtos.map(p => {
                        const prod = estoqueList.find(
                          e => String(e.id) === p.estoqueId
                        );
                        return (
                          <tr
                            key={p.localId}
                            className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50"
                          >
                            <td className="px-3 py-2.5 font-medium text-gray-900 uppercase whitespace-nowrap">
                              {prod?.nome ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700 tabular-nums">
                              {p.quantidade}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700">
                              {nomeUnidadeExibicao(p.unidadeMov)}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                              {p.dataValidade ? formatDataBr(p.dataValidade) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700 tabular-nums">
                              {fmtMoeda(p.valorUnitario)}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => removerProduto(p.localId)}
                                className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                title="Remover"
                              >
                                <span className="material-icons text-[16px]">close</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── Rodapé ── */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setLocation("/insumos/visao-geral")}
              className="px-6 py-2 rounded border border-gray-300 text-[12px] font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50 transition-colors"
            >
              CANCELAR
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={isBusy}
              className="px-6 py-2 rounded text-[12px] font-semibold uppercase tracking-wide text-white disabled:opacity-60 transition-colors"
              style={{ backgroundColor: "#6B8E23" }}
            >
              {isBusy ? "Salvando..." : "SALVAR"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
