import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormSelect,
  FormDatePicker,
} from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import {
  UNIDADES_OPCOES,
  TIPOS_MOVIMENTACAO,
  sinalDoTipo,
  calcularQuantidadeMovimentacao,
  formatTotalMovimentacao,
  normalizarUnidade,
  nomeUnidadeExibicao,
  parseEmbalagens,
  parseObsMovimentacao,
  rotuloUnidade,
  toDateInput,
  type ModoQuantidadeMov,
} from "@/lib/produto-types";

export default function InsumosNovaMovimentacaoPage() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const movId = searchParams.get("id") ? parseInt(searchParams.get("id")!, 10) : null;
  const isEdit = movId != null && !isNaN(movId);

  const [estoqueId, setEstoqueId] = useState("");
  const [tipoMov, setTipoMov] = useState("Compra");
  const [fazendaId, setFazendaId] = useState("");
  const [dataMov, setDataMov] = useState(() => new Date().toISOString().slice(0, 10));
  const [dataValidade, setDataValidade] = useState("");
  const [modo, setModo] = useState<ModoQuantidadeMov>("unidades");
  const [quantidadeDireta, setQuantidadeDireta] = useState("");
  const [quantidadeUnidades, setQuantidadeUnidades] = useState("");
  const [quantidadePorUnidade, setQuantidadePorUnidade] = useState("");
  const [unidadeLancamento, setUnidadeLancamento] = useState("");
  const [embalagemNome, setEmbalagemNome] = useState("");
  const [destino, setDestino] = useState("");
  const [manejo, setManejo] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [frete, setFrete] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [initialized, setInitialized] = useState(false);

  const sinal = sinalDoTipo(tipoMov);

  const utils = trpc.useUtils();
  const { data: produtos = [] } = trpc.estoque.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: movimentacao, isLoading: loadingMov } = trpc.estoque.getMovimentacao.useQuery(
    { id: movId! },
    { enabled: isEdit }
  );

  const produto = useMemo(
    () => produtos.find(p => String(p.id) === estoqueId),
    [produtos, estoqueId]
  );

  /** Nome/unidade: lista de produtos ou dados da movimentação (edição). */
  const produtoNome = produto?.nome ?? movimentacao?.nome ?? "";
  const produtoCategoria = produto?.categoria ?? movimentacao?.categoria ?? "";
  const produtoFabricante = produto?.fabricante ?? movimentacao?.fabricante ?? "";
  const unidadeBase = normalizarUnidade(produto?.unidade ?? movimentacao?.unidade);

  const embalagens = useMemo(() => {
    const raw = produto?.embalagens ?? movimentacao?.embalagens;
    return raw ? parseEmbalagens(raw) : [];
  }, [produto, movimentacao]);

  useEffect(() => {
    if (!isEdit || !movimentacao || initialized) return;

    const obs = parseObsMovimentacao(movimentacao.observacoes ?? undefined);
    const qty = Number(movimentacao.quantidade);

    setEstoqueId(String(movimentacao.estoqueId));
    setDataMov(toDateInput(movimentacao.dataMovimentacao));
    setDataValidade(toDateInput(movimentacao.dataValidade));

    const fazendaSalva = movimentacao.fazendaId ?? movimentacao.produtoFazendaId;
    if (fazendaSalva) setFazendaId(String(fazendaSalva));

    if (movimentacao.tipo) {
      setTipoMov(movimentacao.tipo);
    } else {
      setTipoMov(qty >= 0 ? "Compra" : "Consumo interno");
    }

    setDestino(movimentacao.destino ?? "");
    setManejo(movimentacao.manejo ?? "");
    setNotaFiscal(movimentacao.notaFiscal ?? "");
    setFrete(movimentacao.frete != null ? String(movimentacao.frete) : "");
    setFornecedor(movimentacao.fornecedor ?? "");
    setValor(movimentacao.valor != null ? String(movimentacao.valor) : "");

    if (obs?.modo === "unidades") {
      setModo("unidades");
      setQuantidadeUnidades(obs.unidades ?? "");
      setQuantidadePorUnidade(obs.porUnidade ?? "");
      setUnidadeLancamento(
        normalizarUnidade(obs.unidade) || normalizarUnidade(movimentacao.unidade)
      );
    } else {
      setModo("direto");
      setQuantidadeDireta(String(Math.abs(qty)));
      setUnidadeLancamento(normalizarUnidade(movimentacao.unidade));
    }
    setInitialized(true);
  }, [isEdit, movimentacao, initialized]);

  useEffect(() => {
    if (isEdit) return;
    if (!produto) {
      setEmbalagemNome("");
      setUnidadeLancamento("");
      return;
    }
    if (produto.fazendaId) setFazendaId(String(produto.fazendaId));
    const base = normalizarUnidade(produto.unidade);
    setUnidadeLancamento(base);
    const emb = parseEmbalagens(produto.embalagens);
    if (emb.length === 1) {
      setEmbalagemNome(emb[0].nome);
      setQuantidadePorUnidade(emb[0].volume ? String(emb[0].volume) : "");
      setUnidadeLancamento(normalizarUnidade(emb[0].unidade) || base);
    } else {
      setEmbalagemNome("");
    }
  }, [produto?.id]);

  const onEmbalagemChange = (nome: string) => {
    setEmbalagemNome(nome);
    const emb = embalagens.find(e => e.nome === nome);
    if (emb?.volume) setQuantidadePorUnidade(String(emb.volume));
    if (emb?.unidade) setUnidadeLancamento(normalizarUnidade(emb.unidade));
    else if (unidadeBase) setUnidadeLancamento(unidadeBase);
  };

  const calculo = useMemo(
    () =>
      calcularQuantidadeMovimentacao({
        modo,
        sinal,
        quantidadeDireta,
        quantidadeUnidades,
        quantidadePorUnidade,
        unidadeLancamento,
        unidadeBaseProduto: unidadeBase,
      }),
    [
      modo,
      sinal,
      quantidadeDireta,
      quantidadeUnidades,
      quantidadePorUnidade,
      unidadeLancamento,
      unidadeBase,
    ]
  );

  const createMutation = trpc.estoque.createMovimentacao.useMutation({
    onSuccess: () => {
      toast.success("Movimentação registrada!");
      utils.estoque.listMovimentacoes.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.resumo.invalidate();
      setLocation("/insumos/visao-geral");
    },
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

  const payload = () => ({
    estoqueId: Number(estoqueId),
    fazendaId: fazendaId ? Number(fazendaId) : undefined,
    tipo: tipoMov,
    dataMovimentacao: dataMov,
    quantidade: String(calculo.total),
    dataValidade: dataValidade || undefined,
    destino: destino.trim() || undefined,
    manejo: manejo.trim() || undefined,
    notaFiscal: notaFiscal.trim() || undefined,
    frete: frete.trim() ? frete.replace(",", ".") : undefined,
    fornecedor: fornecedor.trim() || undefined,
    valor: valor.trim() ? valor.replace(",", ".") : undefined,
    modo,
    quantidadeUnidades: modo === "unidades" ? quantidadeUnidades : undefined,
    quantidadePorUnidade: modo === "unidades" ? quantidadePorUnidade : undefined,
    unidadeLancamento: modo === "unidades" ? unidadeLancamento : unidadeBase || undefined,
    sinal,
  });

  const resumoUnidades =
    modo === "unidades" && quantidadeUnidades && quantidadePorUnidade
      ? `${quantidadeUnidades} un × ${quantidadePorUnidade} ${rotuloUnidade(unidadeLancamento)}`
      : null;

  if (isEdit && (loadingMov || !movimentacao || !initialized)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  if (isEdit && !loadingMov && !movimentacao) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-3">
          <p>Movimentação não encontrada.</p>
          <button
            type="button"
            onClick={() => setLocation("/insumos/visao-geral")}
            className="text-[12px] text-[#4ECDC4] hover:underline"
          >
            Voltar
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setLocation("/insumos/visao-geral")}
          className="flex items-center gap-1 text-[12px] text-gray-600 hover:text-gray-900"
        >
          <span className="material-icons text-[18px]">arrow_back</span>
          Voltar
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded shadow-sm max-w-3xl">
        <div className="px-5 py-4 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {isEdit ? "Editar Movimentação" : "Nova Movimentação"}
          </h1>
        </div>

        {isEdit && movimentacao && (
          <div
            className="mx-5 mt-4 mb-1 px-4 py-3 rounded border text-[12px] space-y-2"
            style={{ borderColor: FD_PRIMARY, backgroundColor: `${FD_PRIMARY}12` }}
          >
            <p className="text-[11px] font-semibold uppercase text-gray-500 tracking-wide">Produto da movimentação</p>
            <p className="text-[15px] font-semibold text-gray-900 uppercase">{produtoNome}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-700">
              {produtoCategoria && <span><span className="font-medium">Categoria:</span> {produtoCategoria}</span>}
              {produtoFabricante && <span><span className="font-medium">Fabricante:</span> {produtoFabricante}</span>}
            </div>
            {unidadeBase && (
              <div
                className="mt-1 px-3 py-2 rounded border bg-white/80"
                style={{ borderColor: FD_PRIMARY }}
              >
                <span className="font-semibold text-gray-800">Unidade base: </span>
                {rotuloUnidade(unidadeBase)}
                <span className="text-gray-500 ml-2">({nomeUnidadeExibicao(unidadeBase)})</span>
              </div>
            )}
          </div>
        )}

        <form
          className="p-5 space-y-5"
          onSubmit={e => {
            e.preventDefault();
            if (!estoqueId) {
              toast.error("Selecione um produto.");
              return;
            }
            if (calculo.erro) {
              toast.error(calculo.erro);
              return;
            }
            if (isEdit && movId) {
              updateMutation.mutate({ id: movId, ...payload() });
            } else {
              createMutation.mutate(payload());
            }
          }}
        >
          <div>
            <FormLabel required>Produto</FormLabel>
            <FormSelect
              value={estoqueId}
              onChange={v => setEstoqueId(v)}
              placeholder="Selecione o produto..."
              displayValue={produtoNome || undefined}
              required
            >
              {produtos.map(p => (
                <SelectItem key={p.id} value={String(p.id)} className="text-[12px]">
                  {p.nome}
                </SelectItem>
              ))}
            </FormSelect>
            {unidadeBase && (
              <div
                className="mt-2 px-3 py-2 rounded border text-[12px]"
                style={{ borderColor: FD_PRIMARY, backgroundColor: `${FD_PRIMARY}14` }}
              >
                <span className="font-semibold text-gray-800">Unidade base do produto: </span>
                {rotuloUnidade(unidadeBase)}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FormLabel required>Data de movimentação</FormLabel>
              <FormDatePicker value={dataMov} onChange={setDataMov} required />
            </div>
            <div>
              <FormLabel>Data de validade</FormLabel>
              <FormDatePicker value={dataValidade} onChange={setDataValidade} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FormLabel required>Tipo de movimentação</FormLabel>
              <FormSelect
                value={tipoMov}
                onChange={setTipoMov}
                placeholder="Selecione o tipo"
                displayValue={tipoMov || undefined}
                required
              >
                {TIPOS_MOVIMENTACAO.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-[12px]">
                    {t.value}
                  </SelectItem>
                ))}
              </FormSelect>
              <p className="mt-1 text-[11px] text-gray-500">
                Este tipo é uma{" "}
                <span className={sinal === "entrada" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                  {sinal === "entrada" ? "entrada (soma ao estoque)" : "saída (reduz o estoque)"}
                </span>.
              </p>
            </div>
            <div>
              <FormLabel>Origem (Fazenda)</FormLabel>
              <FormSelect
                value={fazendaId}
                onChange={setFazendaId}
                placeholder="Selecione a fazenda"
                displayValue={fazendas.find(f => String(f.id) === fazendaId)?.nome || undefined}
              >
                {fazendas.map(f => (
                  <SelectItem key={f.id} value={String(f.id)} className="text-[12px]">
                    {f.nome}
                  </SelectItem>
                ))}
              </FormSelect>
            </div>
          </div>

          <div>
            <FormLabel required>Forma de lançamento</FormLabel>
            <RadioGroup
              value={modo}
              onValueChange={v => setModo(v as ModoQuantidadeMov)}
              className="flex flex-wrap gap-4 px-1 py-2"
            >
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <RadioGroupItem value="unidades" className="border-gray-400 text-[#4ECDC4]" />
                Por unidades / embalagem
              </label>
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <RadioGroupItem value="direto" className="border-gray-400 text-[#4ECDC4]" />
                Quantidade direta na unidade base
              </label>
            </RadioGroup>
          </div>

          {modo === "unidades" ? (
            <>
              {embalagens.length > 0 && (
                <div>
                  <FormLabel>Embalagem (opcional)</FormLabel>
                  <FormSelect
                    value={embalagemNome}
                    onChange={onEmbalagemChange}
                    placeholder="Selecione a embalagem"
                    displayValue={embalagemNome || undefined}
                  >
                    {embalagens.map(e => (
                      <SelectItem key={e.nome} value={e.nome} className="text-[12px]">
                        {e.nome}
                      </SelectItem>
                    ))}
                  </FormSelect>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <FormLabel required>Quantidade de unidades</FormLabel>
                  <FormInput
                    type="number"
                    value={quantidadeUnidades}
                    onChange={setQuantidadeUnidades}
                    placeholder="4"
                    required
                  />
                </div>
                <div>
                  <FormLabel required>Quantidade por unidade</FormLabel>
                  <FormInput
                    type="number"
                    value={quantidadePorUnidade}
                    onChange={setQuantidadePorUnidade}
                    placeholder="500"
                    required
                  />
                </div>
                <div>
                  <FormLabel required>Unidade</FormLabel>
                  <FormSelect
                    value={unidadeLancamento}
                    onChange={setUnidadeLancamento}
                    placeholder="Selecione"
                    displayValue={unidadeLancamento ? rotuloUnidade(unidadeLancamento) : undefined}
                    required
                  >
                    {UNIDADES_OPCOES.map(u => (
                      <SelectItem key={u.sigla} value={u.sigla} className="text-[12px]">
                        {rotuloUnidade(u.sigla)}
                      </SelectItem>
                    ))}
                  </FormSelect>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Quantidade</FormLabel>
                <FormInput
                  type="text"
                  inputMode="decimal"
                  value={quantidadeDireta}
                  onChange={setQuantidadeDireta}
                  placeholder="2000"
                  required
                />
              </div>
              <div>
                <FormLabel>Unidade</FormLabel>
                <div
                  className="px-3 py-2.5 text-[13px] text-gray-700 border border-gray-200 rounded-sm bg-[#EEEEEE] min-h-[42px] flex items-center"
                >
                  {unidadeBase ? rotuloUnidade(unidadeBase) : "Selecione um produto"}
                </div>
              </div>
            </div>
          )}

          {!calculo.erro && calculo.total !== 0 && (
            <div
              className="px-4 py-3 rounded border"
              style={{ borderColor: FD_PRIMARY, backgroundColor: `${FD_PRIMARY}18` }}
            >
              <p className="text-[11px] font-semibold uppercase text-gray-600 mb-1">Total no estoque</p>
              {resumoUnidades && (
                <p className="text-[12px] text-gray-600 mb-1">{resumoUnidades}</p>
              )}
              <p className="text-[16px] font-semibold text-gray-900">
                = {formatTotalMovimentacao(calculo.total, unidadeBase)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                O estoque do produto será {sinal === "entrada" ? "acrescido" : "reduzido"} neste valor.
              </p>
            </div>
          )}

          {calculo.erro && (quantidadeDireta || quantidadeUnidades) && (
            <p className="text-[12px] text-red-600">{calculo.erro}</p>
          )}

          <div className="pt-2 border-t border-gray-100">
            <p className="text-[11px] font-semibold uppercase text-gray-500 tracking-wide mb-3">
              Detalhes (opcional)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Destino</FormLabel>
                <FormInput value={destino} onChange={setDestino} placeholder="Ex.: Curral, Lote 3, Cliente..." />
              </div>
              <div>
                <FormLabel>Manejo</FormLabel>
                <FormInput value={manejo} onChange={setManejo} placeholder="Manejo vinculado" />
              </div>
              <div>
                <FormLabel>Fornecedor</FormLabel>
                <FormInput value={fornecedor} onChange={setFornecedor} placeholder="Nome do fornecedor" />
              </div>
              <div>
                <FormLabel>Nota Fiscal</FormLabel>
                <FormInput value={notaFiscal} onChange={setNotaFiscal} placeholder="nº nota fiscal" />
              </div>
              <div>
                <FormLabel>Frete (R$)</FormLabel>
                <FormInput type="text" inputMode="decimal" value={frete} onChange={setFrete} placeholder="0,00" />
              </div>
              <div>
                <FormLabel>Valor (R$)</FormLabel>
                <FormInput type="text" inputMode="decimal" value={valor} onChange={setValor} placeholder="0,00" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={isBusy || !!calculo.erro || calculo.total === 0}
              className="px-5 py-2.5 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-60"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setLocation("/insumos/visao-geral")}
              className="px-5 py-2.5 rounded text-[11px] font-semibold uppercase tracking-wide border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
