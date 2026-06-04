import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormTextarea,
  FormDatePicker,
} from "@/components/FormFields";

const TIPOS_MANUTENCAO = [
  { value: "Preventiva", label: "Preventiva" },
  { value: "Corretiva", label: "Corretiva" },
] as const;

const STATUS_OPTS = [
  { value: "agendada", label: "Agendada" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluida", label: "Concluída" },
] as const;

type StatusManutencao = (typeof STATUS_OPTS)[number]["value"];

type PecaItem = {
  nome: string;
  quantidade: number;
  valorUnitario: number;
};

type FormState = {
  maquinaId: string;
  tipo: string;
  data: string;
  proximaManutencao: string;
  horimetro: string;
  status: StatusManutencao;
  descricao: string;
  observacoes: string;
  prestadorNome: string;
  prestadorContato: string;
  valorMaoObra: string;
};

const emptyForm = (): FormState => ({
  maquinaId: "",
  tipo: "Preventiva",
  data: new Date().toISOString().slice(0, 10),
  proximaManutencao: "",
  horimetro: "",
  status: "concluida",
  descricao: "",
  observacoes: "",
  prestadorNome: "",
  prestadorContato: "",
  valorMaoObra: "",
});

function toDateInput(value: unknown): string {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function getSearchParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ManutencaoFormPage() {
  const [, setLocation] = useLocation();
  const editId = Number(getSearchParam("id") || 0);
  const isEdit = editId > 0;
  const initializedForId = useRef<number | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [pecas, setPecas] = useState<PecaItem[]>([]);
  const [aba, setAba] = useState<"pecas" | "prestador">("pecas");

  // Campos de entrada de nova peça
  const [pecaNome, setPecaNome] = useState("");
  const [pecaQtd, setPecaQtd] = useState("1");
  const [pecaValor, setPecaValor] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: registro, isLoading } = trpc.manutencoes.get.useQuery(
    { id: editId },
    { enabled: isEdit }
  );
  const utils = trpc.useUtils();

  const createMutation = trpc.manutencoes.create.useMutation({
    onSuccess: () => {
      utils.manutencoes.list.invalidate();
      toast.success("Manutenção registrada!");
      setLocation("/maquinas/manutencao");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.manutencoes.update.useMutation({
    onSuccess: () => {
      utils.manutencoes.list.invalidate();
      toast.success("Manutenção atualizada!");
      setLocation("/maquinas/manutencao");
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    if (!isEdit || !registro) return;
    if (initializedForId.current === registro.id) return;
    setForm({
      maquinaId: String(registro.maquinaId),
      tipo: registro.tipo ?? "Preventiva",
      data: toDateInput(registro.data),
      proximaManutencao: toDateInput(registro.proximaManutencao),
      horimetro: registro.horimetro ?? "",
      status: (registro.status as StatusManutencao) ?? "concluida",
      descricao: registro.descricao ?? "",
      observacoes: registro.observacoes ?? "",
      prestadorNome: registro.prestadorNome ?? "",
      prestadorContato: registro.prestadorContato ?? "",
      valorMaoObra: registro.valorMaoObra
        ? formatCurrencyBrl(String(Math.round(parseFloat(String(registro.valorMaoObra)) * 100)))
        : "",
    });
    setPecas(
      (registro.pecas ?? []).map(p => ({
        nome: p.nome,
        quantidade: parseFloat(String(p.quantidade)) || 0,
        valorUnitario: parseFloat(String(p.valorUnitario)) || 0,
      }))
    );
    initializedForId.current = registro.id;
  }, [isEdit, registro]);

  // ── Totais ao vivo ────────────────────────────────────────────────────────
  const totalPecas = useMemo(
    () => pecas.reduce((s, p) => s + p.quantidade * p.valorUnitario, 0),
    [pecas]
  );

  const valorMaoObraNum = useMemo(() => {
    const v = parseCurrencyBrl(form.valorMaoObra);
    return v ? parseFloat(v) : 0;
  }, [form.valorMaoObra]);

  const totalGeral = totalPecas + valorMaoObraNum;

  const adicionarPeca = () => {
    const nome = pecaNome.trim();
    const qtd = parseFloat(pecaQtd.replace(",", "."));
    const valor = pecaValor ? parseFloat(parseCurrencyBrl(pecaValor) || "0") : 0;
    if (!nome) return toast.error("Informe o nome da peça.");
    if (Number.isNaN(qtd) || qtd <= 0) return toast.error("Informe uma quantidade válida.");
    setPecas(prev => [...prev, { nome, quantidade: qtd, valorUnitario: valor }]);
    setPecaNome("");
    setPecaQtd("1");
    setPecaValor("");
  };

  const removerPeca = (index: number) => {
    setPecas(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.maquinaId) return toast.error("Selecione a máquina.");
    if (!form.tipo) return toast.error("Selecione o tipo de manutenção.");
    if (!form.data) return toast.error("Informe a data da manutenção.");

    const payload = {
      maquinaId: Number(form.maquinaId),
      tipo: form.tipo,
      data: form.data,
      proximaManutencao: form.proximaManutencao || undefined,
      horimetro: form.horimetro.trim() || undefined,
      status: form.status,
      descricao: form.descricao.trim() || undefined,
      observacoes: form.observacoes.trim() || undefined,
      prestadorNome: form.prestadorNome.trim() || undefined,
      prestadorContato: form.prestadorContato.trim() || undefined,
      valorMaoObra: valorMaoObraNum,
      pecas: pecas.map(p => ({
        nome: p.nome,
        quantidade: p.quantidade,
        valorUnitario: p.valorUnitario,
      })),
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
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── Bloco 1: Dados da manutenção ─────────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <h1
            className="text-[16px] font-semibold text-gray-800 mb-5 pb-4 border-b border-gray-100 flex items-center gap-2"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            <span className="material-icons text-[20px]" style={{ color: FD_PRIMARY }}>
              build
            </span>
            {isEdit ? "Editar manutenção" : "Registro de Manutenção"}
          </h1>

          {/* Linha 1: Máquina | Tipo | Data | Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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
              <FormLabel required>Tipo de manutenção</FormLabel>
              <FormNativeSelect
                value={form.tipo}
                onChange={v => set("tipo", v)}
                placeholder="Selecione o tipo"
                required
                options={TIPOS_MANUTENCAO.map(t => ({ value: t.value, label: t.label }))}
              />
            </div>
            <div>
              <FormLabel required>Data da manutenção</FormLabel>
              <FormDatePicker
                value={form.data}
                onChange={v => set("data", v)}
                placeholder="Selecione a data"
                required
              />
            </div>
            <div>
              <FormLabel>Status</FormLabel>
              <FormNativeSelect
                value={form.status}
                onChange={v => set("status", v as StatusManutencao)}
                placeholder="Selecione o status"
                options={STATUS_OPTS.map(s => ({ value: s.value, label: s.label }))}
              />
            </div>
          </div>

          {/* Linha 2: Leitura odômetro | Próxima manutenção */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <FormLabel>Leitura do odômetro / horímetro</FormLabel>
              <FormInput
                value={form.horimetro}
                onChange={v => set("horimetro", v.replace(/[^\d.,]/g, ""))}
                placeholder="Ex. 10000"
              />
            </div>
            <div>
              <FormLabel>Próxima manutenção</FormLabel>
              <FormDatePicker
                value={form.proximaManutencao}
                onChange={v => set("proximaManutencao", v)}
                placeholder="Selecione a data prevista"
              />
            </div>
          </div>

          {/* Descrição */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <FormLabel>Descrição do serviço</FormLabel>
              <FormTextarea
                value={form.descricao}
                onChange={v => set("descricao", v)}
                placeholder="Descreva o serviço realizado ou a realizar"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* ── Bloco 2: Abas Peças / Prestador ──────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
          {/* Cabeçalho das abas */}
          <div className="grid grid-cols-2 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setAba("pecas")}
              className={cn(
                "flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors active:scale-[0.98]",
                aba === "pecas"
                  ? "text-gray-800 border-b-2"
                  : "text-gray-400 border-b-2 border-transparent hover:text-gray-600"
              )}
              style={aba === "pecas" ? { borderColor: FD_PRIMARY, minHeight: 52 } : { minHeight: 52 }}
            >
              <span className="material-icons text-[20px]">build</span>
              Peças
            </button>
            <button
              type="button"
              onClick={() => setAba("prestador")}
              className={cn(
                "flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors active:scale-[0.98]",
                aba === "prestador"
                  ? "text-gray-800 border-b-2"
                  : "text-gray-400 border-b-2 border-transparent hover:text-gray-600"
              )}
              style={aba === "prestador" ? { borderColor: FD_PRIMARY, minHeight: 52 } : { minHeight: 52 }}
            >
              <span className="material-icons text-[20px]">engineering</span>
              Prestador
            </button>
          </div>

          {/* Conteúdo Peças */}
          {aba === "pecas" && (
            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end mb-4">
                <div className="sm:col-span-5">
                  <FormLabel>Peça</FormLabel>
                  <FormInput
                    value={pecaNome}
                    onChange={setPecaNome}
                    placeholder="Nome da peça"
                  />
                </div>
                <div className="sm:col-span-2">
                  <FormLabel>Qtd</FormLabel>
                  <FormInput
                    value={pecaQtd}
                    onChange={v => setPecaQtd(v.replace(/[^\d.,]/g, ""))}
                    placeholder="1"
                  />
                </div>
                <div className="sm:col-span-3">
                  <FormLabel>Valor Unit.</FormLabel>
                  <FormInput
                    value={pecaValor}
                    onChange={v => setPecaValor(formatCurrencyBrl(v))}
                    placeholder="R$ 0,00"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={adicionarPeca}
                    className="w-full rounded-md text-[12px] font-semibold uppercase tracking-wide text-white transition hover:brightness-95 active:scale-[0.97] flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: FD_PRIMARY, minHeight: 48 }}
                  >
                    <span className="material-icons text-[16px]">add</span>
                    Adicionar
                  </button>
                </div>
              </div>

              {/* Tabela de peças */}
              <div className="overflow-x-auto border border-gray-100 rounded-md">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200">
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Peça</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[80px]">Qtd</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[130px]">Valor Unit.</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[130px]">Total</th>
                      <th className="px-2 py-2.5 w-[48px]" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pecas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-[12px]">
                          Nenhuma peça adicionada.
                        </td>
                      </tr>
                    )}
                    {pecas.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2.5 align-middle text-gray-800">{p.nome}</td>
                        <td className="px-3 py-2.5 align-middle text-right text-gray-600 tabular-nums">
                          {p.quantidade.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-right text-gray-600 tabular-nums">
                          {brl(p.valorUnitario)}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-right font-semibold text-gray-800 tabular-nums">
                          {brl(p.quantidade * p.valorUnitario)}
                        </td>
                        <td className="px-2 py-2.5 align-middle text-center">
                          <button
                            type="button"
                            onClick={() => removerPeca(i)}
                            className="grid place-items-center rounded hover:bg-red-50 text-red-400 active:scale-95 transition"
                            style={{ minWidth: 40, minHeight: 40 }}
                            aria-label="Remover peça"
                          >
                            <span className="material-icons text-[18px] leading-none">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mt-3">
                <span className="text-[13px] font-semibold text-gray-800">
                  Total Peças: {brl(totalPecas)}
                </span>
              </div>
            </div>
          )}

          {/* Conteúdo Prestador */}
          {aba === "prestador" && (
            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <FormLabel>Nome do prestador / oficina</FormLabel>
                  <FormInput
                    value={form.prestadorNome}
                    onChange={v => set("prestadorNome", v)}
                    placeholder="Ex. Oficina do João"
                  />
                </div>
                <div>
                  <FormLabel>Contato</FormLabel>
                  <FormInput
                    value={form.prestadorContato}
                    onChange={v => set("prestadorContato", v)}
                    placeholder="Telefone ou e-mail"
                  />
                </div>
                <div>
                  <FormLabel>Valor da mão de obra (R$)</FormLabel>
                  <FormInput
                    value={form.valorMaoObra}
                    onChange={v => set("valorMaoObra", formatCurrencyBrl(v))}
                    placeholder="R$ 0,00"
                  />
                </div>
              </div>

              <div className="flex justify-end mt-3">
                <span className="text-[13px] font-semibold text-gray-800">
                  Total Mão de Obra: {brl(valorMaoObraNum)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Bloco 3: Total Geral ─────────────────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 px-5 py-4 sm:px-6 flex items-center justify-end gap-2">
          <span className="material-icons text-[20px] text-amber-500">savings</span>
          <span className="text-[15px] font-semibold text-gray-800">
            Total Geral da Manutenção: {brl(totalGeral)}
          </span>
        </div>

        {/* ── Observações + Ações ──────────────────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <div className="mb-5">
            <FormLabel>Observações gerais</FormLabel>
            <FormTextarea
              value={form.observacoes}
              onChange={v => set("observacoes", v)}
              placeholder="Anotações adicionais sobre a manutenção"
              rows={2}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/maquinas/manutencao")}
              className="w-full sm:w-auto px-6 rounded-full text-[12px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 active:scale-[0.97] transition-colors flex items-center justify-center"
              style={{ minHeight: 48 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className={cn(
                "w-full sm:w-auto px-6 rounded-full text-[12px] font-semibold uppercase tracking-wide text-white active:scale-[0.97] transition-colors flex items-center justify-center gap-2",
                pending && "opacity-60 cursor-not-allowed"
              )}
              style={{ backgroundColor: FD_PRIMARY, minHeight: 48 }}
            >
              {pending ? (
                <><span className="material-icons text-[16px] animate-spin">refresh</span> Salvando...</>
              ) : (
                <><span className="material-icons text-[16px]">save</span> Salvar</>
              )}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { ManutencaoFormPage };
