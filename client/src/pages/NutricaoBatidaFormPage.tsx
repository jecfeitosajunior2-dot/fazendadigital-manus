import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FD_PRIMARY, FormDatePicker, FormInput, FormLabel, FormSelect, FormTextarea } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { listaNutricaoComFazenda } from "@/lib/nutricaoRoutes";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  estadoDietasParaBatida,
  MSG_BATIDA_SEM_DIETA_PREPARO,
  MSG_BATIDA_SEM_DIETA_PREPARO_COMPLEMENTO,
} from "@shared/nutricaoDietas";

function hojeISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default function NutricaoBatidaFormPage() {
  const [, setLocation] = useLocation();
  const fazendaFromUrl = new URLSearchParams(window.location.search).get("fazendaId") ?? "";
  const [fazendaId, setFazendaId] = useState(fazendaFromUrl);
  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState("");
  const [dietaId, setDietaId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const fazendaNum = Number(fazendaId);
  const fazendaOk = fazendaNum > 0;
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const {
    data: dietas = [],
    isLoading: dietasLoading,
    isError: dietasErro,
    isSuccess: dietasOk,
  } = trpc.nutricaoBatidas.listDietasParaBatida.useQuery(
    { fazendaId: fazendaNum },
    { enabled: fazendaOk },
  );
  const estadoDietas = estadoDietasParaBatida({
    fazendaSelecionada: fazendaOk,
    isLoading: dietasLoading,
    isError: dietasErro,
    isSuccess: dietasOk,
    quantidade: dietas.length,
  });
  const seletorDietaDesabilitado = estadoDietas !== "pronto";

  const payload = useMemo(() => {
    const qtd = Number(String(quantidade).replace(",", "."));
    if (!(fazendaNum > 0) || !data || !(Number(dietaId) > 0) || !(qtd > 0)) return null;
    return {
      fazendaId: fazendaNum,
      dietaId: Number(dietaId),
      data,
      hora: hora || null,
      quantidadePreparadaKg: qtd,
      observacoes: observacoes || null,
    };
  }, [fazendaNum, dietaId, data, hora, quantidade, observacoes]);

  const { data: previewPack } = trpc.nutricaoBatidas.preview.useQuery(payload!, { enabled: payload != null });
  const preview = previewPack?.preview;
  const utils = trpc.useUtils();
  const confirmar = trpc.nutricaoBatidas.confirmar.useMutation({
    onSuccess: () => {
      toast.success("Batida confirmada. Ingredientes baixados do estoque.");
      utils.nutricaoBatidas.list.invalidate();
      setLocation(`/nutricao/batidas?fazendaId=${fazendaId}`);
    },
    onError: e => toast.error(e.message),
  });

  const voltarLista = () => setLocation(listaNutricaoComFazenda("/nutricao/batidas", fazendaId));

  return (
    <AppLayout>
      <button
        type="button"
        onClick={voltarLista}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        aria-label="Voltar"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>Nova Batida</h1>
        </div>
        <div className="px-4 py-5 space-y-6">
          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Informações</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect value={fazendaId} onChange={v => { setFazendaId(v); setDietaId(""); }} fazendas={fazendas} required />
              </div>
              <div>
                <FormLabel required>Data</FormLabel>
                <FormDatePicker value={data} onChange={setData} max={hojeISO()} />
              </div>
              <div>
                <FormLabel>Hora</FormLabel>
                <FormInput variant="light" value={hora} onChange={setHora} placeholder="HH:MM" />
              </div>
              <div>
                <FormLabel required>Dieta</FormLabel>
                <FormSelect
                  variant="light"
                  required
                  disabled={seletorDietaDesabilitado}
                  placeholder="Selecione"
                  value={dietaId || "__empty__"}
                  onChange={v => setDietaId(v === "__empty__" ? "" : v)}
                >
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {dietas.map(d => <SelectItem key={d.id} value={String(d.id)} className="text-[12px]">{d.nome}</SelectItem>)}
                </FormSelect>
                {estadoDietas === "carregando" && (
                  <p className="text-[12px] text-gray-500 mt-1">Carregando...</p>
                )}
                {estadoDietas === "vazio" && (
                  <div className="mt-1 space-y-1">
                    <p className="text-[12px] text-gray-500">{MSG_BATIDA_SEM_DIETA_PREPARO}</p>
                    <p className="text-[12px] text-gray-500">{MSG_BATIDA_SEM_DIETA_PREPARO_COMPLEMENTO}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Preparo</h2>
            <div className="max-w-[220px]">
              <FormLabel required>Quantidade a preparar (kg)</FormLabel>
              <FormInput variant="light" required value={quantidade} onChange={setQuantidade} inputMode="decimal" />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Composição / estoque</h2>
            {preview && (
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Ingrediente</th>
                      <th className="px-3 py-2 text-center">Proporção</th>
                      <th className="px-3 py-2 text-center">Qtd necessária</th>
                      <th className="px-3 py-2 text-center">Saldo atual</th>
                      <th className="px-3 py-2 text-center">Saldo após</th>
                      <th className="px-3 py-2 text-center">Custo unitário</th>
                      <th className="px-3 py-2 text-center">Custo previsto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.baixas.map(b => (
                      <tr key={b.produtoId} className="border-t">
                        <td className="px-3 py-1.5">{b.nome}</td>
                        <td className="px-3 py-1.5 text-center">{b.proporcao != null ? `${(b.proporcao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—"}</td>
                        <td className="px-3 py-1.5 text-center">
                          {b.quantidadeKg.toLocaleString("pt-BR")} kg
                          {b.unidade && b.unidade !== "kg" && b.quantidadeUnidade > 0
                            ? ` · ${b.quantidadeUnidade.toLocaleString("pt-BR")} ${b.unidade}`
                            : ""}
                        </td>
                        <td className="px-3 py-1.5 text-center">{b.saldoUnidade.toLocaleString("pt-BR")} {b.unidade}</td>
                        <td className={cn("px-3 py-1.5 text-center", !b.suficiente && "text-red-600 font-semibold")}>{b.saldoAposUnidade.toLocaleString("pt-BR")} {b.unidade}</td>
                        <td className="px-3 py-1.5 text-center">{b.custoConhecido && b.custoUnitarioPorKg != null ? b.custoUnitarioPorKg.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                        <td className="px-3 py-1.5 text-center">{b.custoConhecido && b.custoTotal != null ? b.custoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Custo incompleto"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Custo previsto</h2>
            {preview && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 rounded px-3 py-3 text-[12px]">
                <div><div className="text-[10px] uppercase text-gray-500">Quantidade</div><div className="font-semibold">{preview.quantidadePreparadaKg.toLocaleString("pt-BR")} kg</div></div>
                <div><div className="text-[10px] uppercase text-gray-500">Custo total</div><div className="font-semibold">{preview.custo.completo && preview.custo.custoTotal != null ? preview.custo.custoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Custo incompleto"}</div></div>
                <div><div className="text-[10px] uppercase text-gray-500">Custo/kg</div><div className="font-semibold">{preview.custo.completo && preview.custo.custoPorKg != null ? preview.custo.custoPorKg.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</div></div>
                <div><div className="text-[10px] uppercase text-gray-500">Estoque</div><div className="font-semibold">{preview.podeConfirmar ? "Saldo suficiente" : "Bloqueado"}</div></div>
              </div>
            )}
            {(previewPack?.message || preview?.motivoBloqueio) && (
              <p className="text-[12px] text-red-600">{previewPack?.message || preview?.motivoBloqueio}</p>
            )}
            <p className="text-[11px] text-gray-500">A prévia não movimenta estoque e não cria batida. Só a confirmação baixa os ingredientes.</p>
          </section>

          <section>
            <FormLabel>Observações</FormLabel>
            <FormTextarea variant="light" value={observacoes} onChange={setObservacoes} />
          </section>

          <div className="flex justify-end gap-2">
            <button type="button" className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase bg-[#F0F0F0]" onClick={() => setLocation(`/nutricao/batidas?fazendaId=${fazendaId}`)}>Cancelar</button>
            <button
              type="button"
              disabled={!payload || previewPack?.ok === false || !preview?.podeConfirmar || confirmar.isPending}
              onClick={() => payload && confirmar.mutate(payload)}
              className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase text-gray-900 disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {confirmar.isPending ? "Confirmando..." : "Confirmar Batida"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
