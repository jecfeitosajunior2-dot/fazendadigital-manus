/**
 * Formulário de Novo Lote
 * Rota: /rebanho/novo-lote
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { ChevronDown, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FD_PRIMARY,
  FieldBox,
  FormLabel,
  FormDatePicker,
  inputClass,
} from "@/components/FormFields";
import { cn } from "@/lib/utils";

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

export function NewLotePage() {
  const [, setLocation] = useLocation();
  const fazendaIdFromRoute = parseFazendaIdParam(
    new URLSearchParams(window.location.search).get("fazendaId"),
  );
  const fazendaLocked = Boolean(fazendaIdFromRoute);

  const [fazendaId, setFazendaId] = useState(fazendaIdFromRoute);
  const [form, setForm] = useState<FormState>(INITIAL);

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();

  useEffect(() => {
    if (fazendaIdFromRoute) setFazendaId(fazendaIdFromRoute);
  }, [fazendaIdFromRoute]);

  const fazendaSelecionada = useMemo(
    () => fazendas.find(f => String(f.id) === fazendaId),
    [fazendas, fazendaId],
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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (createMutation.isPending) return;

    if (!fazendaId) {
      toast.error("Selecione uma fazenda antes de criar o Lote.");
      return;
    }

    const nome = form.nome.trim();
    if (!nome) {
      toast.error("Nome do Lote é obrigatório");
      return;
    }

    if (!form.dataCriacao) {
      toast.error("Data de criação é obrigatória");
      return;
    }

    const sigla = form.sigla.trim().toUpperCase();

    createMutation.mutate({
      nome,
      sigla: sigla || undefined,
      dataCriacao: form.dataCriacao,
      fazendaId: Number(fazendaId),
    });
  };

  const isBusy = createMutation.isPending;

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto">
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-100">
            <h1 className="text-[15px] font-semibold text-gray-900">Novo Lote</h1>
            <p className="text-[11px] text-gray-500 mt-1">
              {fazendaLocked
                ? "Informe os dados do novo Lote."
                : "Selecione a fazenda e informe os dados do Lote."}
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div>
              <FormLabel required>Fazenda</FormLabel>
              {fazendaLocked ? (
                <FieldBox required className="bg-gray-50">
                  <div
                    className={cn(inputClass, "min-h-[42px] flex items-center text-gray-700")}
                    aria-readonly="true"
                  >
                    {fazendaSelecionada?.nome
                      ?? (fazendaId ? `Fazenda #${fazendaId}` : "—")}
                  </div>
                </FieldBox>
              ) : (
                <FieldBox required variant="light">
                  <div className="relative">
                    <select
                      value={fazendaId}
                      onChange={e => setFazendaId(e.target.value)}
                      required
                      aria-label="Fazenda"
                      className={cn(
                        inputClass,
                        "appearance-none cursor-pointer w-full min-h-[42px] pr-10 bg-white",
                      )}
                    >
                      <option value="">Selecione a fazenda</option>
                      {fazendas.map(f => (
                        <option key={f.id} value={String(f.id)}>
                          {f.nome}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 opacity-70"
                      aria-hidden
                    />
                  </div>
                </FieldBox>
              )}
            </div>

            <div>
              <FormLabel required>Nome do Lote</FormLabel>
              <FieldBox required variant="light">
                <input
                  type="text"
                  value={form.nome}
                  onChange={e => set("nome", e.target.value)}
                  placeholder="Ex. Lote de prenhas"
                  required
                  maxLength={NOME_MAX}
                  className={cn(inputClass, "bg-white min-h-[42px]")}
                />
              </FieldBox>
            </div>

            <div>
              <FormLabel>Sigla do Lote (opcional)</FormLabel>
              <FieldBox variant="light">
                <input
                  type="text"
                  value={form.sigla}
                  onChange={e => set("sigla", e.target.value.toUpperCase())}
                  onBlur={e => set("sigla", e.target.value.trim().toUpperCase())}
                  placeholder="Ex. LdP1"
                  maxLength={SIGLA_MAX}
                  className={cn(inputClass, "bg-white min-h-[42px]")}
                />
              </FieldBox>
            </div>

            <div>
              <FormLabel required>Data de Criação</FormLabel>
              <FormDatePicker
                value={form.dataCriacao}
                onChange={v => set("dataCriacao", v)}
                required
              />
            </div>

            {fazendaSelecionada && (
              <p className="text-[11px] text-gray-500">
                Vinculado a:{" "}
                <span className="font-medium text-gray-700">{fazendaSelecionada.nome}</span>
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
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
              className="inline-flex items-center justify-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
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
        </form>
      </div>
    </AppLayout>
  );
}

export default NewLotePage;
