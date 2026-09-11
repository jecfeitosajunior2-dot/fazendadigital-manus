import { FormLabel, FormTextarea } from "@/components/FormFields";
import { ScaleReaderControl } from "@/components/curral/ScaleReaderControl";
import { formatPesoKgParaCampo } from "@/lib/hardware/scaleProtocol";
import { formatUltimoPesoKg } from "@/lib/listaAnimaisTable";
import { trpc } from "@/lib/trpc";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import {
  isAnimalElegivelParaDesmama,
  mensagemMotivoDesmama,
  MSG_DESMAMA_GENERICO,
  MSG_DESMAMA_PESO,
  parsePesoKgDesmama,
  podeSalvarDesmama,
} from "@shared/desmamaManejo";
import { AlertCircle, MilkOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const FD_PRIMARY = "#4ECDC4";

export type CurralDesmamaRegistrado = {
  animalId: number;
  resumo: string;
};

type AnimalDesmamaCurral = {
  id: number;
  status?: string | null;
  dataDesmama?: string | Date | null;
  dataNascimento?: string | null;
  categoria?: string | null;
  fazendaId?: number | null;
};

type Props = {
  fazendaNum: number;
  data: string;
  animalId: number;
  animal: AnimalDesmamaCurral;
  onRegistrado: (payload: CurralDesmamaRegistrado) => void;
  onPular: () => void;
  onBloqueioNegocio: (msg: string) => void;
  hasNextManejoNaFila: boolean;
};

export function CurralDesmamaPanel({
  fazendaNum,
  data,
  animalId,
  animal,
  onRegistrado,
  onPular,
  onBloqueioNegocio,
  hasNextManejoNaFila,
}: Props) {
  const trpcUtils = trpc.useUtils();
  const [pesoKg, setPesoKg] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const pesoInputRef = useRef<HTMLInputElement>(null);

  const elegibilidade = useMemo(
    () =>
      isAnimalElegivelParaDesmama({
        status: animal.status ?? "ativo",
        dataDesmama: animal.dataDesmama,
        dataNascimento: animal.dataNascimento,
        categoria: animal.categoria,
        dataEvento: data,
        fazendaAnimalId: animal.fazendaId,
        fazendaSelecionadaId: fazendaNum,
      }),
    [animal, data, fazendaNum],
  );

  const elegivel = elegibilidade.eligible;
  const msgInelegivel = elegivel ? null : mensagemMotivoDesmama(elegibilidade.reason);

  useEffect(() => {
    setPesoKg("");
    setObservacoes("");
  }, [animalId]);

  useEffect(() => {
    if (!elegivel) return;
    const t = window.setTimeout(() => {
      pesoInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [animalId, elegivel]);

  const aplicarPesoBalanca = useCallback((kg: number) => {
    setPesoKg(formatPesoKgParaCampo(kg));
    window.setTimeout(() => {
      pesoInputRef.current?.focus();
      pesoInputRef.current?.select();
    }, 30);
  }, []);

  const formularioPreenchido = Boolean(pesoKg.trim() || observacoes.trim());

  const podeSalvar =
    elegivel &&
    podeSalvarDesmama({
      fazendaId: fazendaNum,
      animalId,
      dataDesmama: data,
      pesoKg,
    });

  const mutation = trpc.animais.registrarDesmama.useMutation({
    onSuccess: async (_result, vars) => {
      const pesoFmt =
        vars.pesoKg != null && vars.pesoKg !== ""
          ? formatUltimoPesoKg(Number(vars.pesoKg))
          : null;
      const resumo = pesoFmt ? `${pesoFmt} kg` : "Desmama registrada";
      onRegistrado({ animalId: vars.animalId, resumo });
      await Promise.all([
        trpcUtils.animais.list.invalidate(),
        trpcUtils.animais.getById.invalidate(),
        trpcUtils.pesagens.list.invalidate(),
      ]);
    },
    onError: err => {
      const message = err.message || MSG_DESMAMA_GENERICO;
      if (isMensagemBloqueioBaixa(message)) {
        onBloqueioNegocio(message);
        return;
      }
      toast.error(message);
    },
  });

  const registrar = useCallback(() => {
    if (!elegivel || !podeSalvar) return;
    const pesoOk = parsePesoKgDesmama(pesoKg);
    if (!pesoOk.ok) {
      toast.error(MSG_DESMAMA_PESO);
      return;
    }
    mutation.mutate({
      fazendaId: fazendaNum,
      animalId,
      dataDesmama: data,
      pesoKg: pesoOk.peso,
      observacoes: observacoes.trim() || undefined,
    });
  }, [
    animalId,
    data,
    elegivel,
    fazendaNum,
    mutation,
    observacoes,
    pesoKg,
    podeSalvar,
  ]);

  const pularManejo = useCallback(() => {
    if (mutation.isPending) return;
    if (formularioPreenchido) {
      toast.error("Há dados não registrados. Registre a desmama ou limpe o formulário.");
      return;
    }
    onPular();
  }, [formularioPreenchido, mutation.isPending, onPular]);

  const isSaving = mutation.isPending;

  return (
    <div className="mt-4 space-y-4">
      {!elegivel && msgInelegivel ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" strokeWidth={2.25} />
          <p className="text-[12px] text-amber-900 leading-relaxed">{msgInelegivel}</p>
        </div>
      ) : null}

      {elegivel ? (
        <>
          <ScaleReaderControl
            variant="operacao"
            disabled={isSaving}
            onStableWeight={aplicarPesoBalanca}
          />

          <div>
            <FormLabel>Peso à desmama (kg)</FormLabel>
            <input
              ref={pesoInputRef}
              type="text"
              inputMode="decimal"
              value={pesoKg}
              onChange={e => setPesoKg(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  registrar();
                }
              }}
              placeholder="Opcional"
              disabled={isSaving}
              className="w-full text-[22px] sm:text-[26px] font-bold border border-gray-200 rounded-xl px-4 py-3 sm:py-3.5 text-gray-900 min-h-[56px] sm:min-h-[60px] text-center tracking-tight bg-white disabled:bg-gray-50"
              autoComplete="off"
            />
          </div>

          <div>
            <FormLabel>Observações</FormLabel>
            <FormTextarea
              variant="light"
              rows={2}
              value={observacoes}
              onChange={setObservacoes}
              placeholder="Opcional"
              disabled={isSaving}
            />
          </div>
        </>
      ) : null}

      <div className="space-y-2">
        {elegivel ? (
          <button
            type="button"
            onClick={registrar}
            disabled={!podeSalvar || isSaving}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full text-gray-900 text-[13px] font-bold uppercase tracking-wide min-h-[52px] hover:opacity-95 disabled:opacity-40"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <MilkOff className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            {isSaving ? "Salvando…" : "Registrar desmama"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={pularManejo}
          disabled={isSaving || (elegivel && formularioPreenchido)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-gray-300 bg-white text-gray-800 text-[13px] font-bold uppercase tracking-wide min-h-[48px] hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {hasNextManejoNaFila ? "Pular e próximo manejo" : "Pular animal"}
        </button>
      </div>

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        {elegivel
          ? "Registre a desmama com peso opcional. Balança conectada preenche automaticamente. Pule se este animal não desmama nesta passagem."
          : "Este animal não pode ser desmamado aqui. Pule para continuar a sessão."}
      </p>
    </div>
  );
}
