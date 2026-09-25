import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormNativeSelect,
  formControlFlatCls,
} from "@/components/FormFields";
import { FAZENDA_SELECT_PLACEHOLDER } from "@/components/ManejoPontualFormLayout";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  COMPRA_VENDA_COMPRAS_PATH,
  COMPRA_VENDA_COMPRA_NOVA_PATH,
} from "@/lib/compraVendaCompradores";
import { formatarMetricaPeso, formatarMetricaQuantidade, formatarMetricaValor } from "@/lib/compraVendaResumo";
import { persistRebanhoFazendaId, readPersistedRebanhoFazendaId } from "@shared/animal-filter-types";
import { hojeISODate } from "@shared/animalBaixa";
import { CATEGORIAS_POR_SEXO, getCategoriasPorSexo } from "@shared/animal-types";
import {
  avaliarConfirmacaoCompraNaoIdentificados,
  FORMA_PRECIFICACAO_COMPRA_LABEL,
  type FormaPrecificacaoCompra,
  type GrupoCompraValido,
  type ModoIdentificacaoCompra,
  parsePrecoCompra,
} from "@shared/compraComercial";
import { trpc } from "@/lib/trpc";

const DRAFT_KEY = "fd_compras_nova_form_draft";

type GrupoDraft = {
  key: string;
  categoria: string;
  sexo: "macho" | "femea";
  quantidade: string;
  pesoTotal: string;
};

type CompraDraft = {
  fazendaId: string;
  data: string;
  fornecedorId: string;
  referencia: string;
  forma: FormaPrecificacaoCompra;
  preco: string;
  frete: string;
  outros: string;
  modo: ModoIdentificacaoCompra;
  grupos: GrupoDraft[];
};

function novoGrupo(sexo: "macho" | "femea" = "macho"): GrupoDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    categoria: CATEGORIAS_POR_SEXO.Macho[0] ?? "Bezerro",
    sexo,
    quantidade: "",
    pesoTotal: "",
  };
}

function formatMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function NovaCompraPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: fornecedores = [] } = trpc.pessoas.list.useQuery({ tipo: "fornecedor" });

  const fazendaInicial = useMemo(() => {
    const ids = fazendas.map(f => f.id);
    return readPersistedRebanhoFazendaId(ids) || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
  }, [fazendas]);

  const [fazendaId, setFazendaId] = useState("");
  const [data, setData] = useState(hojeISODate());
  const [fornecedorId, setFornecedorId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [forma, setForma] = useState<FormaPrecificacaoCompra>("kg");
  const [preco, setPreco] = useState("");
  const [frete, setFrete] = useState("");
  const [outros, setOutros] = useState("");
  const [modo, setModo] = useState<ModoIdentificacaoCompra>("nao_identificados");
  const [grupos, setGrupos] = useState<GrupoDraft[]>([novoGrupo()]);

  useEffect(() => {
    if (!fazendaId && fazendaInicial) setFazendaId(fazendaInicial);
  }, [fazendaId, fazendaInicial]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const novoFornecedorId = params.get("fornecedorId");
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      try {
        const draft = JSON.parse(raw) as CompraDraft;
        setFazendaId(draft.fazendaId);
        setData(draft.data);
        setFornecedorId(draft.fornecedorId);
        setReferencia(draft.referencia);
        setForma(draft.forma === "cabeca" ? "cabeca" : "kg");
        setPreco(draft.preco);
        setFrete(draft.frete);
        setOutros(draft.outros);
        setModo(draft.modo === "individuais" ? "individuais" : "nao_identificados");
        setGrupos(draft.grupos?.length ? draft.grupos : [novoGrupo()]);
      } catch {
        /* rascunho inválido */
      }
      sessionStorage.removeItem(DRAFT_KEY);
    }
    if (novoFornecedorId) {
      setFornecedorId(novoFornecedorId);
      params.delete("fornecedorId");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;

  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome ?? "";

  const mudarFazenda = (id: string) => {
    setFazendaId(id);
    const n = Number(id);
    if (n > 0) persistRebanhoFazendaId(id);
  };

  const irCadastrarFornecedor = () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        fazendaId, data, fornecedorId, referencia, forma, preco, frete, outros,
        modo, grupos,
      } satisfies CompraDraft),
    );
    const retorno = COMPRA_VENDA_COMPRA_NOVA_PATH;
    setLocation(`/financeiro/pessoas?novo=fornecedor&retorno=${encodeURIComponent(retorno)}`);
  };

  const avaliacao = useMemo(
    () =>
      avaliarConfirmacaoCompraNaoIdentificados({
        fazendaId: fazendaNum,
        fornecedorId: Number(fornecedorId) || 0,
        data,
        formaPrecificacao: forma,
        precoUnitario: parsePrecoCompra(parseCurrencyBrl(preco)),
        frete: parseCurrencyBrl(frete) || 0,
        outrosCustos: parseCurrencyBrl(outros) || 0,
        modoIdentificacao: modo,
        grupos: grupos.map(g => ({
          categoria: g.categoria,
          sexo: g.sexo,
          quantidade: g.quantidade,
          pesoTotal: g.pesoTotal,
        })),
      }),
    [fazendaNum, fornecedorId, data, forma, preco, frete, outros, modo, grupos],
  );

  const confirmarMut = trpc.compras.confirmarNaoIdentificados.useMutation({
    onError: e => toast.error(e.message),
  });

  const confirmar = async () => {
    if (modo === "individuais") {
      toast.error("A identificação individual ainda não está disponível nesta etapa.");
      return;
    }
    if (!avaliacao.ok) {
      toast.error(avaliacao.message);
      return;
    }
    const calc = avaliacao.calculado;
    const fornecedorNome = fornecedores.find(f => String(f.id) === fornecedorId)?.nome ?? "—";
    const ok = await confirm({
      title: "Confirmar Compra",
      confirmText: "Confirmar Compra",
      variant: "success",
      description: (
        <div className="space-y-1 text-[13px] text-gray-700">
          <p>Fornecedor: <span className="font-medium">{fornecedorNome}</span></p>
          <p>Data: <span className="font-medium">{data.split("-").reverse().join("/")}</span></p>
          <p>Forma: <span className="font-medium">{FORMA_PRECIFICACAO_COMPRA_LABEL[forma]}</span></p>
          <p>Animais: <span className="font-medium">{calc.quantidadeTotal}</span></p>
          {calc.pesoTotal != null && calc.pesoTotal > 0 ? (
            <p>Peso total: <span className="font-medium">{formatarMetricaPeso({ kind: "known", value: calc.pesoTotal })}</span></p>
          ) : null}
          <p>Custo total: <span className="font-medium">{formatMoney(calc.custoTotal)}</span></p>
        </div>
      ),
    });
    if (!ok) return;

    await confirmarMut.mutateAsync({
      fazendaId: fazendaNum,
      data,
      fornecedorId: Number(fornecedorId),
      referencia: referencia.trim() || undefined,
      formaPrecificacao: forma,
      precoUnitario: calc.precoUnitario,
      frete: calc.frete,
      outrosCustos: calc.outrosCustos,
      modoIdentificacao: "nao_identificados",
      grupos: calc.grupos.map((g: GrupoCompraValido) => ({
        categoria: g.categoria,
        sexo: g.sexo,
        quantidade: g.quantidade,
        pesoTotal: g.pesoTotal,
      })),
    });
    toast.success("Compra confirmada.");
    await utils.compras.list.invalidate();
    setLocation(COMPRA_VENDA_COMPRAS_PATH);
  };

  const atualizarGrupo = (key: string, patch: Partial<GrupoDraft>) => {
    setGrupos(prev => prev.map(g => (g.key === key ? { ...g, ...patch } : g)));
  };

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation(COMPRA_VENDA_COMPRAS_PATH)}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        aria-label="Voltar"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>

      <div className="space-y-5 pb-10">
        <div>
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
            Nova Compra
          </h1>
        </div>

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Dados da Compra</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
              {unicaFazenda && fazendaId && nomeFazenda ? (
                <div className="min-w-0">
                  <FormLabel>Fazenda de destino</FormLabel>
                  <FormInput variant="light" value={nomeFazenda} onChange={() => {}} readOnly />
                </div>
              ) : (
                <div className="min-w-0">
                  <FormLabel required>Fazenda de destino</FormLabel>
                  <FazendaOverviewSelect
                    value={fazendaId}
                    onChange={mudarFazenda}
                    fazendas={fazendas}
                    emptyLabel={FAZENDA_SELECT_PLACEHOLDER}
                    required
                  />
                </div>
              )}
              <div className="min-w-0">
                <FormLabel required>Data da compra</FormLabel>
                <FormDatePicker value={data} onChange={setData} required minHeight={34} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <FormLabel required>Fornecedor</FormLabel>
                <FormNativeSelect
                  variant="light"
                  value={fornecedorId}
                  onChange={setFornecedorId}
                  placeholder="Selecione o fornecedor"
                  options={fornecedores.map(f => ({ value: String(f.id), label: f.nome }))}
                  required
                />
                <button
                  type="button"
                  onClick={irCadastrarFornecedor}
                  className="mt-1.5 text-[11px] font-medium text-[#4ECDC4] hover:underline"
                >
                  + Cadastrar fornecedor
                </button>
              </div>
              <div>
                <FormLabel>Referência da compra</FormLabel>
                <FormInput
                  variant="light"
                  value={referencia}
                  onChange={setReferencia}
                  placeholder="NF, contrato ou referência interna"
                />
              </div>
              <div>
                <FormLabel required>Forma de precificação</FormLabel>
                <FormNativeSelect
                  variant="light"
                  value={forma}
                  onChange={v => setForma(v === "cabeca" ? "cabeca" : "kg")}
                  options={[
                    { value: "kg", label: FORMA_PRECIFICACAO_COMPRA_LABEL.kg },
                    { value: "cabeca", label: FORMA_PRECIFICACAO_COMPRA_LABEL.cabeca },
                  ]}
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Identificação dos Animais</h2>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-[12px] text-gray-600">Como os animais desta compra serão registrados?</p>
            <RadioGroup
              value={modo}
              onValueChange={v => setModo(v === "individuais" ? "individuais" : "nao_identificados")}
              className="gap-3"
            >
              <label className="flex gap-3 items-start border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50">
                <RadioGroupItem value="individuais" className="mt-0.5" />
                <span>
                  <span className="block text-[13px] font-medium text-gray-800">Animais identificados individualmente</span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    Informe individualmente os animais que estão entrando no rebanho. Poderá utilizar identificação visual, RFID e balança.
                  </span>
                </span>
              </label>
              <label className="flex gap-3 items-start border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50">
                <RadioGroupItem value="nao_identificados" className="mt-0.5" />
                <span>
                  <span className="block text-[13px] font-medium text-gray-800">Animais ainda não identificados</span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    Registre a aquisição por quantidade. Os animais poderão ser identificados posteriormente no curral.
                  </span>
                </span>
              </label>
            </RadioGroup>
            {modo === "individuais" ? (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                A identificação individual ainda não está disponível. Use “Animais ainda não identificados” para registrar esta compra.
              </p>
            ) : null}
          </div>
        </div>

        {modo === "nao_identificados" ? (
          <>
            <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Composição dos Animais</h2>
                <button
                  type="button"
                  onClick={() => setGrupos(prev => [...prev, novoGrupo()])}
                  className="text-[11px] font-medium text-[#4ECDC4] hover:underline"
                >
                  + Adicionar grupo
                </button>
              </div>
              <div className="p-5 space-y-3">
                {grupos.map(grupo => {
                  const sexoLabel = grupo.sexo === "femea" ? "Fêmea" : "Macho";
                  const categorias = getCategoriasPorSexo(sexoLabel);
                  return (
                    <div key={grupo.key} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end border border-gray-100 rounded-lg p-3">
                      <div className="sm:col-span-3">
                        <FormLabel required>Sexo</FormLabel>
                        <FormNativeSelect
                          variant="light"
                          value={grupo.sexo}
                          onChange={v => {
                            const sexo = v === "femea" ? "femea" : "macho";
                            const cats = getCategoriasPorSexo(sexo === "femea" ? "Fêmea" : "Macho");
                            atualizarGrupo(grupo.key, { sexo, categoria: cats[0] ?? "" });
                          }}
                          options={[
                            { value: "macho", label: "Macho" },
                            { value: "femea", label: "Fêmea" },
                          ]}
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <FormLabel required>Categoria</FormLabel>
                        <FormNativeSelect
                          variant="light"
                          value={grupo.categoria}
                          onChange={v => atualizarGrupo(grupo.key, { categoria: v })}
                          options={categorias.map(c => ({ value: c, label: c }))}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FormLabel required>Quantidade</FormLabel>
                        <FormInput
                          variant="light"
                          value={grupo.quantidade}
                          onChange={v => atualizarGrupo(grupo.key, { quantidade: v.replace(/[^\d]/g, "") })}
                          placeholder="0"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <FormLabel required={forma === "kg"}>Peso total (kg)</FormLabel>
                        <FormInput
                          variant="light"
                          value={grupo.pesoTotal}
                          onChange={v => atualizarGrupo(grupo.key, { pesoTotal: v })}
                          placeholder={forma === "kg" ? "Obrigatório" : "Opcional"}
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setGrupos(prev => (prev.length === 1 ? prev : prev.filter(g => g.key !== grupo.key)))}
                          className="p-2 text-gray-400 hover:text-red-500"
                          title="Excluir grupo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Valores da Aquisição</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <FormLabel required>{forma === "kg" ? "Preço por kg" : "Preço por cabeça"}</FormLabel>
                    <input
                      value={preco}
                      onChange={e => setPreco(formatCurrencyBrl(e.target.value))}
                      placeholder="R$ 0,00"
                      className={`${formControlFlatCls} bg-white outline-none placeholder:text-gray-400`}
                    />
                  </div>
                  <div>
                    <FormLabel>Frete</FormLabel>
                    <input
                      value={frete}
                      onChange={e => setFrete(formatCurrencyBrl(e.target.value))}
                      placeholder="R$ 0,00"
                      className={`${formControlFlatCls} bg-white outline-none placeholder:text-gray-400`}
                    />
                  </div>
                  <div>
                    <FormLabel>Outros custos</FormLabel>
                    <input
                      value={outros}
                      onChange={e => setOutros(formatCurrencyBrl(e.target.value))}
                      placeholder="R$ 0,00"
                      className={`${formControlFlatCls} bg-white outline-none placeholder:text-gray-400`}
                    />
                  </div>
                </div>

                {avaliacao.ok ? (
                  <div className="border border-gray-100 rounded-lg p-4 text-[13px] text-gray-700 space-y-1.5">
                    <div className="flex justify-between gap-4">
                      <span>Valor dos animais</span>
                      <span className="font-medium tabular-nums">{formatMoney(avaliacao.calculado.valorAnimais)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Frete</span>
                      <span className="tabular-nums">{formatMoney(avaliacao.calculado.frete)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Outros custos</span>
                      <span className="tabular-nums">{formatMoney(avaliacao.calculado.outrosCustos)}</span>
                    </div>
                    <div className="flex justify-between gap-4 pt-2 border-t border-gray-100 text-gray-900 font-semibold">
                      <span>Custo total</span>
                      <span className="tabular-nums">{formatMoney(avaliacao.calculado.custoTotal)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-[12px] text-gray-500 pt-1">
                      <span>Custo médio/cabeça</span>
                      <span className="tabular-nums">
                        {avaliacao.calculado.custoMedioCabeca != null
                          ? formatMoney(avaliacao.calculado.custoMedioCabeca)
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 text-[12px] text-gray-500">
                      <span>Custo médio/kg</span>
                      <span className="tabular-nums">
                        {avaliacao.calculado.custoMedioKg != null
                          ? formatMoney(avaliacao.calculado.custoMedioKg)
                          : "—"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Preencha os grupos e o preço para ver o cálculo. {avaliacao.message}
                  </p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                    <p className="text-[10px] uppercase text-gray-500">Animais</p>
                    <p className="text-[18px] font-bold text-gray-800">
                      {avaliacao.ok
                        ? formatarMetricaQuantidade({ kind: "known", value: avaliacao.calculado.quantidadeTotal })
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                    <p className="text-[10px] uppercase text-gray-500">Peso</p>
                    <p className="text-[18px] font-bold text-gray-800">
                      {avaliacao.ok && avaliacao.calculado.pesoTotal != null
                        ? formatarMetricaPeso({ kind: "known", value: avaliacao.calculado.pesoTotal })
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 col-span-2 sm:col-span-1">
                    <p className="text-[10px] uppercase text-gray-500">Custo total</p>
                    <p className="text-[18px] font-bold text-gray-800">
                      {avaliacao.ok
                        ? formatarMetricaValor({ kind: "known", value: avaliacao.calculado.custoTotal })
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setLocation(COMPRA_VENDA_COMPRAS_PATH)}
            disabled={confirmarMut.isPending}
            className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={confirmarMut.isPending || modo !== "nao_identificados"}
            onClick={() => void confirmar()}
            className="inline-flex items-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {confirmarMut.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Confirmar Compra"
            )}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
