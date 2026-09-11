import { FormInput, FormLabel, FormTextarea } from "@/components/FormFields";
import { ScaleReaderControl } from "@/components/curral/ScaleReaderControl";
import { formatPesoKgParaCampo } from "@/lib/hardware/scaleProtocol";
import { formatUltimoPesoKg } from "@/lib/listaAnimaisTable";
import { trpc } from "@/lib/trpc";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  avisosDesmamaCompletos,
  dataNascimentoPorIdadeMeses,
  isAnimalElegivelParaDesmama,
  mensagemMotivoDesmama,
  MSG_DESMAMA_GENERICO,
  MSG_DESMAMA_IDADE_MESES_INVALIDA,
  MSG_DESMAMA_PESO,
  parseIdadeMesesDesmama,
  parsePesoKgDesmama,
  podeSalvarDesmama,
  precisaConfirmarDesmama,
  textosAvisoDesmama,
  toISODateOnly,
} from "@shared/desmamaManejo";
import { AlertCircle, MilkOff, Scale } from "lucide-react";
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
  /** Peso já registrado na pesagem da mesma data (fluxo Pesagem → Desmama). */
  pesoPesagemSessao?: string | null;
  onRegistrado: (payload: CurralDesmamaRegistrado) => void;
  onBloqueioNegocio: (msg: string) => void;
};

export function CurralDesmamaPanel({
  fazendaNum,
  data,
  animalId,
  animal,
  pesoPesagemSessao,
  onRegistrado,
  onBloqueioNegocio,
}: Props) {
  const confirm = useConfirm();
  const trpcUtils = trpc.useUtils();
  const [pesoKg, setPesoKg] = useState("");
  const [modoRepesar, setModoRepesar] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [idadeMesesInput, setIdadeMesesInput] = useState("");
  const pesoInputRef = useRef<HTMLInputElement>(null);

  const semNascimentoCadastrado = !toISODateOnly(animal.dataNascimento);
  const idadeMesesParsed = useMemo(
    () => (idadeMesesInput.trim() ? parseIdadeMesesDesmama(idadeMesesInput) : null),
    [idadeMesesInput],
  );
  const dataNascimentoEfetiva = useMemo(() => {
    if (!semNascimentoCadastrado) return animal.dataNascimento ?? null;
    if (idadeMesesParsed?.ok) {
      return dataNascimentoPorIdadeMeses(idadeMesesParsed.meses, data);
    }
    return null;
  }, [animal.dataNascimento, data, idadeMesesParsed, semNascimentoCadastrado]);

  const reutilizaPesagem = Boolean(pesoPesagemSessao) && !modoRepesar;
  const pesoEfetivo = reutilizaPesagem ? (pesoPesagemSessao ?? "") : pesoKg;
  const pesoPesagemFmt = useMemo(() => {
    if (!pesoPesagemSessao) return null;
    const n = Number(pesoPesagemSessao);
    return Number.isFinite(n) ? formatUltimoPesoKg(n) : pesoPesagemSessao;
  }, [pesoPesagemSessao]);

  const elegibilidade = useMemo(
    () =>
      isAnimalElegivelParaDesmama({
        status: animal.status ?? "ativo",
        dataDesmama: animal.dataDesmama,
        dataNascimento: dataNascimentoEfetiva,
        categoria: animal.categoria,
        dataEvento: data,
        fazendaAnimalId: animal.fazendaId,
        fazendaSelecionadaId: fazendaNum,
      }),
    [animal, data, dataNascimentoEfetiva, fazendaNum],
  );

  const elegivel = elegibilidade.eligible;
  const msgInelegivel = elegivel ? null : mensagemMotivoDesmama(elegibilidade.reason);
  const avisosAtivos = useMemo(
    () => (elegivel ? avisosDesmamaCompletos(elegibilidade, pesoEfetivo) : []),
    [elegibilidade, elegivel, pesoEfetivo],
  );
  const textosAviso = useMemo(
    () =>
      avisosAtivos.length > 0
        ? textosAvisoDesmama(avisosAtivos, {
            idadeMeses: elegibilidade.idadeMeses,
            pesoKg: pesoEfetivo,
          }, { animalLabel: `#${animalId}` })
        : null,
    [animalId, avisosAtivos, elegibilidade.idadeMeses, pesoEfetivo],
  );

  useEffect(() => {
    setPesoKg("");
    setModoRepesar(false);
    setObservacoes("");
    setIdadeMesesInput("");
  }, [animalId]);

  useEffect(() => {
    if (!elegivel || reutilizaPesagem) return;
    const t = window.setTimeout(() => {
      pesoInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [animalId, elegivel, reutilizaPesagem]);

  const aplicarPesoBalanca = useCallback((kg: number) => {
    setModoRepesar(true);
    setPesoKg(formatPesoKgParaCampo(kg));
    window.setTimeout(() => {
      pesoInputRef.current?.focus();
      pesoInputRef.current?.select();
    }, 30);
  }, []);

  const podeSalvar =
    elegivel &&
    podeSalvarDesmama({
      fazendaId: fazendaNum,
      animalId,
      dataDesmama: data,
      pesoKg: reutilizaPesagem ? "" : pesoKg,
    });

  const mutation = trpc.animais.registrarDesmama.useMutation({
    onSuccess: async (_result, vars) => {
      const pesoParaResumo = vars.pesoKg ?? pesoPesagemSessao ?? null;
      const pesoFmt =
        pesoParaResumo != null && pesoParaResumo !== ""
          ? formatUltimoPesoKg(Number(pesoParaResumo))
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

  const registrar = useCallback(async () => {
    if (!elegivel || !podeSalvar) return;

    let pesoEnviar: string | undefined;
    if (reutilizaPesagem) {
      pesoEnviar = undefined;
    } else {
      const pesoOk = parsePesoKgDesmama(pesoKg);
      if (!pesoOk.ok) {
        toast.error(MSG_DESMAMA_PESO);
        return;
      }
      pesoEnviar = pesoOk.peso;
    }

    if (precisaConfirmarDesmama(elegibilidade, pesoEfetivo)) {
      const avisos = avisosDesmamaCompletos(elegibilidade, pesoEfetivo);
      const textos = textosAvisoDesmama(
        avisos,
        { idadeMeses: elegibilidade.idadeMeses, pesoKg: pesoEfetivo },
        { animalLabel: `#${animalId}` },
      );
      const ok = await confirm({
        title: textos.confirmTitle,
        description: textos.confirmDescription,
        confirmText: textos.confirmText,
        cancelText: "Revisar",
        variant: "warning",
      });
      if (!ok) return;
    }

    let idadeMesesEnviar: number | undefined;
    if (semNascimentoCadastrado && idadeMesesInput.trim()) {
      const parsed = parseIdadeMesesDesmama(idadeMesesInput);
      if (!parsed.ok) {
        toast.error(MSG_DESMAMA_IDADE_MESES_INVALIDA);
        return;
      }
      idadeMesesEnviar = parsed.meses;
    }

    mutation.mutate({
      fazendaId: fazendaNum,
      animalId,
      dataDesmama: data,
      pesoKg: pesoEnviar,
      observacoes: observacoes.trim() || undefined,
      idadeMeses: idadeMesesEnviar,
    });
  }, [
    animalId,
    confirm,
    data,
    elegibilidade,
    elegivel,
    fazendaNum,
    idadeMesesInput,
    mutation,
    observacoes,
    pesoEfetivo,
    pesoKg,
    podeSalvar,
    reutilizaPesagem,
    semNascimentoCadastrado,
  ]);

  const isSaving = mutation.isPending;

  return (
    <div className="mt-4 space-y-4">
      {!elegivel && msgInelegivel ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" strokeWidth={2.25} />
          <p className="text-[12px] text-amber-900 leading-relaxed">{msgInelegivel}</p>
        </div>
      ) : null}

      {elegivel && textosAviso ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" strokeWidth={2.25} />
          <p className="text-[12px] text-amber-900 leading-relaxed">{textosAviso.banner}</p>
        </div>
      ) : null}

      {elegivel && semNascimentoCadastrado ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 space-y-2">
          <p className="text-[12px] font-semibold text-gray-900">Idade aproximada</p>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Sem data de nascimento no cadastro. Informe a idade em meses para calcular os avisos
            zootécnicos — o sistema grava a data estimada na ficha do animal.
          </p>
          <div>
            <FormLabel>Idade (meses)</FormLabel>
            <FormInput
              variant="light"
              value={idadeMesesInput}
              onChange={setIdadeMesesInput}
              inputMode="numeric"
              placeholder="Ex.: 7"
              disabled={isSaving}
              autoComplete="off"
            />
          </div>
          {idadeMesesInput.trim() && idadeMesesParsed && !idadeMesesParsed.ok ? (
            <p className="text-[11px] text-red-600">{MSG_DESMAMA_IDADE_MESES_INVALIDA}</p>
          ) : null}
        </div>
      ) : null}

      {elegivel && reutilizaPesagem && pesoPesagemFmt ? (
        <div className="rounded-xl border border-[#4ECDC4]/30 bg-[#4ECDC4]/8 px-4 py-3 space-y-2">
          <div className="flex items-start gap-2.5">
            <Scale className="h-4 w-4 shrink-0 text-[#2D5A5A] mt-0.5" strokeWidth={2.25} />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-gray-900">
                Peso da pesagem: {pesoPesagemFmt} kg
              </p>
              <p className="text-[11px] text-gray-600 leading-relaxed mt-0.5">
                Será usado na desmama — não precisa pesar de novo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModoRepesar(true)}
            disabled={isSaving}
            className="ml-6 text-[11px] font-semibold text-[#2D5A5A] underline underline-offset-2 hover:text-[#1e4545] disabled:opacity-40"
          >
            Repesar
          </button>
        </div>
      ) : null}

      {elegivel && !reutilizaPesagem ? (
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
        </>
      ) : null}

      {elegivel ? (
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
      ) : null}

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

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        {elegivel
          ? reutilizaPesagem
            ? "Ao terminar, avança para o próximo manejo ou animal. Use Troca de lote na sessão para apartar."
            : "Registre a desmama com peso opcional. Ao terminar, avança para o próximo manejo ou animal. Use Troca de lote na sessão para apartar."
          : "Este animal não pode ser desmamado aqui. Toque em Trocar para identificar outro animal."}
      </p>
    </div>
  );
}
