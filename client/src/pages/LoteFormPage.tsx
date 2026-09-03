/**
 * Formulário de Novo Lote
 * Rota: /rebanho/novo-lote
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormNativeSelect,
} from "@/components/FormFields";

/** Limites alinhados ao schema (drizzle/schema.ts — lotes.nome / lotes.sigla). */
const NOME_MAX = 100;
const SIGLA_MAX = 20;

function hojeISOLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseFazendaIdParam(raw: string | null): string {
  const value = (raw ?? "").trim();
  if (!/^\d+$/.test(value)) return "";
  return Number(value) > 0 ? value : "";
}

type FormState = {
  nome: string;
  sigla: string;
  dataCriacao: string;
};

const INITIAL: FormState = {
  nome: "",
  sigla: "",
  dataCriacao: hojeISOLocal(),
};

function lotesListUrl(fazendaId?: string) {
  return fazendaId ? `/rebanho/lotes?fazendaId=${fazendaId}` : "/rebanho/lotes";
}

type CampoObrigatorioLote = "fazenda" | "nome" | "dataCriacao";

const TOAST_ID_OBRIGATORIOS = "novo-lote-obrigatorios";

function FieldErrorMsg({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[11px] text-red-600" role="alert">
      {message}
    </p>
  );
}

export function NewLotePage() {
  const [, setLocation] = useLocation();
  const fazendaIdFromRoute = parseFazendaIdParam(
    new URLSearchParams(window.location.search).get("fazendaId"),
  );
  const fazendaLocked = Boolean(fazendaIdFromRoute);

  const [fazendaId, setFazendaId] = useState(fazendaIdFromRoute);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [erros, setErros] = useState<Partial<Record<CampoObrigatorioLote, string>>>({});

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();

  useEffect(() => {
    if (fazendaIdFromRoute) setFazendaId(fazendaIdFromRoute);
  }, [fazendaIdFromRoute]);

  const fazendaSelecionada = useMemo(
    () => fazendas.find(f => String(f.id) === fazendaId),
    [fazendas, fazendaId],
  );

  const fazendaOptions = useMemo(
    () => fazendas.map(f => ({ value: String(f.id), label: f.nome })),
    [fazendas],
  );

  const utils = trpc.useUtils();
  const createMutation = trpc.lotes.create.useMutation({
    onSuccess: () => {
      toast.success("Lote criado com sucesso!");
      utils.lotes.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      setLocation(lotesListUrl(fazendaId));
    },
    onError: e => {
      const msg = e.message || "Não foi possível criar o Lote. Tente novamente.";
      toast.error(msg);
    },
  });

  const limparErro = (campo: CampoObrigatorioLote) => {
    setErros(prev => {
      if (!prev[campo]) return prev;
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (key === "nome") limparErro("nome");
    if (key === "dataCriacao") limparErro("dataCriacao");
  };

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (createMutation.isPending) return;

    const next: Partial<Record<CampoObrigatorioLote, string>> = {};
    if (!fazendaId) next.fazenda = "Selecione a fazenda.";
    if (!form.nome.trim()) next.nome = "Nome do Lote é obrigatório.";
    if (!form.dataCriacao.trim()) next.dataCriacao = "Data de criação é obrigatória.";

    if (Object.keys(next).length > 0) {
      setErros(next);
      toast.error("Preencha os campos obrigatórios destacados.", { id: TOAST_ID_OBRIGATORIOS });
      const primeiro: CampoObrigatorioLote =
        next.fazenda ? "fazenda" : next.nome ? "nome" : "dataCriacao";
      requestAnimationFrame(() => {
        const el = document.getElementById(`novo-lote-field-${primeiro}`);
        if (el instanceof HTMLElement) {
          el.focus({ preventScroll: true });
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      return;
    }

    setErros({});
    const sigla = form.sigla.trim().toUpperCase();

    createMutation.mutate({
      nome: form.nome.trim(),
      sigla: sigla || undefined,
      dataCriacao: form.dataCriacao,
      fazendaId: Number(fazendaId),
    });
  };

  const isBusy = createMutation.isPending;

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation(lotesListUrl(fazendaId || undefined))}
        className="mb-3 flex items-center gap-0.5 text-[11px] text-gray-500"
        aria-label="Voltar"
      >
        <span className="material-icons text-[14px]">arrow_back</span>
        Voltar
      </button>

      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h1
              className="text-[20px] font-semibold text-gray-900"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              Novo Lote
            </h1>
            <p className="mt-1 text-[11px] text-gray-500">
              {fazendaLocked
                ? "Informe os dados do novo Lote."
                : "Selecione a fazenda e informe os dados do Lote."}
            </p>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex flex-row items-end gap-4">
              <div className="min-w-0 flex-1">
                <FormLabel required>Fazenda</FormLabel>
                {fazendaLocked ? (
                  <FormInput
                    id="novo-lote-field-fazenda"
                    variant="light"
                    required
                    readOnly
                    value={
                      fazendaSelecionada?.nome
                      ?? (fazendaId ? `Fazenda #${fazendaId}` : "")
                    }
                    onChange={() => {}}
                  />
                ) : (
                  <>
                    <FormNativeSelect
                      variant="light"
                      id="novo-lote-field-fazenda"
                      value={fazendaId}
                      onChange={v => {
                        setFazendaId(v);
                        limparErro("fazenda");
                      }}
                      placeholder="Selecione a Fazenda"
                      options={fazendaOptions}
                      required
                      invalid={!!erros.fazenda}
                      aria-describedby={erros.fazenda ? "novo-lote-err-fazenda" : undefined}
                    />
                    <FieldErrorMsg id="novo-lote-err-fazenda" message={erros.fazenda} />
                  </>
                )}
              </div>
              <div className="w-[11.5rem] shrink-0">
                <FormLabel required>Data de Criação</FormLabel>
                <FormDatePicker
                  id="novo-lote-field-dataCriacao"
                  value={form.dataCriacao}
                  onChange={v => set("dataCriacao", v)}
                  required
                  invalid={!!erros.dataCriacao}
                  minHeight={34}
                  aria-describedby={erros.dataCriacao ? "novo-lote-err-dataCriacao" : undefined}
                />
                <FieldErrorMsg id="novo-lote-err-dataCriacao" message={erros.dataCriacao} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Nome do Lote</FormLabel>
                <FormInput
                  id="novo-lote-field-nome"
                  variant="light"
                  required
                  value={form.nome}
                  onChange={v => set("nome", v.slice(0, NOME_MAX))}
                  placeholder="Ex. Lote de prenhas"
                  invalid={!!erros.nome}
                  aria-describedby={erros.nome ? "novo-lote-err-nome" : undefined}
                />
                <FieldErrorMsg id="novo-lote-err-nome" message={erros.nome} />
              </div>
              <div>
                <FormLabel>Sigla do Lote (opcional)</FormLabel>
                <FormInput
                  variant="light"
                  value={form.sigla}
                  onChange={v => set("sigla", v.toUpperCase().slice(0, SIGLA_MAX))}
                  onBlur={v => set("sigla", v.trim().toUpperCase().slice(0, SIGLA_MAX))}
                  placeholder="Ex. LdP1"
                />
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setLocation(lotesListUrl(fazendaId || undefined))}
              disabled={isBusy}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="inline-flex items-center justify-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />
                  Salvando...
                </>
              ) : (
                "Criar Lote"
              )}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export default NewLotePage;
