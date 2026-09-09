import { At05RfidReaderControl } from "@/components/At05RfidReaderControl";
import type { At05ReaderSession } from "@/hooks/useAt05Reader";
import { BrincoNumpadField } from "@/components/curral/BrincoNumpadField";
import { FormInput, FormLabel, FormSelect } from "@/components/FormFields";
import { cn } from "@/lib/utils";
import { SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import { Tag } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const FD_PRIMARY = "#4ECDC4";
const MSG_IDENTIFICACAO_DATA_FUTURA = "A data da identificação não pode ser futura.";

const MOTIVO_TROCA_VALUES = [
  "perda",
  "danificado",
  "reidentificacao",
  "erro_cadastro",
  "outro",
] as const;

type MotivoTrocaBrinco = (typeof MOTIVO_TROCA_VALUES)[number];
type OperacaoBrinco = "rfid" | "brinco" | "ambos";

function motivosPorOperacao(
  operacao: OperacaoBrinco,
): ReadonlyArray<{ value: MotivoTrocaBrinco; label: string }> {
  if (operacao === "rfid") {
    return [
      { value: "perda", label: "Perda do RFID" },
      { value: "danificado", label: "RFID danificado" },
      { value: "reidentificacao", label: "Reidentificação" },
      { value: "erro_cadastro", label: "Erro de cadastro" },
      { value: "outro", label: "Outro" },
    ];
  }
  if (operacao === "ambos") {
    return [
      { value: "perda", label: "Perda da identificação" },
      { value: "danificado", label: "Identificação danificada" },
      { value: "reidentificacao", label: "Reidentificação" },
      { value: "erro_cadastro", label: "Erro de cadastro" },
      { value: "outro", label: "Outro" },
    ];
  }
  return [
    { value: "perda", label: "Perda do brinco" },
    { value: "danificado", label: "Brinco danificado" },
    { value: "reidentificacao", label: "Reidentificação" },
    { value: "erro_cadastro", label: "Erro de cadastro" },
    { value: "outro", label: "Outro" },
  ];
}

function isBloqueioNegocioIdentificacao(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("já existe um animal ativo com o brinco visual") ||
    m.includes("já está sendo usado por outro animal ativo") ||
    m.includes("rfid já está vinculado") ||
    m.includes("rfid já foi vinculado") ||
    m.includes("não pode ser reutilizado") ||
    m.includes("data da identificação não pode ser futura")
  );
}

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function labelOperacaoBrinco(operacao: OperacaoBrinco, temRfidAtual: boolean): string {
  if (operacao === "brinco") return "Trocar brinco visual";
  if (operacao === "rfid") return temRfidAtual ? "Trocar RFID" : "Vincular RFID";
  return temRfidAtual
    ? "Trocar brinco visual e RFID"
    : "Trocar brinco visual e vincular RFID";
}

function montarResumoIdentificacao(params: {
  operacao: OperacaoBrinco;
  temRfidAtual: boolean;
  novoRfid?: string;
  novoBrinco?: string;
}): string {
  const partes: string[] = [labelOperacaoBrinco(params.operacao, params.temRfidAtual)];
  if (params.novoRfid?.trim()) partes.push(`RFID ${params.novoRfid.trim()}`);
  if (params.novoBrinco?.trim()) partes.push(`Brinco ${params.novoBrinco.trim()}`);
  return partes.join(" · ");
}

export type CurralBrincoRegistrado = {
  animalId: number;
  resumo: string;
  novoRfid?: string | null;
  novoBrinco?: string | null;
};

type CurralBrincoEletronicoPanelProps = {
  fazendaNum: number;
  data: string;
  animalId: number;
  brincoAtual?: string | null;
  rfidAtual?: string | null;
  onRegistrado: (payload: CurralBrincoRegistrado) => void;
  onBloqueioNegocio: (msg: string) => void;
  hasNextManejoNaFila: boolean;
  /** Sessão serial compartilhada da Sessão no curral (escuta contínua). */
  at05Session?: At05ReaderSession;
  bindAt05ReadHandler?: (handler: (rfid: string) => void) => () => void;
};

export function CurralBrincoEletronicoPanel({
  fazendaNum,
  data,
  animalId,
  brincoAtual,
  rfidAtual,
  onRegistrado,
  onBloqueioNegocio,
  hasNextManejoNaFila,
  at05Session,
  bindAt05ReadHandler,
}: CurralBrincoEletronicoPanelProps) {
  const escutaContinuaCurral = Boolean(at05Session && bindAt05ReadHandler);
  const trpcUtils = trpc.useUtils();
  const [operacao, setOperacao] = useState<OperacaoBrinco | "">("");
  const [novoRfid, setNovoRfid] = useState("");
  const [novoBrinco, setNovoBrinco] = useState("");
  const [motivo, setMotivo] = useState<MotivoTrocaBrinco | "">("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [motivoExpandido, setMotivoExpandido] = useState(false);
  const [rfidLookupBusy, setRfidLookupBusy] = useState(false);

  const rfidAtualTrim = rfidAtual?.trim() || "";
  const brincoAtualTrim = brincoAtual?.trim() || "";
  const temRfidAtual = Boolean(rfidAtualTrim);

  const limparFormulario = useCallback(() => {
    setOperacao("");
    setNovoRfid("");
    setNovoBrinco("");
    setMotivo("");
    setMotivoOutro("");
    setMotivoExpandido(false);
  }, []);

  useEffect(() => {
    limparFormulario();
  }, [animalId, limparFormulario]);

  const mostraNovoRfid = operacao === "rfid" || operacao === "ambos";
  const mostraNovoBrinco = operacao === "brinco" || operacao === "ambos";
  const exigeMotivo = Boolean(operacao);

  const opcoesOperacao = useMemo(
    () => [
      { value: "brinco", label: "Trocar brinco visual" },
      {
        value: "rfid",
        label: temRfidAtual ? "Trocar RFID" : "Vincular RFID",
      },
      {
        value: "ambos",
        label: temRfidAtual
          ? "Trocar brinco visual e RFID"
          : "Trocar brinco visual e vincular RFID",
      },
    ],
    [temRfidAtual],
  );

  const motivoOptions = useMemo(
    () => (operacao ? motivosPorOperacao(operacao) : []),
    [operacao],
  );

  const motivoLabelAtual = useMemo(() => {
    if (!operacao || !motivo) return null;
    return motivoOptions.find(m => m.value === motivo)?.label ?? motivo;
  }, [motivo, motivoOptions, operacao]);

  const aplicarOperacao = useCallback((next: OperacaoBrinco | "") => {
    setOperacao(next);
    setNovoRfid("");
    setNovoBrinco("");
    setMotivo(next ? "reidentificacao" : "");
    setMotivoOutro("");
    setMotivoExpandido(false);
  }, []);

  const validarNovoRfid = useCallback(
    async (rfid: string): Promise<boolean> => {
      const trimmed = rfid.trim();
      if (!trimmed) return false;

      if (rfidAtualTrim && trimmed === rfidAtualTrim) {
        toast.error("O novo RFID é igual ao RFID atual. Não é necessário trocar.");
        return false;
      }

      setRfidLookupBusy(true);
      try {
        const linked = await trpcUtils.animais.getByBrincoEletronicoExact.fetch({
          brincoEletronico: trimmed,
        });

        if (linked && Number(linked.id) !== animalId) {
          const status = (linked.status ?? "").toString().trim().toLowerCase();
          const msg =
            status === "ativo"
              ? "Este RFID já está vinculado a outro animal ativo nesta fazenda."
              : "Este RFID já foi vinculado a outro animal e não pode ser reutilizado.";
          onBloqueioNegocio(msg);
          return false;
        }

        if (linked && Number(linked.id) === animalId) {
          toast.error("O novo RFID é igual ao RFID atual. Não é necessário trocar.");
          return false;
        }

        return true;
      } catch (error) {
        const err = error as Error;
        toast.error(err?.message || "Falha ao validar o novo RFID.");
        return false;
      } finally {
        setRfidLookupBusy(false);
      }
    },
    [animalId, onBloqueioNegocio, rfidAtualTrim, trpcUtils],
  );

  const handleNovoRfidRead = useCallback(
    async (rfid: string) => {
      const ok = await validarNovoRfid(rfid);
      if (ok) setNovoRfid(rfid);
    },
    [validarNovoRfid],
  );

  const saveMutation = trpc.manejo.registrarPontualBrinco.useMutation({
    onSuccess: (_result, vars) => {
      const resumo = montarResumoIdentificacao({
        operacao: vars.operacao,
        temRfidAtual,
        novoRfid: vars.novoRfid,
        novoBrinco: vars.novoBrinco,
      });
      onRegistrado({
        animalId: vars.animalId,
        resumo,
        novoRfid: vars.novoRfid ?? null,
        novoBrinco: vars.novoBrinco ?? null,
      });
      void trpcUtils.animais.list.invalidate();
      void trpcUtils.animais.getById.invalidate({ id: vars.animalId });
    },
    onError: err => {
      const msg = err.message || "Não foi possível salvar a identificação.";
      if (isBloqueioNegocioIdentificacao(msg) || isMensagemBloqueioBaixa(msg)) {
        onBloqueioNegocio(isMensagemBloqueioBaixa(msg) ? msg : msg);
        return;
      }
      toast.error(msg);
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
    if (data > todayISODate()) {
      onBloqueioNegocio(MSG_IDENTIFICACAO_DATA_FUTURA);
      return;
    }
    if (!operacao) {
      toast.error("Selecione a operação.");
      return;
    }
    if (mostraNovoRfid && !novoRfid.trim()) {
      toast.error("Informe o novo RFID.");
      return;
    }
    if (mostraNovoRfid && rfidAtualTrim && novoRfid.trim() === rfidAtualTrim) {
      toast.error("O novo RFID é igual ao RFID atual. Não é necessário trocar.");
      return;
    }
    if (mostraNovoBrinco && !novoBrinco.trim()) {
      toast.error("Informe o novo brinco.");
      return;
    }
    if (exigeMotivo && !motivo) {
      toast.error("Informe o motivo da troca de identificação.");
      return;
    }
    if (exigeMotivo && motivo === "outro" && !motivoOutro.trim()) {
      toast.error("Informe o motivo da alteração.");
      return;
    }

    saveMutation.mutate({
      fazendaId: fazendaNum,
      data,
      animalId,
      operacao,
      novoRfid: mostraNovoRfid ? novoRfid.trim() : undefined,
      novoBrinco: mostraNovoBrinco ? novoBrinco.trim() : undefined,
      motivo: exigeMotivo && motivo ? motivo : undefined,
      motivoDetalhe: exigeMotivo && motivo === "outro" ? motivoOutro.trim() : undefined,
    });
  }, [
    animalId,
    data,
    exigeMotivo,
    fazendaNum,
    motivo,
    motivoOutro,
    mostraNovoBrinco,
    mostraNovoRfid,
    novoBrinco,
    novoRfid,
    onBloqueioNegocio,
    operacao,
    rfidAtualTrim,
    saveMutation,
  ]);

  const registroBloqueado =
    saveMutation.isPending ||
    rfidLookupBusy ||
    !operacao ||
    (mostraNovoRfid && !novoRfid.trim()) ||
    (mostraNovoBrinco && !novoBrinco.trim()) ||
    (exigeMotivo && !motivo) ||
    (exigeMotivo && motivo === "outro" && !motivoOutro.trim());

  const bastaoStatusLinha = (() => {
    if (!mostraNovoRfid) return null;
    if (rfidLookupBusy) return "Validando RFID…";
    if (escutaContinuaCurral && at05Session?.sessionActive) {
      return "Bastão conectado — bipe a nova tag para preencher o RFID.";
    }
    if (escutaContinuaCurral) {
      return "Conecte o bastão no topo da sessão ou use o link abaixo.";
    }
    return "Use o bastão ou digite o RFID manualmente.";
  })();

  const rfidDisplayHint = escutaContinuaCurral
    ? "Bipe a nova tag no bastão"
    : "Informe ou leia com o bastão";

  return (
    <div className="mt-4 space-y-4">
      <p className="text-[11px] text-gray-600 leading-relaxed">
        <span className="font-semibold text-gray-800">Atual:</span> brinco{" "}
        {brincoAtualTrim || "—"}
        {" · "}
        RFID{" "}
        <span className="tabular-nums">{rfidAtualTrim || "não vinculado"}</span>
      </p>

      <div>
        <FormLabel required>Operação</FormLabel>
        <FormSelect
          variant="light"
          value={operacao}
          onChange={v => aplicarOperacao(v as OperacaoBrinco | "")}
          placeholder="Selecione a operação"
          required
          disabled={saveMutation.isPending}
        >
          {opcoesOperacao.map(o => (
            <SelectItem key={o.value} value={o.value} className="text-[12px]">
              {o.label}
            </SelectItem>
          ))}
        </FormSelect>
      </div>

      {mostraNovoBrinco || mostraNovoRfid ? (
        <div
          className={cn(
            "gap-4",
            mostraNovoBrinco && mostraNovoRfid
              ? "grid grid-cols-1 md:grid-cols-2 md:items-start"
              : "space-y-4",
          )}
        >
          {mostraNovoBrinco ? (
            <div className="min-w-0">
              <FormLabel required>Novo brinco visual</FormLabel>
              <BrincoNumpadField
                value={novoBrinco}
                onChange={setNovoBrinco}
                onConfirm={() => undefined}
                disabled={saveMutation.isPending}
                compact
                showConfirm={false}
                emptyHint="Digite o novo brinco visual"
              />
            </div>
          ) : null}

          {mostraNovoRfid ? (
            <div className="min-w-0 space-y-2">
              <FormLabel required>Novo RFID</FormLabel>
              <div
                className={cn(
                  "rounded-xl border-2 px-3 py-3 text-center min-h-[56px] flex items-center justify-center",
                  novoRfid
                    ? "border-[#4ECDC4]/50 bg-[#4ECDC4]/[0.04]"
                    : "border-gray-200 bg-gray-50",
                )}
                aria-live="polite"
              >
                <span
                  className={cn(
                    "break-all tabular-nums",
                    novoRfid
                      ? "text-[15px] sm:text-[17px] font-bold text-gray-900 leading-snug"
                      : "text-[12px] text-gray-400 font-medium leading-snug px-1",
                  )}
                >
                  {novoRfid || rfidDisplayHint}
                </span>
              </div>
              <FormInput
                variant="light"
                value={novoRfid}
                onChange={setNovoRfid}
                placeholder="Digitar RFID manualmente (opcional)"
                maxLength={80}
                disabled={saveMutation.isPending || rfidLookupBusy}
                className="text-[12px] h-9"
              />
              <At05RfidReaderControl
                variant="embedded"
                mode={escutaContinuaCurral ? "identificar" : "cadastro"}
                continuous={escutaContinuaCurral}
                currentValue={novoRfid}
                disabled={saveMutation.isPending || rfidLookupBusy}
                onRfidRead={rfid => void handleNovoRfidRead(rfid)}
                session={at05Session}
                bindReadHandler={bindAt05ReadHandler}
              />
              {bastaoStatusLinha ? (
                <p className="text-[10px] text-gray-400 leading-snug" aria-live="polite">
                  {bastaoStatusLinha}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {exigeMotivo && !motivoExpandido ? (
        <p className="text-[11px] text-gray-500 text-center">
          Motivo:{" "}
          <span className="font-semibold text-gray-700">{motivoLabelAtual ?? "Reidentificação"}</span>
          {" · "}
          <button
            type="button"
            onClick={() => setMotivoExpandido(true)}
            disabled={saveMutation.isPending}
            className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-900 disabled:opacity-40"
          >
            Alterar
          </button>
        </p>
      ) : null}

      {exigeMotivo && motivoExpandido ? (
        <div className="space-y-3">
          <div>
            <FormLabel required>Motivo</FormLabel>
            <FormSelect
              variant="light"
              value={motivo}
              onChange={v => {
                setMotivo(v as MotivoTrocaBrinco | "");
                if (v !== "outro") setMotivoOutro("");
              }}
              placeholder="Selecione o motivo"
              required
              disabled={saveMutation.isPending}
            >
              {motivoOptions.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-[12px]">
                  {o.label}
                </SelectItem>
              ))}
            </FormSelect>
          </div>
          {motivo === "outro" ? (
            <div>
              <FormLabel required>Descreva o motivo</FormLabel>
              <FormInput
                variant="light"
                value={motivoOutro}
                onChange={setMotivoOutro}
                placeholder="Informe o motivo"
                disabled={saveMutation.isPending}
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setMotivo("reidentificacao");
              setMotivoOutro("");
              setMotivoExpandido(false);
            }}
            disabled={saveMutation.isPending}
            className="w-full text-[11px] font-semibold text-gray-500 underline"
          >
            Usar Reidentificação (padrão)
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={registrar}
        disabled={registroBloqueado}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full text-gray-900 text-[13px] font-bold uppercase tracking-wide min-h-[52px] hover:opacity-95 disabled:opacity-40"
        style={{ backgroundColor: FD_PRIMARY }}
      >
        <Tag className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        {saveMutation.isPending ? "Salvando…" : "Registrar identificação"}
      </button>

      {operacao ? (
        <p className="text-[10px] text-gray-400 text-center leading-relaxed">
          {hasNextManejoNaFila
            ? "Registrar avança para o próximo manejo deste animal."
            : "Registrar prepara o próximo animal."}
        </p>
      ) : null}
    </div>
  );
}
