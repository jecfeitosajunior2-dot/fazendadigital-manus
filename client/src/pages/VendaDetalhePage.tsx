import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import CancelarVendaDialog from "@/components/venda/CancelarVendaDialog";
import VendaDocumentosSection from "@/components/venda/VendaDocumentosSection";
import { formatDateBR } from "@/lib/date-utils";
import { COMPRA_VENDA_VENDAS_PATH } from "@/lib/compraVendaCompradores";
import { isVendaStatus, labelStatusVenda } from "@/lib/vendasListagem";
import {
  VENDA_DETALHE_EXPORT_TITULO,
  buildVendaDetalheExportHeaders,
  buildVendaDetalheExportRows,
  buildVendaDetalheExportSubtitlesExcel,
  buildVendaDetalhePdfReportBlocks,
  cabecalhoPrecoUnitarioVenda,
  nomeAbaExcelVendaDetalhe,
  nomeArquivoVendaDetalhe,
} from "@/lib/vendaDetalheExport";
import { cn } from "@/lib/utils";
import {
  calcularPesoCarne,
  FORMA_PRECIFICACAO_VENDA_LABEL,
  isFormaPrecificacaoVenda,
  parseRendimentoCarcaca,
} from "@shared/vendaComercial";
import { trpc } from "@/lib/trpc";

function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTimeBR(value: unknown): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

/** Mesmo badge da listagem de Vendas (`StatusVendaBadge` em ModulePages). */
function StatusVendaBadge({ status }: { status?: string | null }) {
  const cls = isVendaStatus(status)
    ? status === "concluido"
      ? "bg-green-100 text-green-700"
      : status === "pendente"
        ? "bg-amber-50 text-amber-800"
        : "bg-gray-100 text-gray-600"
    : "bg-gray-100 text-gray-500";
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium", cls)}>
      {labelStatusVenda(status)}
    </span>
  );
}

export default function VendaDetalhePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const id = Number(params.id);
  const { data, isLoading } = trpc.vendas.get.useQuery({ id }, { enabled: Number.isFinite(id) && id > 0 });
  const [dialogAberto, setDialogAberto] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const cancelarMut = trpc.vendas.cancelar.useMutation();
  const rendimentoParse = parseRendimentoCarcaca(data?.rendimentoCarcaca);
  const rendimento = rendimentoParse.ok ? rendimentoParse.valor : null;
  const temRendimento = rendimento != null;
  const podeCancelar = data?.status === "concluido" && data.temItens;
  const exportacao = useMemo(() => {
    if (!data) return null;
    return {
      headers: buildVendaDetalheExportHeaders(data.formaPrecificacao),
      rows: buildVendaDetalheExportRows(data),
      excelSubtitles: buildVendaDetalheExportSubtitlesExcel(data),
      pdfBlocks: buildVendaDetalhePdfReportBlocks(data),
      pdfName: nomeArquivoVendaDetalhe(data, "pdf"),
      xlsxName: nomeArquivoVendaDetalhe(data, "xlsx"),
      sheetName: nomeAbaExcelVendaDetalhe(data.id),
    };
  }, [data]);

  const handleCancelar = async (motivo: string) => {
    setSubmitError(null);
    try {
      await cancelarMut.mutateAsync({ id, motivo });
      await Promise.all([
        utils.vendas.get.invalidate({ id }),
        utils.vendas.list.invalidate(),
        utils.animais.list.invalidate(),
        utils.animais.getById.invalidate(),
      ]);
      setDialogAberto(false);
      toast.success("Venda cancelada. Os animais voltaram para o rebanho.");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível cancelar a venda.");
    }
  };

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation(COMPRA_VENDA_VENDAS_PATH)}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>

      {isLoading || !data ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-[12px] text-gray-400">{isLoading ? "Carregando..." : "Venda não encontrada"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[15px] font-medium text-gray-800">Venda {data.id}</h1>
                <StatusVendaBadge status={data.status} />
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
                    Cancelar venda
                  </button>
                ) : null}
                {exportacao ? (
                  <ListExportButtons
                    variant="secondary"
                    title={VENDA_DETALHE_EXPORT_TITULO}
                    filename={`Venda-${data.id}`}
                    headers={exportacao.headers}
                    rows={exportacao.rows}
                    fazendaNome={data.fazendaNome || undefined}
                    spreadsheetReportTitle={VENDA_DETALHE_EXPORT_TITULO}
                    spreadsheetReportSubtitles={exportacao.excelSubtitles}
                    pdfReportBlocks={exportacao.pdfBlocks}
                    spreadsheetSheetName={exportacao.sheetName}
                    spreadsheetDownloadFilename={exportacao.xlsxName}
                    pdfDownloadFilename={exportacao.pdfName}
                    spreadsheetColumnAligns={["center", "center", "center", "center", "center"]}
                    pdfColumnAligns={["center", "center", "center", "center", "center"]}
                    pdfShowRegistrosSubtitle={false}
                    pdfIncludeSpreadsheetTitle={false}
                    spreadsheetAllowEmpty
                    spreadsheetAutoFilter={false}
                    className="[&>button]:min-h-[36px] [&>button]:px-3"
                  />
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
              <div>
                <p className="text-[10px] uppercase text-gray-400">Data</p>
                <p className="font-medium text-gray-800">{formatDateBR(data.data)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Comprador</p>
                <p className="font-medium text-gray-800">{data.comprador || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Fazenda</p>
                <p className="font-medium text-gray-800">{data.fazendaNome || "—"}</p>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] text-gray-500">
              Forma de precificação:{" "}
              {isFormaPrecificacaoVenda(data.formaPrecificacao)
                ? FORMA_PRECIFICACAO_VENDA_LABEL[data.formaPrecificacao]
                : "—"}
              {temRendimento ? ` · Rendimento ${rendimento.toLocaleString("pt-BR")}%` : ""}
            </p>

            <div className="mt-4 pt-3 border-t border-gray-100 grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              <div>
                <p className="text-[10px] uppercase text-gray-400">Animais</p>
                <p className="font-medium text-gray-800 tabular-nums">{data.totais.quantidade}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">
                  {temRendimento ? "Peso carne" : "Peso total"}
                </p>
                <p className="font-medium text-gray-800 tabular-nums">
                  {data.totais.pesoTotal != null ? `${data.totais.pesoTotal.toLocaleString("pt-BR")} kg` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">R$/kg médio</p>
                <p className="font-medium text-gray-800 tabular-nums">
                  {data.totais.precoMedioKg != null ? money(data.totais.precoMedioKg) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Valor total</p>
                <p className="font-semibold text-gray-900 tabular-nums">{money(data.totais.valorTotal)}</p>
              </div>
            </div>
            {data.observacoes ? (
              <p className="mt-3 text-[12px] text-gray-600">{data.observacoes}</p>
            ) : null}
            {data.status === "cancelado" ? (
              <div className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500 space-y-0.5">
                <p>
                  Cancelada em {formatDateTimeBR(data.canceladoEm)}
                  {data.canceladoPorNome ? ` · ${data.canceladoPorNome}` : ""}
                </p>
                {data.motivoCancelamento ? (
                  <p>Motivo: {data.motivoCancelamento}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-100">
              <h2 className="text-[13px] font-medium text-gray-800">Animais da Venda</h2>
            </div>
            {!data.temItens ? (
              <p className="p-6 text-center text-[12px] text-gray-400">
                Venda legada sem itens individuais. Quantidade registrada: {data.quantidadeAnimais ?? 0}.
              </p>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Brinco</th>
                    <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Lote</th>
                    <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Peso do embarque</th>
                    {temRendimento ? (
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Peso carne</th>
                    ) : null}
                    <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">
                      {cabecalhoPrecoUnitarioVenda(data.formaPrecificacao)}
                    </th>
                    <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.itens.map(item => (
                    <tr key={item.id} className="border-t border-gray-50">
                      <td className="px-3 py-1.5 text-center font-medium text-gray-800">{item.brincoSnapshot || `#${item.animalId}`}</td>
                      <td className="px-3 py-1.5 text-center text-gray-600">{item.loteNomeSnapshot || "—"}</td>
                      <td className="px-3 py-1.5 text-center text-gray-700">
                        {item.pesoVenda != null ? `${Number(item.pesoVenda).toLocaleString("pt-BR")} kg` : "—"}
                      </td>
                      {temRendimento ? (
                        <td className="px-3 py-1.5 text-center text-gray-700">
                          {item.pesoVenda != null
                            ? `${calcularPesoCarne(Number(item.pesoVenda), rendimento).toLocaleString("pt-BR")} kg`
                            : "—"}
                        </td>
                      ) : null}
                      <td className="px-3 py-1.5 text-center text-gray-700">{money(item.precoUnitario)}</td>
                      <td className="px-3 py-1.5 text-center font-medium text-gray-800">{money(item.valorItem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <VendaDocumentosSection vendaId={data.id} documentos={data.documentos ?? []} />
        </div>
      )}

      <CancelarVendaDialog
        open={dialogAberto}
        onClose={() => setDialogAberto(false)}
        onConfirm={handleCancelar}
        submitting={cancelarMut.isPending}
        submitError={submitError}
      />
    </AppLayout>
  );
}
