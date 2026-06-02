import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormTextarea,
  FormDatePicker,
} from "@/components/FormFields";

const COMBUSTIVEIS = [
  { value: "diesel", label: "Diesel" },
  { value: "gasolina", label: "Gasolina" },
  { value: "etanol", label: "Etanol" },
  { value: "arla", label: "Arla" },
] as const;

type Combustivel = (typeof COMBUSTIVEIS)[number]["value"];

type FormState = {
  data: string;
  maquinaId: string;
  combustivel: Combustivel | "";
  litros: string;
  horimetro: string;
  abastecidoNaFazenda: "sim" | "nao";
  fazendaId: string;
  valorLitro: string;
  responsavel: string;
  observacoes: string;
};

const emptyForm = (): FormState => ({
  data: new Date().toISOString().slice(0, 10),
  maquinaId: "",
  combustivel: "",
  litros: "",
  horimetro: "",
  abastecidoNaFazenda: "sim",
  fazendaId: "",
  valorLitro: "",
  responsavel: "",
  observacoes: "",
});

function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function getSearchParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function AbastecimentoFormPage() {
  const [, setLocation] = useLocation();
  const editId = Number(getSearchParam("id") || 0);
  const isEdit = editId > 0;
  const initializedForId = useRef<number | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const { data: registro, isLoading } = trpc.abastecimentos.get.useQuery(
    { id: editId },
    { enabled: isEdit }
  );
  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: estoque = [] } = trpc.estoque.list.useQuery();
  const { data: user } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.abastecimentos.create.useMutation({
    onSuccess: () => {
      utils.abastecimentos.list.invalidate();
      toast.success("Abastecimento registrado!");
      setLocation("/maquinas/abastecimento");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.abastecimentos.update.useMutation({
    onSuccess: () => {
      utils.abastecimentos.list.invalidate();
      toast.success("Abastecimento atualizado!");
      setLocation("/maquinas/abastecimento");
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    if (!isEdit || !registro) return;
    if (initializedForId.current === registro.id) return;
    setForm({
      data: toDateInput(registro.data),
      maquinaId: String(registro.maquinaId),
      combustivel: (registro.combustivel as Combustivel) ?? "",
      litros: registro.litros ? String(registro.litros) : "",
      horimetro: registro.horimetro ?? "",
      abastecidoNaFazenda: registro.abastecidoNaFazenda ? "sim" : "nao",
      fazendaId: registro.fazendaId ? String(registro.fazendaId) : "",
      valorLitro: registro.valorLitro
        ? formatCurrencyBrl(String(Math.round(parseFloat(String(registro.valorLitro)) * 100)))
        : "",
      responsavel: registro.responsavel ?? "",
      observacoes: registro.observacoes ?? "",
    });
    initializedForId.current = registro.id;
  }, [isEdit, registro]);

  useEffect(() => {
    if (isEdit || form.responsavel || !user?.name) return;
    set("responsavel", user.name);
  }, [isEdit, user?.name, form.responsavel]);

  const estoqueAtualLitros = useMemo(() => {
    if (form.abastecidoNaFazenda !== "sim" || !form.fazendaId) return null;
    const fazendaIdNum = Number(form.fazendaId);
    const total = estoque
      .filter(item => {
        if (item.fazendaId !== fazendaIdNum) return false;
        const nome = (item.nome ?? "").toLowerCase();
        const cat = (item.categoria ?? "").toLowerCase();
        return cat.includes("combust") || nome.includes("diesel") || nome.includes("gasolina") || nome.includes("etanol");
      })
      .reduce((sum, item) => sum + parseFloat(String(item.quantidade ?? 0)), 0);
    return total;
  }, [estoque, form.abastecidoNaFazenda, form.fazendaId]);

  const valorTotalPreview = useMemo(() => {
    const litros = parseFloat(form.litros);
    const valor = parseCurrencyBrl(form.valorLitro);
    if (Number.isNaN(litros) || Number.isNaN(valor)) return "";
    return (litros * valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  }, [form.litros, form.valorLitro]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.maquinaId) return toast.error("Selecione a máquina.");
    if (!form.combustivel) return toast.error("Selecione o combustível.");
    if (!form.litros.trim()) return toast.error("Informe a quantidade abastecida.");
    if (form.abastecidoNaFazenda === "sim" && !form.fazendaId) {
      return toast.error("Selecione o estoque (fazenda).");
    }

    const payload = {
      maquinaId: Number(form.maquinaId),
      data: form.data,
      combustivel: form.combustivel as Combustivel,
      litros: form.litros,
      valorLitro: form.valorLitro ? String(parseCurrencyBrl(form.valorLitro)) : undefined,
      horimetro: form.horimetro.trim() || undefined,
      abastecidoNaFazenda: form.abastecidoNaFazenda === "sim",
      fazendaId: form.abastecidoNaFazenda === "sim" && form.fazendaId ? Number(form.fazendaId) : null,
      responsavel: form.responsavel.trim() || undefined,
      observacoes: form.observacoes.trim() || undefined,
    };

    if (isEdit) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const pending = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoading) {
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
            {isEdit ? "Editar abastecimento" : "Lançamento de Abastecimento"}
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel required>Data do abastecimento</FormLabel>
              <FormDatePicker
                value={form.data}
                onChange={v => set("data", v)}
                placeholder="Selecione a data do Abastecimento"
                required
              />
            </div>
            <div>
              <FormLabel required>Máquina</FormLabel>
              <FormNativeSelect
                value={form.maquinaId}
                onChange={v => set("maquinaId", v)}
                placeholder="Selecione a Máquina"
                required
                options={maquinas.map(m => ({ value: String(m.id), label: m.nome }))}
              />
            </div>
            <div>
              <FormLabel required>Combustível</FormLabel>
              <FormNativeSelect
                value={form.combustivel}
                onChange={v => set("combustivel", v as Combustivel | "")}
                placeholder="Selecione o tipo de Combustível"
                required
                options={COMBUSTIVEIS.map(c => ({ value: c.value, label: c.label }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel required>Quantidade abastecida (L)</FormLabel>
              <FormInput
                value={form.litros}
                onChange={v => set("litros", v.replace(/[^\d.,]/g, ""))}
                placeholder="Ex. 100"
                required
              />
            </div>
            <div>
              <FormLabel>Leitura atual do odômetro</FormLabel>
              <FormInput
                value={form.horimetro}
                onChange={v => set("horimetro", v.replace(/[^\d.,]/g, ""))}
                placeholder="Ex. 10000"
              />
            </div>
            <div>
              <FormLabel required>Abastecido na fazenda</FormLabel>
              <RadioGroup
                value={form.abastecidoNaFazenda}
                onValueChange={v => set("abastecidoNaFazenda", v as "sim" | "nao")}
                className="flex items-center gap-6 h-[42px] px-1"
              >
                <label className="flex items-center gap-2 cursor-pointer text-[13px] text-gray-700">
                  <RadioGroupItem value="sim" />
                  Sim
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[13px] text-gray-700">
                  <RadioGroupItem value="nao" />
                  Não
                </label>
              </RadioGroup>
            </div>
          </div>

          {form.abastecidoNaFazenda === "sim" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <FormLabel required>Estoque</FormLabel>
                <FormNativeSelect
                  value={form.fazendaId}
                  onChange={v => set("fazendaId", v)}
                  placeholder="Selecione uma Fazenda"
                  required
                  options={fazendas.map(f => ({ value: String(f.id), label: f.nome }))}
                />
              </div>
              <div>
                <FormLabel>Estoque atual (em litros)</FormLabel>
                <FormInput
                  value={estoqueAtualLitros != null ? estoqueAtualLitros.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}
                  onChange={() => {}}
                  placeholder="Estoque atual (em litros)"
                  className="cursor-default"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel>Valor por litro (R$)</FormLabel>
              <FormInput
                value={form.valorLitro}
                onChange={v => set("valorLitro", formatCurrencyBrl(v))}
                placeholder="R$ 0,00"
              />
            </div>
            <div>
              <FormLabel>Valor total (R$)</FormLabel>
              <FormInput
                value={valorTotalPreview ? `R$ ${valorTotalPreview}` : ""}
                onChange={() => {}}
                placeholder="Calculado automaticamente"
                className="cursor-default"
              />
            </div>
            <div>
              <FormLabel>Responsável pelo abastecimento</FormLabel>
              <FormNativeSelect
                value={form.responsavel}
                onChange={v => set("responsavel", v)}
                placeholder="Selecione o responsável"
                options={[
                  ...(user?.name ? [{ value: user.name, label: user.name }] : []),
                  ...fazendas
                    .map(f => f.responsavel)
                    .filter((n): n is string => !!n?.trim())
                    .filter((n, i, arr) => arr.indexOf(n) === i)
                    .map(n => ({ value: n, label: n })),
                ]}
              />
            </div>
          </div>

          <div className="mb-6">
            <FormLabel>Observações</FormLabel>
            <FormTextarea
              value={form.observacoes}
              onChange={v => set("observacoes", v)}
              placeholder="Descreva seu ultimo abastecimento"
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/maquinas/abastecimento")}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className={cn(
                "px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-white transition-colors",
                pending && "opacity-60 cursor-not-allowed"
              )}
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { AbastecimentoFormPage };
