import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FieldBox,
} from "@/components/FormFields";
import {
  CATEGORIAS_PRODUTO,
  SUBCATEGORIAS,
  UNIDADES_OPCOES,
  FABRICANTES,
  EMBALAGENS_PADRAO,
  normalizarUnidade,
  siglaUnidade,
  rotuloUnidade,
  parseEmbalagens,
  extrairVolumeEmbalagem,
  type EmbalagemProduto,
} from "@/lib/produto-types";

const fmtDecimalInput = (v: string | number | null | undefined): string => {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return String(n);
};

type FormState = {
  fazendaId: string;
  nome: string;
  categoria: string;
  subcategoria: string;
  quantidadeMinima: string;
  quantidadeMaxima: string;
  unidade: string;
  fabricante: string;
  identificadorUnico: string;
  produzidoNaFazenda: "sim" | "nao";
  monitorarEstoque: "sim" | "nao";
  situacao: "ativo" | "inativo";
  embalagemSelecionada: string;
  carenciaAbate: string;
};

const emptyForm = (): FormState => ({
  fazendaId: "",
  nome: "",
  categoria: "",
  subcategoria: "",
  quantidadeMinima: "",
  quantidadeMaxima: "",
  unidade: "",
  fabricante: "",
  identificadorUnico: "",
  produzidoNaFazenda: "nao",
  monitorarEstoque: "nao",
  situacao: "ativo",
  embalagemSelecionada: "",
  carenciaAbate: "",
});

function FormRadioGroup({
  value,
  onChange,
  options,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <FieldBox required={required} variant="light">
      <RadioGroup value={value} onValueChange={onChange} className="flex flex-wrap gap-4 px-3 py-2.5 min-h-[42px] items-center">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer">
            <RadioGroupItem value={opt.value} className="border-gray-400 text-[#4ECDC4]" />
            {opt.label}
          </label>
        ))}
      </RadioGroup>
    </FieldBox>
  );
}

export default function ProductRegistrationPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const searchParams = new URLSearchParams(window.location.search);
  const produtoId = searchParams.get("id") ? parseInt(searchParams.get("id")!) : null;
  const fazendaIdParam = searchParams.get("fazendaId") ?? "";
  const isEdit = produtoId != null && !isNaN(produtoId);

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: produto, isLoading: loadingProduto } = trpc.estoque.get.useQuery(
    { id: produtoId! },
    { enabled: isEdit }
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [embalagensOpcoes, setEmbalagensOpcoes] = useState<EmbalagemProduto[]>(
    EMBALAGENS_PADRAO.map(nome => {
      const vol = extrairVolumeEmbalagem(nome);
      return { nome, volume: vol.volume, unidade: vol.unidade };
    })
  );
  const [novaEmbalagem, setNovaEmbalagem] = useState("");
  const [novaEmbalagemVolume, setNovaEmbalagemVolume] = useState("");
  const [novaEmbalagemUnidade, setNovaEmbalagemUnidade] = useState("");
  const [showNovaEmbalagem, setShowNovaEmbalagem] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isEdit && fazendaIdParam && !form.fazendaId) {
      setForm(f => ({ ...f, fazendaId: fazendaIdParam }));
    }
  }, [isEdit, fazendaIdParam, form.fazendaId]);

  useEffect(() => {
    if (!isEdit && !fazendaIdParam && fazendas.length === 1 && !form.fazendaId) {
      setForm(f => ({ ...f, fazendaId: String(fazendas[0]!.id) }));
    }
  }, [isEdit, fazendaIdParam, fazendas, form.fazendaId]);

  const fazendasOpcoes = useMemo(() => {
    const opts = fazendas.map(f => ({ value: String(f.id), label: f.nome }));
    if (form.fazendaId && !opts.some(o => o.value === form.fazendaId)) {
      opts.push({ value: form.fazendaId, label: `Fazenda #${form.fazendaId}` });
    }
    return opts;
  }, [fazendas, form.fazendaId]);

  const subcategorias = useMemo(() => {
    if (!form.categoria) return form.subcategoria ? [form.subcategoria] : [];
    const base = SUBCATEGORIAS[form.categoria] ?? SUBCATEGORIAS.Outros;
    if (form.subcategoria && !base.includes(form.subcategoria)) {
      return [...base, form.subcategoria];
    }
    return base;
  }, [form.categoria, form.subcategoria]);

  const fabricantesOpcoes = useMemo(() => {
    if (form.fabricante && !(FABRICANTES as readonly string[]).includes(form.fabricante)) {
      return [...FABRICANTES, form.fabricante];
    }
    return [...FABRICANTES];
  }, [form.fabricante]);

  const unidadesOpcoes = useMemo(() => {
    const opts = UNIDADES_OPCOES.map(u => ({
      value: u.sigla,
      label: rotuloUnidade(u.sigla),
    }));
    if (form.unidade && !opts.some(o => o.value === form.unidade)) {
      opts.push({ value: form.unidade as any, label: rotuloUnidade(form.unidade) });
    }
    return opts;
  }, [form.unidade]);

  const categoriasOpcoes = useMemo(() => {
    const opts = CATEGORIAS_PRODUTO.map(c => ({ value: c, label: c }));
    if (form.categoria && !opts.some(o => o.value === form.categoria)) {
      opts.push({ value: form.categoria as any, label: form.categoria as any });
    }
    return opts;
  }, [form.categoria]);

  useEffect(() => {
    if (isEdit && produto && !initialized) {
      const embalagensSalvas = parseEmbalagens(produto.embalagens);

      setForm({
        fazendaId: produto.fazendaId ? String(produto.fazendaId) : "",
        nome: produto.nome || "",
        categoria: produto.categoria || "",
        subcategoria: produto.subcategoria || "",
        quantidadeMinima: fmtDecimalInput(produto.quantidadeMinima),
        quantidadeMaxima: fmtDecimalInput(produto.quantidadeMaxima),
        unidade: normalizarUnidade(produto.unidade),
        fabricante: produto.fabricante || "",
        identificadorUnico: produto.identificadorUnico || "",
        produzidoNaFazenda: produto.produzidoNaFazenda ? "sim" : "nao",
        monitorarEstoque: produto.monitorarEstoque ? "sim" : "nao",
        situacao: produto.situacao === "inativo" ? "inativo" : "ativo",
        embalagemSelecionada: embalagensSalvas[0]?.nome || "",
        carenciaAbate: produto.carenciaAbateDias != null ? String(produto.carenciaAbateDias) : "",
      });

      if (embalagensSalvas.length) {
        setEmbalagensOpcoes(prev => {
          const nomes = new Set(prev.map(e => e.nome));
          const extras = embalagensSalvas.filter(e => !nomes.has(e.nome));
          return [...prev, ...extras];
        });
      }
      setInitialized(true);
    }
  }, [isEdit, produto, initialized]);

  const createMutation = trpc.estoque.create.useMutation({
    onSuccess: () => {
      utils.estoque.list.invalidate();
      toast.success("Produto cadastrado!");
      setLocation("/insumos/lista-produtos");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.estoque.update.useMutation({
    onSuccess: () => {
      utils.estoque.list.invalidate();
      toast.success("Produto atualizado!");
      setLocation("/insumos/lista-produtos");
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleAddEmbalagem = () => {
    const nome = novaEmbalagem.trim();
    if (!nome) { toast.error("Informe o nome da embalagem"); return; }
    const parsed = extrairVolumeEmbalagem(nome);
    const volume = novaEmbalagemVolume
      ? parseFloat(novaEmbalagemVolume.replace(",", "."))
      : parsed.volume;
    const unidade = novaEmbalagemUnidade || parsed.unidade || form.unidade;
    const item: EmbalagemProduto = {
      nome,
      volume: volume && !Number.isNaN(volume) ? volume : undefined,
      unidade: unidade || undefined,
    };
    if (!embalagensOpcoes.some(e => e.nome === nome)) {
      setEmbalagensOpcoes(prev => [...prev, item]);
    }
    setForm(f => ({ ...f, embalagemSelecionada: nome }));
    setNovaEmbalagem("");
    setNovaEmbalagemVolume("");
    setNovaEmbalagemUnidade("");
    setShowNovaEmbalagem(false);
    toast.success("Embalagem adicionada!");
  };

  const embalagemAtiva = useMemo(
    () => embalagensOpcoes.find(e => e.nome === form.embalagemSelecionada),
    [embalagensOpcoes, form.embalagemSelecionada]
  );

  const buildPayload = () => ({
    fazendaId: form.fazendaId ? parseInt(form.fazendaId, 10) : undefined,
    nome: form.nome.trim(),
    categoria: form.categoria,
    subcategoria: form.subcategoria,
    unidade: siglaUnidade(form.unidade),
    quantidadeMinima: form.quantidadeMinima || undefined,
    quantidadeMaxima: form.quantidadeMaxima || undefined,
    fabricante: form.fabricante || undefined,
    identificadorUnico: form.identificadorUnico.trim() || undefined,
    produzidoNaFazenda: form.produzidoNaFazenda === "sim",
    monitorarEstoque: form.monitorarEstoque === "sim",
    situacao: form.situacao,
    embalagens: form.embalagemSelecionada
      ? embalagensOpcoes.filter(e => e.nome === form.embalagemSelecionada)
      : undefined,
    possuiCarencia: !!form.carenciaAbate.trim(),
    carenciaAbateDias: form.carenciaAbate.trim()
      ? parseInt(form.carenciaAbate, 10)
      : null,
    carenciaAbateUnidade: (form.carenciaAbate.trim() ? "d" : null) as "d" | "h" | null,
    carenciaLeiteDias: null,
    carenciaLeiteUnidade: null,
    observacoesCarencia: null,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome do produto é obrigatório"); return; }
    if (!form.categoria) { toast.error("Categoria é obrigatória"); return; }
    if (!form.subcategoria) { toast.error("Subcategoria é obrigatória"); return; }
    if (!form.unidade) { toast.error("Unidade base é obrigatória"); return; }
    if (!form.fazendaId) { toast.error("Fazenda (estoque) é obrigatória"); return; }

    const payload = buildPayload();
    if (isEdit && produtoId) updateMutation.mutate({ id: produtoId, ...payload });
    else createMutation.mutate(payload);
  };

  if (isEdit && loadingProduto) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  if (isEdit && !produto) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-3">
          <p>Produto não encontrado.</p>
          <button
            type="button"
            onClick={() => setLocation("/insumos/lista-produtos")}
            className="text-[12px] text-[#4ECDC4] hover:underline"
          >
            Voltar
          </button>
        </div>
      </AppLayout>
    );
  }

  if (isEdit && !initialized) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <h1
            className="text-[16px] font-semibold text-gray-800 mb-5 pb-4 border-b border-gray-100"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {isEdit ? "Editar produto" : "Cadastro de produtos"}
          </h1>

          {/* Linha 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <FormLabel required>Estoque (Fazenda)</FormLabel>
              <FormNativeSelect
                value={form.fazendaId}
                onChange={v => set("fazendaId", v)}
                placeholder="Selecione"
                options={fazendasOpcoes}
                required
              />
            </div>
            <div>
              <FormLabel required>Nome do Produto</FormLabel>
              <FormInput
                value={form.nome}
                onChange={v => set("nome", v)}
                placeholder="Produto"
                required
              />
            </div>
            <div>
              <FormLabel required>Categoria</FormLabel>
              <FormNativeSelect
                value={form.categoria}
                onChange={v => setForm(f => ({ ...f, categoria: v, subcategoria: "" }))}
                placeholder="Selecione"
                options={categoriasOpcoes}
                required
              />
            </div>
            <div>
              <FormLabel required>Subcategoria</FormLabel>
              <FormNativeSelect
                value={form.subcategoria}
                onChange={v => set("subcategoria", v)}
                placeholder="Selecione"
                options={subcategorias.map(s => ({ value: s, label: s }))}
                required
                disabled={!form.categoria}
              />
            </div>
          </div>

          {/* Linha 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <FormLabel>Quantidade Mínima</FormLabel>
              <FormInput
                type="number"
                value={form.quantidadeMinima}
                onChange={v => set("quantidadeMinima", v)}
                placeholder="0"
              />
            </div>
            <div>
              <FormLabel>Quantidade Máxima</FormLabel>
              <FormInput
                type="number"
                value={form.quantidadeMaxima}
                onChange={v => set("quantidadeMaxima", v)}
                placeholder="0"
              />
            </div>
            <div>
              <FormLabel required>Unidade Base</FormLabel>
              <FormNativeSelect
                value={form.unidade}
                onChange={v => set("unidade", v)}
                placeholder="Selecione"
                options={unidadesOpcoes}
                required
              />
              {form.unidade && (
                <div
                  className="mt-2 px-3 py-2 rounded border text-[12px] text-gray-700"
                  style={{ borderColor: FD_PRIMARY, backgroundColor: `${FD_PRIMARY}14` }}
                >
                  <span className="font-semibold text-gray-800">Unidade base: </span>
                  {rotuloUnidade(form.unidade)}
                </div>
              )}
            </div>
            <div>
              <FormLabel>Fabricante</FormLabel>
              <FormNativeSelect
                value={form.fabricante}
                onChange={v => set("fabricante", v)}
                placeholder="Selecione"
                options={fabricantesOpcoes.map(f => ({ value: f, label: f }))}
              />
              {form.fabricante && (
                <div
                  className="mt-2 px-3 py-2 rounded border text-[12px] text-gray-700"
                  style={{ borderColor: FD_PRIMARY, backgroundColor: `${FD_PRIMARY}14` }}
                >
                  <span className="font-semibold text-gray-800">Fabricante: </span>
                  {form.fabricante}
                </div>
              )}
            </div>
          </div>

          {/* Linha 3 — quantidades mín/máx com confirmação */}
          {(form.quantidadeMinima || form.quantidadeMaxima) && (
            <div
              className="mb-4 px-3 py-2 rounded border text-[12px] text-gray-700 flex flex-wrap gap-x-6 gap-y-1"
              style={{ borderColor: FD_PRIMARY, backgroundColor: `${FD_PRIMARY}14` }}
            >
              {form.quantidadeMinima && (
                <span>
                  <span className="font-semibold text-gray-800">Qtd. mínima: </span>
                  {Number(form.quantidadeMinima).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              )}
              {form.quantidadeMaxima && (
                <span>
                  <span className="font-semibold text-gray-800">Qtd. máxima: </span>
                  {Number(form.quantidadeMaxima).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <FormLabel>Identificador único</FormLabel>
              <FormInput
                value={form.identificadorUnico}
                onChange={v => set("identificadorUnico", v)}
                placeholder=""
              />
            </div>
            <div>
              <FormLabel>Produzido na Fazenda</FormLabel>
              <FormRadioGroup
                value={form.produzidoNaFazenda}
                onChange={v => set("produzidoNaFazenda", v as "sim" | "nao")}
                options={[
                  { value: "sim", label: "Sim" },
                  { value: "nao", label: "Não" },
                ]}
              />
            </div>
            <div>
              <FormLabel required>Monitorar Estoque</FormLabel>
              <FormRadioGroup
                value={form.monitorarEstoque}
                onChange={v => set("monitorarEstoque", v as "sim" | "nao")}
                options={[
                  { value: "sim", label: "Sim" },
                  { value: "nao", label: "Não" },
                ]}
                required
              />
            </div>
            <div>
              <FormLabel>Situação do produto</FormLabel>
              <FormRadioGroup
                value={form.situacao}
                onChange={v => set("situacao", v as "ativo" | "inativo")}
                options={[
                  { value: "ativo", label: "Ativo" },
                  { value: "inativo", label: "Inativo" },
                ]}
              />
            </div>
          </div>

          {/* Carência de abate — estilo iRancho */}
          <div className="border border-gray-200 rounded-md mb-6">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-[13px] font-semibold text-gray-800">Carência de abate</h2>
            </div>
            <div className="px-4 py-4">
              <div className="max-w-xs">
                <FormLabel>Carência de abate (dias)</FormLabel>
                <FormInput
                  type="number"
                  value={form.carenciaAbate}
                  onChange={v => set("carenciaAbate", v.replace(/\D/g, ""))}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Tipos de embalagem — estilo iRancho */}
          <div className="border border-gray-200 rounded-md mb-6">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold text-gray-800">Tipos de embalagem</h2>
              <button
                type="button"
                onClick={() => setShowNovaEmbalagem(v => !v)}
                className="px-4 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Nova Embalagem
              </button>
            </div>
            <div className="px-4 py-4">
              {showNovaEmbalagem && (
                <div className="flex flex-wrap items-end gap-2 mb-4">
                  <div className="flex-1 min-w-[180px]">
                    <FormLabel>Nova embalagem</FormLabel>
                    <FormInput
                      value={novaEmbalagem}
                      onChange={v => setNovaEmbalagem(v)}
                      placeholder="Ex: Frasco 500ml"
                    />
                  </div>
                  <div className="w-28">
                    <FormLabel>Qtd / unidade</FormLabel>
                    <FormInput
                      type="number"
                      value={novaEmbalagemVolume}
                      onChange={v => setNovaEmbalagemVolume(v)}
                      placeholder="500"
                    />
                  </div>
                  <div className="w-36">
                    <FormLabel>Unidade</FormLabel>
                    <FormNativeSelect
                      value={novaEmbalagemUnidade || form.unidade}
                      onChange={v => setNovaEmbalagemUnidade(v)}
                      placeholder="Unidade"
                      options={unidadesOpcoes}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEmbalagem}
                    className="px-4 py-2 rounded text-[11px] font-semibold uppercase text-gray-900"
                    style={{ backgroundColor: FD_PRIMARY }}
                  >
                    Incluir
                  </button>
                </div>
              )}
              <div>
                <FormLabel>Embalagens do produto</FormLabel>
                <FormNativeSelect
                  value={form.embalagemSelecionada}
                  onChange={v => set("embalagemSelecionada", v)}
                  placeholder="Selecione"
                  options={embalagensOpcoes.map(e => ({ value: e.nome, label: e.nome }))}
                />
                {embalagemAtiva && (embalagemAtiva.volume || embalagemAtiva.unidade) && (
                  <div
                    className="mt-2 px-3 py-2 rounded border text-[12px] text-gray-700"
                    style={{ borderColor: FD_PRIMARY, backgroundColor: `${FD_PRIMARY}14` }}
                  >
                    <span className="font-semibold">Por unidade: </span>
                    {embalagemAtiva.volume?.toLocaleString("pt-BR") ?? "—"}
                    {embalagemAtiva.unidade ? ` ${rotuloUnidade(embalagemAtiva.unidade)}` : ""}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Salvar */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isBusy}
              className="px-8 py-2.5 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { ProductRegistrationPage };
