import { FormLabel, FormSelect } from "@/components/FormFields";
import {
  NovoLoteRapidoDialog,
  NovoLoteRapidoTrigger,
} from "@/components/lotes/NovoLoteRapidoDialog";
import { SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import {
  assertDataMovimentacaoNaoFutura,
  filtrarLotesDestinoTroca,
  formatLoteAtualDisplay,
  formatLinhaMovimentacaoTrocaLote,
  isMesmoLoteDestino,
  labelLoteDestinoComPasto,
  MSG_TROCA_LOTE_GENERICO,
  MSG_TROCA_LOTE_MESMO_LOTE,
  podeSalvarTrocaLote,
} from "@shared/transferirAnimaisEntreLotes";
import { ArrowLeftRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const FD_PRIMARY = "#4ECDC4";

type LoteDestinoOpt = {
  id: number;
  nome: string;
  fazendaId?: number | null;
  ativo?: boolean | null;
  pastoNome?: string | null;
};

export type CurralTrocaLoteRegistrado = {
  animalId: number;
  resumo: string;
  novoLoteId: number;
  novoLoteNome: string;
};

type CurralTrocaLotePanelProps = {
  fazendaNum: number;
  fazendaNome?: string | null;
  data: string;
  animalId: number;
  loteAtualId?: number | null;
  loteAtualNome?: string | null;
  pastoAtualNome?: string | null;
  lotes: LoteDestinoOpt[];
  /** Salva no histórico e avança fila / próximo animal (como pesagem). */
  onRegistrado: (payload: CurralTrocaLoteRegistrado) => void;
  onBloqueioNegocio: (msg: string) => void;
  hasNextManejoNaFila: boolean;
};

export function CurralTrocaLotePanel({
  fazendaNum,
  fazendaNome,
  data,
  animalId,
  loteAtualId: loteAtualIdProp,
  loteAtualNome,
  pastoAtualNome,
  lotes,
  onRegistrado,
  onBloqueioNegocio,
  hasNextManejoNaFila,
}: CurralTrocaLotePanelProps) {
  const trpcUtils = trpc.useUtils();
  const [loteDestinoId, setLoteDestinoId] = useState("");
  const [novoLoteDialogAberto, setNovoLoteDialogAberto] = useState(false);

  const loteAtualId =
    loteAtualIdProp != null && loteAtualIdProp > 0 ? loteAtualIdProp : null;

  const loteAtualDisplay = useMemo(
    () =>
      formatLoteAtualDisplay({
        temLote: loteAtualId != null,
        loteNome: loteAtualNome,
        pastoNome: pastoAtualNome,
      }),
    [loteAtualId, loteAtualNome, pastoAtualNome],
  );

  useEffect(() => {
    setLoteDestinoId("");
  }, [animalId]);

  const lotesDestino = useMemo(() => {
    if (!fazendaNum) return [];
    return filtrarLotesDestinoTroca(lotes, {
      fazendaAnimalId: fazendaNum,
      loteAtualId,
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lotes, fazendaNum, loteAtualId]);

  const destinoOptions = useMemo(
    () =>
      lotesDestino.map(l => ({
        value: String(l.id),
        label: labelLoteDestinoComPasto(l.nome, l.pastoNome),
      })),
    [lotesDestino],
  );

  const loteDestino = useMemo(
    () => lotesDestino.find(l => String(l.id) === loteDestinoId) ?? null,
    [lotesDestino, loteDestinoId],
  );

  useEffect(() => {
    if (!loteDestinoId) return;
    if (!loteDestino) setLoteDestinoId("");
  }, [loteDestinoId, loteDestino]);

  const destinoIdNum = loteDestino?.id ?? null;

  const podeSalvar =
    podeSalvarTrocaLote({
      fazendaId: fazendaNum || null,
      animalId,
      dataMovimentacao: data,
      loteDestinoId: destinoIdNum,
      loteAtualId,
    }) && Boolean(loteDestino);

  const mutation = trpc.lotes.movimentarAnimais.useMutation({
    onSuccess: async (result, vars) => {
      const resumo = formatLinhaMovimentacaoTrocaLote({
        loteOrigemId: loteAtualId,
        loteOrigemNome: loteAtualNome,
        loteDestinoNome: result.loteDestinoNome,
      });
      onRegistrado({
        animalId: vars.animalIds[0]!,
        resumo,
        novoLoteId: vars.loteDestinoId,
        novoLoteNome: result.loteDestinoNome,
      });
      await Promise.all([
        trpcUtils.animais.list.invalidate(),
        trpcUtils.animais.getById.invalidate(),
        trpcUtils.lotes.list.invalidate(),
        trpcUtils.lotes.gerenciamento.invalidate(),
      ]);
    },
    onError: err => {
      const message = err.message || MSG_TROCA_LOTE_GENERICO;
      if (isMensagemBloqueioBaixa(message)) {
        onBloqueioNegocio(message);
        return;
      }
      toast.error(message);
    },
  });

  const registrar = useCallback(() => {
    if (!fazendaNum) {
      toast.error("Aguardando contexto da sessão.");
      return;
    }
    if (!data) {
      toast.error("Informe a data da sessão.");
      return;
    }
    const dataCheck = assertDataMovimentacaoNaoFutura(data);
    if (!dataCheck.ok) {
      onBloqueioNegocio(dataCheck.message);
      return;
    }
    if (!loteDestino) {
      toast.error("Selecione o lote de destino.");
      return;
    }
    if (isMesmoLoteDestino(loteAtualId, loteDestino.id)) {
      toast.error(MSG_TROCA_LOTE_MESMO_LOTE);
      return;
    }

    mutation.mutate({
      animalIds: [animalId],
      loteDestinoId: loteDestino.id,
      dataMovimentacao: data,
    });
  }, [
    animalId,
    data,
    fazendaNum,
    loteAtualId,
    loteDestino,
    mutation,
    onBloqueioNegocio,
  ]);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Lote atual
        </p>
        <p className="text-[14px] font-semibold text-gray-900 mt-0.5">{loteAtualDisplay.titulo}</p>
        {loteAtualDisplay.subtitulo ? (
          <p className="text-[11px] text-gray-500 mt-0.5">{loteAtualDisplay.subtitulo}</p>
        ) : null}
      </div>

      <div>
        <FormLabel required>Lote de destino</FormLabel>
        {destinoOptions.length === 0 ? (
          <p className="text-[12px] text-gray-500 mt-1">
            Nenhum outro lote ativo disponível nesta fazenda.
          </p>
        ) : (
          <FormSelect
            variant="light"
            value={loteDestinoId}
            onChange={setLoteDestinoId}
            placeholder="Selecione o lote de destino"
            required
            disabled={mutation.isPending}
          >
            {destinoOptions.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-[12px]">
                {o.label}
              </SelectItem>
            ))}
          </FormSelect>
        )}
        <NovoLoteRapidoTrigger
          onClick={() => setNovoLoteDialogAberto(true)}
          disabled={!fazendaNum || mutation.isPending}
        />
      </div>

      <NovoLoteRapidoDialog
        open={novoLoteDialogAberto}
        onOpenChange={setNovoLoteDialogAberto}
        fazendaId={fazendaNum}
        fazendaNome={fazendaNome}
        dataCriacao={data}
        onCreated={({ id }) => setLoteDestinoId(String(id))}
      />

      <button
        type="button"
        onClick={registrar}
        disabled={!podeSalvar || mutation.isPending || destinoOptions.length === 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full text-gray-900 text-[13px] font-bold uppercase tracking-wide min-h-[52px] hover:opacity-95 disabled:opacity-40"
        style={{ backgroundColor: FD_PRIMARY }}
      >
        <ArrowLeftRight className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        {mutation.isPending ? "Salvando…" : "Registrar troca"}
      </button>

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        {hasNextManejoNaFila
          ? "Registrar troca avança para o próximo manejo deste animal."
          : "Registrar troca prepara o próximo animal."}
      </p>
    </div>
  );
}
