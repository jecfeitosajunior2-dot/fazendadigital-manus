import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatDataResumo,
  formatItensLabel,
  formatValorResumo,
  type MovimentacaoResumo,
} from "@/lib/movimentacao-resumo";
import { formatQuantidadeMov } from "@/lib/produto-types";
import { trpc } from "@/lib/trpc";

const MOTIVOS_ESTORNO = [
  "Lançamento duplicado",
  "Quantidade incorreta",
  "Produto incorreto",
  "Nota fiscal cancelada",
  "Movimentação registrada na fazenda errada",
  "Outro",
] as const;

type Props = {
  open: boolean;
  resumo: MovimentacaoResumo | null;
  /** Quando false, a movimentação é de consumo direto (só histórico/custo). */
  alteraSaldo?: boolean;
  onClose: () => void;
  onConfirm: (payload: { motivo: string; observacao?: string }) => void | Promise<void>;
  submitting?: boolean;
  /** Erro vindo do backend após tentativa (mantém o modal aberto). */
  submitError?: string | null;
  onClearSubmitError?: () => void;
};

export default function EstornarMovimentacaoDialog({
  open,
  resumo,
  alteraSaldo = true,
  onClose,
  onConfirm,
  submitting = false,
  submitError = null,
  onClearSubmitError,
}: Props) {
  const [motivoSelect, setMotivoSelect] = useState<string>("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erroLocal, setErroLocal] = useState("");

  const itemIds = resumo?.itemIds ?? [];

  const validacao = trpc.estoque.validarEstorno.useQuery(
    { itemIds },
    {
      enabled: open && itemIds.length > 0 && resumo?.status === "ativa",
      refetchOnMount: "always",
    },
  );

  const jaEstornada =
    (resumo != null && resumo.status !== "ativa") ||
    Boolean(validacao.data?.jaEstornada);

  const insuficientes = validacao.data?.insuficientes ?? [];
  const estoqueBloqueado = insuficientes.length > 0;
  const validandoEstoque = validacao.isLoading || validacao.isFetching;

  useEffect(() => {
    if (!open) return;
    setMotivoSelect("");
    setMotivoOutro("");
    setObservacao("");
    setErroLocal("");
    onClearSubmitError?.();
  }, [open, resumo?.movimentacaoId]);

  const motivoValido = useMemo(() => {
    if (!motivoSelect) return false;
    if (motivoSelect === "Outro") return motivoOutro.trim().length > 0;
    return true;
  }, [motivoSelect, motivoOutro]);

  const podeConfirmar =
    Boolean(resumo) &&
    !jaEstornada &&
    motivoValido &&
    !estoqueBloqueado &&
    !validandoEstoque &&
    !submitting &&
    !validacao.isError;

  const confirmar = async () => {
    if (!podeConfirmar || !resumo) return;
    if (!motivoSelect) {
      setErroLocal("Selecione o motivo do estorno.");
      return;
    }
    if (motivoSelect === "Outro" && !motivoOutro.trim()) {
      setErroLocal("Descreva o motivo do estorno.");
      return;
    }
    setErroLocal("");
    onClearSubmitError?.();
    const motivo = motivoSelect === "Outro" ? motivoOutro.trim() : motivoSelect;
    const obs =
      motivoSelect === "Outro"
        ? undefined
        : observacao.trim() || undefined;
    await onConfirm({
      motivo,
      observacao: obs,
    });
  };

  const erroExibido = erroLocal || submitError;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-gray-900">
            Estornar movimentação
          </DialogTitle>
        </DialogHeader>

        <p className="text-[13px] text-gray-600 leading-relaxed">
          {alteraSaldo
            ? "Esta ação desfaz a movimentação inteira: cria o lançamento inverso, corrige o estoque e mantém a original no histórico como Estornada. Não é possível estornar só um produto."
            : "Esta ação desfaz a movimentação inteira: cria o lançamento inverso no histórico de compras (sem alterar saldo) e mantém a original como Estornada. Não é possível estornar só um produto."}
        </p>

        {resumo && (
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 space-y-1">
            <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Movimentação selecionada
            </div>
            <ResumoLinha label="Tipo" value={resumo.tipo} />
            <ResumoLinha label="Data" value={formatDataResumo(resumo.dataMovimentacao)} />
            <ResumoLinha label="Documento" value={resumo.documento} />
            <ResumoLinha label={labelOrigemDestinoResumo(resumo.tipo)} value={resumo.origemDestino} />
            <ResumoLinha label="Itens" value={formatItensLabel(resumo.qtdItens)} />
            <ResumoLinha label="Valor total" value={formatValorResumo(resumo.valorTotal)} />
          </div>
        )}

        {jaEstornada && (
          <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-3 py-2">
            Esta movimentação já foi estornada e não pode ser estornada novamente.
          </p>
        )}

        {estoqueBloqueado && (
          <div className="rounded-lg border border-red-100 bg-red-50/80 px-3 py-2.5 space-y-2">
            <p className="text-[12px] text-red-700 leading-snug">
              Não é possível estornar esta movimentação porque o saldo atual de um ou mais
              produtos estocáveis é insuficiente para realizar a reversão.
            </p>
            <div className="overflow-x-auto rounded border border-red-100 bg-white">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-red-50/50">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Produto</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Qtd. necessária</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Saldo atual</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Insuficiente</th>
                  </tr>
                </thead>
                <tbody>
                  {insuficientes.map(p => (
                    <tr key={p.produto} className="border-t border-red-50">
                      <td className="px-2 py-1.5 text-gray-800">{p.produto}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                        {formatQuantidadeMov(p.quantidadeNecessaria)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                        {formatQuantidadeMov(p.saldoAtual)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-red-700 font-medium">
                        {formatQuantidadeMov(p.quantidadeInsuficiente)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {validacao.isError && (
          <p className="text-[12px] text-red-600">
            Não foi possível validar{alteraSaldo ? " o estoque" : " o estorno"}. Tente fechar e abrir o estorno novamente.
          </p>
        )}

        <div className="space-y-2">
          <label className="block text-[11px] font-medium text-gray-600">
            Motivo do estorno <span className="text-red-500">*</span>
          </label>
          <select
            value={motivoSelect}
            onChange={e => {
              setMotivoSelect(e.target.value);
              setErroLocal("");
              onClearSubmitError?.();
            }}
            className="border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50"
            disabled={submitting || jaEstornada || estoqueBloqueado}
          >
            <option value="">Selecione o motivo</option>
            {MOTIVOS_ESTORNO.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {motivoSelect === "Outro" ? (
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-gray-600">
                Descreva o motivo do estorno <span className="text-red-500">*</span>
              </label>
              <textarea
                value={motivoOutro}
                onChange={e => {
                  setMotivoOutro(e.target.value);
                  setErroLocal("");
                  onClearSubmitError?.();
                }}
                placeholder="Informe o motivo do estorno"
                rows={2}
                maxLength={255}
                className="border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full resize-y min-h-[56px] disabled:bg-gray-50"
                disabled={submitting || jaEstornada || estoqueBloqueado}
              />
            </div>
          ) : motivoSelect ? (
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-gray-600">
                Observação complementar
              </label>
              <textarea
                value={observacao}
                onChange={e => {
                  setObservacao(e.target.value);
                  onClearSubmitError?.();
                }}
                placeholder="Opcional"
                rows={2}
                maxLength={200}
                className="border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full resize-y min-h-[56px] disabled:bg-gray-50"
                disabled={submitting || jaEstornada || estoqueBloqueado}
              />
            </div>
          ) : null}

          {erroExibido && <p className="text-[12px] text-red-600">{erroExibido}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { void confirmar(); }}
            disabled={!podeConfirmar}
            className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#D97706" }}
          >
            {submitting ? "Estornando..." : "Confirmar estorno"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumoLinha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[12px] leading-snug">
      <span className="text-gray-500 shrink-0 min-w-[72px]">{label}:</span>
      <span className="text-gray-800 font-medium">{value || "—"}</span>
    </div>
  );
}

function labelOrigemDestinoResumo(tipo: string): string {
  const t = tipo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.includes("compra") || t.includes("entrada") || t.includes("producao")) return "Origem";
  if (
    t.includes("consumo") ||
    t.includes("saida") ||
    t.includes("venda") ||
    t.includes("transfer")
  ) {
    return "Destino";
  }
  return "Origem ou destino";
}
