import { FormInput, FormLabel, FormTextarea } from "@/components/FormFields";
import { curralResultadoToggleGridClass } from "@/lib/curralReprodutivoUi";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import {
  labelMetodoCastracao,
  METODOS_CASTRACAO,
  MSG_CASTRACAO_GENERICO,
  podeSalvarCastracao,
  validarAnimalParaCastracao,
  type MetodoCastracao,
} from "@shared/castracaoManejo";
import { AlertCircle, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const FD_PRIMARY = "#4ECDC4";

export type CurralCastracaoRegistrado = {
  animalId: number;
  resumo: string;
};

type AnimalCastracaoCurral = {
  id: number;
  sexo?: string | null;
  status?: string | null;
  castrado?: boolean | number | null;
};

type Props = {
  fazendaNum: number;
  data: string;
  animalId: number;
  animal: AnimalCastracaoCurral;
  onRegistrado: (payload: CurralCastracaoRegistrado) => void;
  onBloqueioNegocio: (msg: string) => void;
};

function isMetodo(value: string): value is MetodoCastracao {
  return METODOS_CASTRACAO.some(m => m.value === value);
}

export function CurralCastracaoPanel({
  fazendaNum,
  data,
  animalId,
  animal,
  onRegistrado,
  onBloqueioNegocio,
}: Props) {
  const trpcUtils = trpc.useUtils();
  const [metodo, setMetodo] = useState("");
  const [descricaoMetodo, setDescricaoMetodo] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const metodoOutro = metodo === "outro";

  const elegibilidade = useMemo(
    () =>
      validarAnimalParaCastracao({
        sexo: animal.sexo,
        status: animal.status ?? "ativo",
        castrado: animal.castrado,
      }),
    [animal.castrado, animal.sexo, animal.status],
  );

  const elegivel = elegibilidade.ok;

  useEffect(() => {
    setMetodo("");
    setDescricaoMetodo("");
    setObservacoes("");
  }, [animalId]);

  const podeSalvar =
    elegivel &&
    podeSalvarCastracao({
      fazendaId: fazendaNum,
      animalId,
      dataCastracao: data,
      metodo,
      descricaoMetodo,
    });

  const mutation = trpc.saude.registrarCastracao.useMutation({
    onSuccess: async (_result, vars) => {
      const resumo = labelMetodoCastracao(vars.metodo);
      onRegistrado({ animalId: vars.animalId, resumo });
      await Promise.all([
        trpcUtils.animais.list.invalidate(),
        trpcUtils.animais.getById.invalidate(),
        trpcUtils.saude.list.invalidate(),
      ]);
    },
    onError: err => {
      const message = err.message || MSG_CASTRACAO_GENERICO;
      if (isMensagemBloqueioBaixa(message)) {
        onBloqueioNegocio(message);
        return;
      }
      toast.error(message);
    },
  });

  const registrar = useCallback(() => {
    if (!elegivel || !podeSalvar || !isMetodo(metodo)) return;
    mutation.mutate({
      fazendaId: fazendaNum,
      animalId,
      dataCastracao: data,
      metodo,
      descricaoMetodo: metodoOutro ? descricaoMetodo.trim() : undefined,
      observacoes: observacoes.trim() || undefined,
    });
  }, [
    animalId,
    data,
    descricaoMetodo,
    elegivel,
    fazendaNum,
    metodo,
    metodoOutro,
    mutation,
    observacoes,
    podeSalvar,
  ]);

  const isSaving = mutation.isPending;

  return (
    <div className="mt-4 space-y-4">
      {!elegivel ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" strokeWidth={2.25} />
          <p className="text-[12px] text-amber-900 leading-relaxed">{elegibilidade.message}</p>
        </div>
      ) : null}

      {elegivel ? (
        <>
          <div>
            <FormLabel required>Método</FormLabel>
            <div
              className={cn(
                "grid gap-2 mt-1.5",
                curralResultadoToggleGridClass(METODOS_CASTRACAO.length),
              )}
            >
              {METODOS_CASTRACAO.map(opcao => (
                <button
                  key={opcao.value}
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    const next = metodo === opcao.value ? "" : opcao.value;
                    setMetodo(next);
                    if (next !== "outro") setDescricaoMetodo("");
                  }}
                  className={cn(
                    "rounded-xl border px-2 py-4 min-h-[52px] text-[13px] font-semibold leading-snug transition-colors",
                    metodo === opcao.value
                      ? "border-[#4ECDC4] bg-[#4ECDC4]/10 text-gray-900"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
                    isSaving && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {opcao.label}
                </button>
              ))}
            </div>
          </div>

          {metodoOutro ? (
            <div>
              <FormLabel required>Descrição do método</FormLabel>
              <FormInput
                value={descricaoMetodo}
                onChange={setDescricaoMetodo}
                placeholder="Ex.: técnica utilizada"
                variant="light"
                required
                disabled={isSaving}
              />
            </div>
          ) : null}

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

      {elegivel ? (
        <button
          type="button"
          onClick={registrar}
          disabled={!podeSalvar || isSaving}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full text-gray-900 text-[13px] font-bold uppercase tracking-wide min-h-[52px] hover:opacity-95 disabled:opacity-40"
          style={{ backgroundColor: FD_PRIMARY }}
        >
          <Stethoscope className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
          {isSaving ? "Salvando…" : "Registrar castração"}
        </button>
      ) : null}

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        {elegivel
          ? "Registre a castração do macho. Ao terminar, avança automaticamente para o próximo manejo ou animal."
          : "Este animal não pode ser castrado aqui. Toque em Trocar para identificar outro animal."}
      </p>
    </div>
  );
}
