import { useRoute, useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/date-utils";
import {
  SEMEN_ESTOQUE_PATH,
  parseSemenMovimentacaoIdFromRoute,
  semenPartidaDetalhePath,
} from "@/lib/semenRoutes";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatMoedaBrlExcel, parseValorDecimalBanco } from "@shared/parseMoedaBr";
import { SEMEN_STATUS_DISPONIVEL, SEMEN_STATUS_ESGOTADO } from "@shared/semenEstoque";
import { FD_PRIMARY } from "@/components/FormFields";
import { CircleCheck } from "lucide-react";

function formatCustoDisplay(val: string | null | undefined): string {
  if (val == null || val === "") return "—";
  const n = parseValorDecimalBanco(val);
  return n != null ? formatMoedaBrlExcel(n) : "—";
}

function formatCustoPorDoseDisplay(val: string | null | undefined): string {
  const formatted = formatCustoDisplay(val);
  return formatted === "—" ? "—" : `${formatted} / dose`;
}

function ResumoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-[14px] font-medium text-gray-900 break-words">{value}</p>
    </div>
  );
}

export default function SemenEntradaResumoPage() {
  const [, params] = useRoute("/reproducao/estoque-semen/entrada/:movimentacaoId");
  const [, setLocation] = useLocation();
  const movimentacaoId = parseSemenMovimentacaoIdFromRoute(params?.movimentacaoId);

  const { data: resumo, isLoading, isError } = trpc.semen.getEntradaResumo.useQuery(
    { movimentacaoId: movimentacaoId! },
    { enabled: movimentacaoId != null },
  );

  if (movimentacaoId == null) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">Link de resumo inválido.</p>
            <button
              type="button"
              onClick={() => setLocation(SEMEN_ESTOQUE_PATH)}
              className="mt-4 text-[12px] font-medium text-gray-700 underline underline-offset-2"
            >
              Voltar ao estoque
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {isLoading ? (
          <p className="text-sm text-gray-500">Carregando resumo…</p>
        ) : isError || !resumo ? (
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">Movimentação não encontrada.</p>
            <button
              type="button"
              onClick={() => setLocation(SEMEN_ESTOQUE_PATH)}
              className="mt-4 text-[12px] font-medium text-gray-700 underline underline-offset-2"
            >
              Voltar ao estoque
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <CircleCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Entrada de sêmen registrada</h1>
                  <p className="text-[13px] text-gray-600">Resumo do lançamento realizado</p>
                </div>
              </div>
            </div>

            <div className="space-y-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Dados da entrada
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ResumoField label="Reprodutor" value={resumo.reprodutorDisplay} />
                <ResumoField label="Partida / lote" value={resumo.partida} />
                <ResumoField label="Central / origem" value={resumo.centralOrigem || "—"} />
                <ResumoField
                  label="Quantidade adicionada"
                  value={`${resumo.quantidadeDoses} doses`}
                />
                <ResumoField
                  label="Custo total"
                  value={formatCustoDisplay(resumo.custoTotal)}
                />
                <ResumoField
                  label="Custo por dose da entrada"
                  value={formatCustoPorDoseDisplay(resumo.custoUnitario)}
                />
                <ResumoField label="Data da entrada" value={formatDateBR(resumo.dataEntrada)} />
              </div>
            </div>

            <div className="space-y-5 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Após esta entrada
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ResumoField
                  label="Saldo atual da partida"
                  value={`${resumo.saldoAtual} doses`}
                />
                <ResumoField
                  label="Custo médio atual da partida"
                  value={formatCustoPorDoseDisplay(resumo.custoMedioAtual)}
                />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </p>
                  <div className="mt-1.5">
                    <Badge
                      variant={
                        resumo.statusAtual === SEMEN_STATUS_ESGOTADO ? "secondary" : "default"
                      }
                      className={cn(
                        resumo.statusAtual === SEMEN_STATUS_DISPONIVEL &&
                          "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
                      )}
                    >
                      {resumo.statusLabel}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setLocation(SEMEN_ESTOQUE_PATH)}
                className="rounded-full bg-[#EEEEEE] px-6 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-700 transition-colors hover:bg-gray-200"
              >
                Voltar ao estoque
              </button>
              <button
                type="button"
                onClick={() => setLocation(semenPartidaDetalhePath(resumo.partidaId))}
                className="inline-flex items-center justify-center rounded-full px-6 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-800 transition-opacity hover:opacity-90"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                Ver partida
              </button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
