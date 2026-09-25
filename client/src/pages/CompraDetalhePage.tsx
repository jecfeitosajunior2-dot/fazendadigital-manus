import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import CancelarVendaDialog from "@/components/venda/CancelarVendaDialog";
import { CompraDocumentosSection } from "@/components/venda/VendaDocumentosSection";
import { formatDateBR } from "@/lib/date-utils";
import { FD_PRIMARY } from "@/components/FormFields";
import {
  COMPRA_VENDA_COMPRAS_PATH,
  compraVendaCompraRecebimentoPath,
} from "@/lib/compraVendaCompradores";
import { formatarMetricaPeso, formatarMetricaQuantidade, formatarMetricaValor } from "@/lib/compraVendaResumo";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatarMetricaValor({ kind: "known", value });
}

function peso(value: number | null | undefined): string {
  if (value == null || value <= 0) return "—";
  return formatarMetricaPeso({ kind: "known", value });
}

function qtd(value: number): string {
  return formatarMetricaQuantidade({ kind: "known", value });
}

function formatDateTimeBR(value: unknown): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export default function CompraDetalhePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const id = Number(params.id);
  const { data, isLoading } = trpc.compras.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) && id > 0 },
  );
  const [dialogAberto, setDialogAberto] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const cancelarMut = trpc.compras.cancelar.useMutation();
  const cancelada = data?.status === "cancelado";
  const podeCancelar = Boolean(data?.podeCancelar);

  const handleCancelar = async (motivo: string) => {
    setSubmitError(null);
    try {
      await cancelarMut.mutateAsync({ id, motivo });
      await Promise.all([
        utils.compras.get.invalidate({ id }),
        utils.compras.list.invalidate(),
      ]);
      setDialogAberto(false);
      toast.success("Compra cancelada. O registro comercial foi preservado.");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível cancelar a compra.");
    }
  };

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation(COMPRA_VENDA_COMPRAS_PATH)}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>

      {isLoading || !data ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-[12px] text-gray-400">{isLoading ? "Carregando..." : "Compra não encontrada"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[15px] font-medium text-gray-800">Compra {data.id}</h1>
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                    data.status === "concluido"
                      ? "bg-green-100 text-green-700"
                      : data.status === "cancelado"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-amber-50 text-amber-800",
                  )}
                >
                  {data.statusComercialLabel}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {podeCancelar ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitError(null);
                      setDialogAberto(true);
                    }}
                    disabled={cancelarMut.isPending}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg border border-amber-200 bg-amber-50 text-[12px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancelar Compra
                  </button>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
              <div>
                <p className="text-[10px] uppercase text-gray-400">Data</p>
                <p className="font-medium text-gray-800">{formatDateBR(data.data)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Fornecedor</p>
                <p className="font-medium text-gray-800">{data.fornecedor}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Fazenda</p>
                <p className="font-medium text-gray-800">{data.fazendaNome || "—"}</p>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] text-gray-500">
              Forma de precificação: {data.formaLabel}
            </p>
            <div className="mt-4 pt-3 border-t border-gray-100 grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              <div>
                <p className="text-[10px] uppercase text-gray-400">Animais</p>
                <p className="font-medium text-gray-800 tabular-nums">{qtd(data.identificacao.comprados)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Peso adquirido</p>
                <p className="font-medium text-gray-800 tabular-nums">{peso(data.identificacao.pesoAdquirido)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">R$/kg médio</p>
                <p className="font-medium text-gray-800 tabular-nums">{money(data.valores.custoMedioKg)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Valor total</p>
                <p className="font-semibold text-gray-900 tabular-nums">{money(data.valores.custoTotal)}</p>
              </div>
            </div>
          </div>

          {cancelada ? (
            <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
              <h2 className="text-[13px] font-semibold text-gray-800 mb-3">Cancelamento</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                <div>
                  <p className="text-[10px] uppercase text-gray-400">Cancelada em</p>
                  <p className="font-medium text-gray-800">{formatDateTimeBR(data.canceladoEm)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-gray-400">Cancelada por</p>
                  <p className="font-medium text-gray-800">{data.canceladoPorNome || "—"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[10px] uppercase text-gray-400">Motivo</p>
                  <p className="font-medium text-gray-800">{data.motivoCancelamento || "—"}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <h2 className="text-[13px] font-semibold text-gray-800 mb-3">Situação dos animais</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[10px] uppercase text-gray-500">Comprados</p>
                <p className="text-[22px] font-bold text-gray-800 tabular-nums">{qtd(data.identificacao.comprados)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[10px] uppercase text-gray-500">Identificados</p>
                <p className="text-[22px] font-bold text-gray-800 tabular-nums">{qtd(data.identificacao.identificados)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[10px] uppercase text-gray-500">Pendentes</p>
                <p className={cn(
                  "text-[22px] font-bold tabular-nums",
                  cancelada ? "text-gray-500" : "text-gray-800",
                )}>
                  {qtd(data.identificacao.pendentes)}
                </p>
              </div>
            </div>
            <div className="mt-3 text-[12px]">
              <p className="text-[10px] uppercase text-gray-400">Situação</p>
              <p className="font-medium text-gray-800">{data.identificacao.situacaoLabel}</p>
            </div>
            {!cancelada && data.status === "concluido" && data.identificacao.pendentes > 0 ? (
              <button
                type="button"
                onClick={() => setLocation(compraVendaCompraRecebimentoPath(data.id))}
                className="mt-4 inline-flex items-center px-4 min-h-[40px] rounded-lg text-[12px] font-semibold text-gray-800 hover:opacity-90"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                Receber / Identificar animais
              </button>
            ) : null}
          </div>

          <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-[13px] font-semibold text-gray-800">Composição da compra</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase">Categoria</th>
                    <th className="px-4 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase">Sexo</th>
                    <th className="px-4 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase">Comprados</th>
                    <th className="px-4 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase">Identificados</th>
                    <th className="px-4 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase">Pendentes</th>
                    <th className="px-4 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase">Peso adquirido</th>
                  </tr>
                </thead>
                <tbody>
                  {data.identificacao.grupos.map(grupo => (
                    <tr key={grupo.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-center text-gray-800">{grupo.categoria}</td>
                      <td className="px-4 py-2 text-center text-gray-700">{grupo.sexoLabel}</td>
                      <td className="px-4 py-2 text-center tabular-nums">{qtd(grupo.comprados)}</td>
                      <td className="px-4 py-2 text-center tabular-nums">{qtd(grupo.identificados)}</td>
                      <td className="px-4 py-2 text-center tabular-nums">{qtd(grupo.pendentes)}</td>
                      <td className="px-4 py-2 text-center tabular-nums">{peso(grupo.pesoAdquirido)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-medium">
                    <td className="px-4 py-2 text-center text-gray-800">Total</td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-center tabular-nums">{qtd(data.identificacao.comprados)}</td>
                    <td className="px-4 py-2 text-center tabular-nums">{qtd(data.identificacao.identificados)}</td>
                    <td className="px-4 py-2 text-center tabular-nums">{qtd(data.identificacao.pendentes)}</td>
                    <td className="px-4 py-2 text-center tabular-nums">{peso(data.identificacao.pesoAdquirido)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <h2 className="text-[13px] font-semibold text-gray-800 mb-3">Valores</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
              <div>
                <p className="text-[10px] uppercase text-gray-400">Preço</p>
                <p className="font-medium text-gray-800 tabular-nums">
                  {data.valores.precoUnitario != null
                    ? `${money(data.valores.precoUnitario)}${data.formaPrecificacao === "cabeca" ? "/cabeça" : "/kg"}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Valor dos animais</p>
                <p className="font-medium text-gray-800 tabular-nums">{money(data.valores.valorAnimais)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Frete</p>
                <p className="font-medium text-gray-800 tabular-nums">{money(data.valores.frete)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Outros custos</p>
                <p className="font-medium text-gray-800 tabular-nums">{money(data.valores.outrosCustos)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Custo total</p>
                <p className="font-semibold text-gray-900 tabular-nums">{money(data.valores.custoTotal)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Custo médio/cabeça</p>
                <p className="font-medium text-gray-800 tabular-nums">{money(data.valores.custoMedioCabeca)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Custo médio/kg</p>
                <p className="font-medium text-gray-800 tabular-nums">{money(data.valores.custoMedioKg)}</p>
              </div>
            </div>
          </div>

          <CompraDocumentosSection compraId={data.id} documentos={data.documentos ?? []} />
        </div>
      )}

      <CancelarVendaDialog
        open={dialogAberto}
        onClose={() => setDialogAberto(false)}
        onConfirm={handleCancelar}
        submitting={cancelarMut.isPending}
        submitError={submitError}
        title="Cancelar Compra"
        description="Esta ação cancelará o registro comercial da compra. Os dados da operação serão preservados no histórico."
        confirmLabel="Cancelar Compra"
      />
    </AppLayout>
  );
}
