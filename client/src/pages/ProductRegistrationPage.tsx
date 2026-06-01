import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SelectItem } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormSelect,
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
} from "@/lib/produto-types";

type FormState = {
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
  const isEdit = produtoId != null && !isNaN(produtoId);

  const { data: produto, isLoading: loadingProduto } = trpc.estoque.get.useQuery(
    { id: produtoId! },
    { enabled: isEdit }
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [embalagensOpcoes, setEmbalagensOpcoes] = useState<string[]>([...EMBALAGENS_PADRAO]);
  const [novaEmbalagem, setNovaEmbalagem] = useState("");
  const [showNovaEmbalagem, setShowNovaEmbalagem] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const subcategorias = useMemo(() => {
    if (!form.categoria) return [];
    return SUBCATEGORIAS[form.categoria] ?? SUBCATEGORIAS.Outros;
  }, [form.categoria]);

  useEffect(() => {
    if (isEdit && produto && !initialized) {
      let embalagensSalvas: string[] = [];
      try {
        embalagensSalvas = produto.embalagens ? JSON.parse(produto.embalagens) : [];
      } catch { /* ignore */ }

      setForm({
        nome: produto.nome || "",
        categoria: produto.categoria || "",
        subcategoria: produto.subcategoria || "",
        quantidadeMinima: produto.quantidadeMinima ? String(produto.quantidadeMinima) : "",
        quantidadeMaxima: produto.quantidadeMaxima ? String(produto.quantidadeMaxima) : "",
        unidade: normalizarUnidade(produto.unidade),
        fabricante: produto.fabricante || "",
        identificadorUnico: produto.identificadorUnico || "",
        produzidoNaFazenda: produto.produzidoNaFazenda ? "sim" : "nao",
        monitorarEstoque: produto.monitorarEstoque ? "sim" : "nao",
        situacao: produto.situacao === "inativo" ? "inativo" : "ativo",
        embalagemSelecionada: embalagensSalvas[0] || "",
        carenciaAbate: produto.carenciaAbateDias != null ? String(produto.carenciaAbateDias) : "",
      });

      if (embalagensSalvas.length) {
        setEmbalagensOpcoes(prev => [...new Set([...prev, ...embalagensSalvas])]);
      }
      setInitialized(true);
    }
  }, [isEdit, produto, initialized]);

  const createMutation = trpc.estoque.create.useMutation({
    onSuccess: () => {
      utils.estoque.list.invalidate();
      toast.success("Produto cadastrado!");
      setLocation("/insumos/estoque");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.estoque.update.useMutation({
    onSuccess: () => {
      utils.estoque.list.invalidate();
      toast.success("Produto atualizado!");
      setLocation("/insumos/estoque");
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleAddEmbalagem = () => {
    const nome = novaEmbalagem.trim();
    if (!nome) { toast.error("Informe o nome da embalagem"); return; }
    if (!embalagensOpcoes.includes(nome)) {
      setEmbalagensOpcoes(prev => [...prev, nome]);
    }
    setForm(f => ({ ...f, embalagemSelecionada: nome }));
    setNovaEmbalagem("");
    setShowNovaEmbalagem(false);
    toast.success("Embalagem adicionada!");
  };

  const buildPayload = () => ({
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
    embalagens: form.embalagemSelecionada ? [form.embalagemSelecionada] : undefined,
    possuiCarencia: !!form.carenciaAbate.trim(),
    carenciaAbateDias: form.carenciaAbate.trim()
      ? parseInt(form.carenciaAbate, 10)
      : null,
    carenciaAbateUnidade: form.carenciaAbate.trim() ? "d" : null,
    carenciaLeiteDias: null,
    observacoesCarencia: null,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome do produto é obrigatório"); return; }
    if (!form.categoria) { toast.error("Categoria é obrigatória"); return; }
    if (!form.subcategoria) { toast.error("Subcategoria é obrigatória"); return; }
    if (!form.unidade) { toast.error("Unidade base é obrigatória"); return; }

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
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
              <FormSelect
                value={form.categoria}
                onChange={v => setForm(f => ({ ...f, categoria: v, subcategoria: "" }))}
                placeholder="Selecione"
                required
              >
                {CATEGORIAS_PRODUTO.map(c => (
                  <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
                ))}
              </FormSelect>
            </div>
            <div>
              <FormLabel required>Subcategoria</FormLabel>
              <FormSelect
                value={form.subcategoria}
                onChange={v => set("subcategoria", v)}
                placeholder="Selecione"
                required
                disabled={!form.categoria}
              >
                {subcategorias.map(s => (
                  <SelectItem key={s} value={s} className="text-[12px]">{s}</SelectItem>
                ))}
              </FormSelect>
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
              <FormSelect
                value={form.unidade}
                onChange={v => set("unidade", v)}
                placeholder="Selecione"
                displayValue={form.unidade ? rotuloUnidade(form.unidade) : undefined}
                required
              >
                {UNIDADES_OPCOES.map(u => (
                  <SelectItem key={u.sigla} value={u.sigla} className="text-[12px]">
                    {rotuloUnidade(u.sigla)}
                  </SelectItem>
                ))}
              </FormSelect>
            </div>
            <div>
              <FormLabel>Fabricante</FormLabel>
              <FormSelect
                value={form.fabricante}
                onChange={v => set("fabricante", v)}
                placeholder="Selecione"
              >
                {FABRICANTES.map(f => (
                  <SelectItem key={f} value={f} className="text-[12px]">{f}</SelectItem>
                ))}
              </FormSelect>
            </div>
          </div>

          {/* Linha 3 */}
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
                  min={0}
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
                  <div className="flex-1 min-w-[200px]">
                    <FormLabel>Nova embalagem</FormLabel>
                    <FormInput
                      value={novaEmbalagem}
                      onChange={v => setNovaEmbalagem(v)}
                      placeholder="Ex: Frasco 250ml"
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
                <FormSelect
                  value={form.embalagemSelecionada}
                  onChange={v => set("embalagemSelecionada", v)}
                  placeholder="Selecione"
                >
                  {embalagensOpcoes.map(e => (
                    <SelectItem key={e} value={e} className="text-[12px]">{e}</SelectItem>
                  ))}
                </FormSelect>
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
