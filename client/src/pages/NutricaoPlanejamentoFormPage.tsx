import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormSelect,
  FormTextarea,
} from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { listaNutricaoComFazenda } from "@/lib/nutricaoRoutes";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/date-utils";
import { unidadeCompativelFormulacaoKg } from "@shared/nutricaoDietas";
import {
  formatarCustoProjetado,
  MSG_PLAN_LOTE_VAZIO,
  MSG_PLAN_SOMENTE_HISTORICO,
  MSG_PLAN_SUBSTITUIR_MESMO_DIA,
  textoAjudaTratosPorDia,
  textoEstimativaPorTrato,
  textoConfirmacaoSubstituir,
  dataFimAoSubstituir,
  MSG_PLAN_MATERIAL_INICIADO,
  NUTRICAO_PLAN_DIAS_SEMANA,
  NUTRICAO_PLAN_FREQUENCIAS,
  NUTRICAO_PLAN_MODALIDADES,
  podeEditarMaterialmente,
} from "@shared/nutricaoPlanejamento";

function hojeISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default function NutricaoPlanejamentoFormPage() {
  const params = useParams<{ id?: string }>();
  const planId = params.id ? Number(params.id) : null;
  const isEdit = Number.isFinite(planId) && (planId ?? 0) > 0;
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const fazendaFromUrl = new URLSearchParams(window.location.search).get("fazendaId") ?? "";

  const [fazendaId, setFazendaId] = useState(fazendaFromUrl);
  const [loteId, setLoteId] = useState("");
  const [tipoOrigem, setTipoOrigem] = useState<"produto" | "dieta">("produto");
  const [produtoId, setProdutoId] = useState("");
  const [dietaId, setDietaId] = useState("");
  const [modalidade, setModalidade] = useState("g_cab_dia");
  const [valorMeta, setValorMeta] = useState("");
  const [frequencia, setFrequencia] = useState("diaria");
  const [tratosPorDia, setTratosPorDia] = useState("");
  const [intervaloDias, setIntervaloDias] = useState("");
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [dataFim, setDataFim] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const fazendaNum = Number(fazendaId);
  const fazendaOk = Number.isFinite(fazendaNum) && fazendaNum > 0;
  const { data: lotes = [] } = trpc.nutricaoPlanejamento.listLotes.useQuery({ fazendaId: fazendaNum }, { enabled: fazendaOk });
  const { data: produtos = [] } = trpc.nutricaoPlanejamento.listProdutos.useQuery({ fazendaId: fazendaNum }, { enabled: fazendaOk });
  const produtosOk = produtos.filter(p => unidadeCompativelFormulacaoKg(p.unidade, p.embalagens));
  const { data: dietas = [] } = trpc.nutricaoPlanejamento.listDietas.useQuery({ fazendaId: fazendaNum }, { enabled: fazendaOk });
  const { data: existente } = trpc.nutricaoPlanejamento.get.useQuery({ id: planId! }, { enabled: isEdit });

  useEffect(() => {
    if (!existente) return;
    setFazendaId(String(existente.fazendaId));
    setLoteId(String(existente.loteId));
    setTipoOrigem(existente.tipoOrigem === "dieta" ? "dieta" : "produto");
    setProdutoId(existente.produtoId ? String(existente.produtoId) : "");
    setDietaId(existente.dietaId ? String(existente.dietaId) : "");
    setModalidade(existente.modalidadeMeta);
    setValorMeta(existente.valorMeta == null ? "" : String(existente.valorMeta));
    setFrequencia(existente.frequencia);
    setTratosPorDia(existente.tratosPorDia == null ? "" : String(existente.tratosPorDia));
    setIntervaloDias(existente.frequenciaIntervaloDias == null ? "" : String(existente.frequenciaIntervaloDias));
    setDiasSemana(existente.frequenciaDiasSemana ?? []);
    setDataInicio(existente.dataInicio);
    setDataFim(existente.dataFim ?? "");
    setObservacoes(existente.observacoes ?? "");
  }, [existente]);

  const materialTravado = Boolean(isEdit && existente && !podeEditarMaterialmente(existente.dataInicio, hojeISO()));

  const payloadPronto = useMemo(() => {
    const loteNum = Number(loteId);
    if (!fazendaOk || !(loteNum > 0) || !dataInicio) return null;
    const adLib = modalidade === "ad_libitum";
    const valor = Number(String(valorMeta).replace(",", "."));
    return {
      fazendaId: fazendaNum,
      loteId: loteNum,
      tipoOrigem,
      produtoId: tipoOrigem === "produto" && Number(produtoId) > 0 ? Number(produtoId) : null,
      dietaId: tipoOrigem === "dieta" && Number(dietaId) > 0 ? Number(dietaId) : null,
      modalidadeMeta: modalidade as "g_cab_dia" | "kg_cab_dia" | "pct_pv_dia" | "ad_libitum",
      valorMeta: adLib ? null : (Number.isFinite(valor) && valor > 0 ? valor : null),
      frequencia: frequencia as "diaria" | "dias_semana" | "a_cada_x_dias" | "conforme_necessidade",
      tratosPorDia: Number(tratosPorDia) >= 1 ? Number(tratosPorDia) : null,
      frequenciaIntervaloDias: Number(intervaloDias) >= 1 ? Number(intervaloDias) : null,
      frequenciaDiasSemana: diasSemana,
      dataInicio,
      dataFim: dataFim || null,
      observacoes: observacoes || null,
    };
  }, [fazendaOk, fazendaNum, loteId, tipoOrigem, produtoId, dietaId, modalidade, valorMeta, frequencia, tratosPorDia, intervaloDias, diasSemana, dataInicio, dataFim, observacoes]);

  const previewEnabled = Boolean(
    payloadPronto
    && (tipoOrigem === "produto" ? Number(produtoId) > 0 : Number(dietaId) > 0)
    && (modalidade === "ad_libitum" || (payloadPronto.valorMeta != null && payloadPronto.valorMeta > 0)),
  );

  const { data: preview } = trpc.nutricaoPlanejamento.preview.useQuery(
    payloadPronto!,
    { enabled: previewEnabled && payloadPronto != null },
  );

  const utils = trpc.useUtils();
  const createMut = trpc.nutricaoPlanejamento.create.useMutation({
    onSuccess: () => {
      toast.success("Planejamento cadastrado.");
      utils.nutricaoPlanejamento.list.invalidate();
      setLocation(`/nutricao/planejamento?fazendaId=${fazendaId}`);
    },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.nutricaoPlanejamento.update.useMutation({
    onSuccess: () => {
      toast.success("Planejamento atualizado.");
      utils.nutricaoPlanejamento.list.invalidate();
      utils.nutricaoPlanejamento.get.invalidate({ id: planId! });
      setLocation(`/nutricao/planejamento/${planId}`);
    },
    onError: e => toast.error(e.message),
  });
  const substituirMut = trpc.nutricaoPlanejamento.substituir.useMutation({
    onSuccess: out => {
      toast.success("Período anterior encerrado. Novo planejamento criado.");
      utils.nutricaoPlanejamento.list.invalidate();
      setLocation(`/nutricao/planejamento/${out.id}`);
    },
    onError: e => toast.error(e.message),
  });

  const pending = createMut.isPending || updateMut.isPending || substituirMut.isPending;

  const somenteHistorico = Boolean(isEdit && existente && !existente.acoes.podeEditar);
  const podeSubstituir = Boolean(isEdit && existente?.acoes.podeSubstituir);

  const salvar = async (substituir = false) => {
    if (!payloadPronto) {
      toast.error("Preencha fazenda, lote e data inicial.");
      return;
    }
    if (somenteHistorico) {
      toast.error(MSG_PLAN_SOMENTE_HISTORICO);
      return;
    }
    if (isEdit && substituir) {
      const corte = existente ? dataFimAoSubstituir(existente.dataInicio, payloadPronto.dataInicio) : { ok: false as const, message: MSG_PLAN_SUBSTITUIR_MESMO_DIA };
      if (!corte.ok) {
        toast.error(corte.message);
        return;
      }
      const ok = await confirm({
        title: "Substituir este planejamento?",
        description: textoConfirmacaoSubstituir(payloadPronto.dataInicio),
        confirmText: "Substituir",
        cancelText: "Voltar",
        variant: "warning",
      });
      if (!ok) return;
      substituirMut.mutate({ id: planId!, ...payloadPronto });
      return;
    }
    if (isEdit) updateMut.mutate({ id: planId!, ...payloadPronto });
    else createMut.mutate(payloadPronto);
  };

  const ajudaTratos = textoAjudaTratosPorDia({
    modalidadeMeta: modalidade,
    valorMeta,
    tratosPorDia,
  });
  const estimativaPorTrato = textoEstimativaPorTrato({
    modalidadeMeta: modalidade,
    valorMeta,
    tratosPorDia,
  });

  const voltarLista = () => setLocation(listaNutricaoComFazenda("/nutricao/planejamento", fazendaId));

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
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
            {isEdit ? "Editar Planejamento" : "Novo Planejamento"}
          </h1>
        </div>

        <div className="px-4 py-5 space-y-6">
          {somenteHistorico && (
            <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-3 py-2">
              {MSG_PLAN_SOMENTE_HISTORICO}
            </p>
          )}
          {materialTravado && !somenteHistorico && (
            <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-3 py-2">
              {MSG_PLAN_MATERIAL_INICIADO}
            </p>
          )}

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Informações</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect value={fazendaId} onChange={v => { setFazendaId(v); setLoteId(""); }} fazendas={fazendas} disabled={isEdit} required />
              </div>
              <div>
                <FormLabel required>Lote</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={loteId || "__empty__"} onChange={v => setLoteId(v === "__empty__" ? "" : v)} disabled={materialTravado}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {lotes.map(l => (
                    <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">{l.nome}</SelectItem>
                  ))}
                </FormSelect>
              </div>
              <div>
                <FormLabel required>Data inicial</FormLabel>
                <FormDatePicker value={dataInicio} onChange={setDataInicio} />
                {materialTravado && <p className="text-[11px] text-gray-500 mt-1">A data inicial não pode ser reescrita depois do início.</p>}
              </div>
              <div>
                <FormLabel>Data final</FormLabel>
                <FormDatePicker value={dataFim} onChange={setDataFim} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Estratégia nutricional</h2>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              {(["produto", "dieta"] as const).map(tipo => (
                <button
                  key={tipo}
                  type="button"
                  disabled={materialTravado}
                  onClick={() => setTipoOrigem(tipo)}
                  className={cn("px-4 min-h-[36px] text-[12px] font-semibold", tipoOrigem === tipo ? "text-gray-900" : "bg-white text-gray-500")}
                  style={tipoOrigem === tipo ? { backgroundColor: FD_PRIMARY } : undefined}
                >
                  {tipo === "produto" ? "Produto pronto" : "Dieta"}
                </button>
              ))}
            </div>
            {tipoOrigem === "produto" ? (
              <div className="max-w-xl">
                <FormLabel required>Produto</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={produtoId || "__empty__"} onChange={v => setProdutoId(v === "__empty__" ? "" : v)} disabled={materialTravado}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {produtosOk.map(p => (
                    <SelectItem key={p.produtoId} value={String(p.produtoId)} className="text-[12px]">{p.nome}</SelectItem>
                  ))}
                </FormSelect>
                <p className="text-[11px] text-gray-500 mt-1">Produto em kg, g ou saco com uma única embalagem de massa. A disponibilidade usa o kg derivado do saldo, sem criar segundo estoque.</p>
              </div>
            ) : (
              <div className="max-w-xl">
                <FormLabel required>Dieta</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={dietaId || "__empty__"} onChange={v => setDietaId(v === "__empty__" ? "" : v)} disabled={materialTravado}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {dietas.map(d => (
                    <SelectItem key={d.id} value={String(d.id)} className="text-[12px]">{d.nome}</SelectItem>
                  ))}
                </FormSelect>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Meta</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <FormLabel required>Modalidade</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={modalidade} onChange={setModalidade} disabled={materialTravado}>
                  {NUTRICAO_PLAN_MODALIDADES.map(m => (
                    <SelectItem key={m.value} value={m.value} className="text-[12px]">{m.label}</SelectItem>
                  ))}
                </FormSelect>
              </div>
              {modalidade !== "ad_libitum" && (
                <div>
                  <FormLabel required>Valor da meta</FormLabel>
                  <FormInput variant="light" required value={valorMeta} onChange={setValorMeta} inputMode="decimal" placeholder={modalidade === "pct_pv_dia" ? "Ex.: 1" : "Ex.: 100"} />
                </div>
              )}
            </div>
            {modalidade === "ad_libitum" && (
              <p className="text-[11px] text-gray-500">Oferta à vontade — necessidade diária não determinada pela meta.</p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Rotina</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <FormLabel required>Frequência</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={frequencia} onChange={setFrequencia}>
                  {NUTRICAO_PLAN_FREQUENCIAS.map(f => (
                    <SelectItem key={f.value} value={f.value} className="text-[12px]">{f.label}</SelectItem>
                  ))}
                </FormSelect>
              </div>
              <div>
                <FormLabel>Tratos por dia</FormLabel>
                <FormInput variant="light" value={tratosPorDia} onChange={setTratosPorDia} inputMode="numeric" placeholder="Opcional" />
              </div>
              {frequencia === "a_cada_x_dias" && (
                <div>
                  <FormLabel required>A cada quantos dias</FormLabel>
                  <FormInput variant="light" required value={intervaloDias} onChange={setIntervaloDias} inputMode="numeric" />
                </div>
              )}
            </div>
            {frequencia === "dias_semana" && (
              <div className="flex flex-wrap gap-2">
                {NUTRICAO_PLAN_DIAS_SEMANA.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDiasSemana(prev => prev.includes(d.value) ? prev.filter(x => x !== d.value) : [...prev, d.value])}
                    className={cn("px-3 min-h-[32px] rounded-lg border text-[12px]", diasSemana.includes(d.value) ? "border-[#4ECDC4] bg-[#4ECDC414]" : "border-gray-200")}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-500">{ajudaTratos}</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Projeção (estimativa atual)</h2>
            {preview?.loteVazio && <p className="text-[12px] text-amber-800">{MSG_PLAN_LOTE_VAZIO}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] bg-gray-50 rounded px-3 py-3">
              <div>
                <div className="text-[10px] uppercase text-gray-500">Animais atuais</div>
                <div className="font-semibold tabular-nums">{preview?.animaisAtuais ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Necessidade/dia</div>
                <div className="font-semibold tabular-nums">
                  {preview?.necessidadeKgDia != null ? `${preview.necessidadeKgDia.toLocaleString("pt-BR")} kg` : (preview?.mensagemNecessidade ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Necessidade/30 dias</div>
                <div className="font-semibold tabular-nums">
                  {preview?.necessidadeKg30d != null ? `${preview.necessidadeKg30d.toLocaleString("pt-BR")} kg` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Custo estimado/dia</div>
                <div className="font-semibold">
                  {preview ? formatarCustoProjetado(preview.custo.custoDia, preview.custo.completo, preview.custo.mensagem ?? "Custo não disponível") : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Custo/cabeça/dia</div>
                <div className="font-semibold">
                  {preview ? formatarCustoProjetado(preview.custo.custoCabecaDia, preview.custo.completo, preview.custo.mensagem ?? "Custo não disponível") : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Autonomia estimada</div>
                <div className="font-semibold tabular-nums">
                  {preview?.autonomiaProduto?.calculavel
                    ? `${preview.autonomiaProduto.autonomiaDias?.toLocaleString("pt-BR")} dias`
                    : preview?.autonomiaDieta?.calculavel
                      ? `${preview.autonomiaDieta.autonomiaDias?.toLocaleString("pt-BR")} dias`
                      : (preview?.autonomiaProduto?.motivo || preview?.autonomiaDieta?.motivo || "—")}
                </div>
              </div>
            </div>
            {preview && modalidade === "pct_pv_dia" && (
              <p className="text-[11px] text-gray-500">
                Peso médio de referência: {preview.peso.pesoMedioKg != null ? `${preview.peso.pesoMedioKg.toLocaleString("pt-BR")} kg` : "indisponível"}
                {" · "}
                {preview.peso.coberturaTexto}
                {preview.peso.dataReferencia ? ` · Últimas pesagens consideradas até: ${formatDateBR(preview.peso.dataReferencia)}` : ""}
                {preview.peso.avisoAtualidade ? ` · ${preview.peso.avisoAtualidade}` : ""}
              </p>
            )}
            {estimativaPorTrato ? (
              <p className="text-[11px] text-gray-500">{estimativaPorTrato}</p>
            ) : null}
            <p className="text-[11px] text-gray-500">
              Projeção com população e custo atuais. Não é fornecimento, consumo nem despesa realizada. Não reserva estoque.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Observações</h2>
            <FormTextarea variant="light" value={observacoes} onChange={setObservacoes} placeholder="Observações do planejamento" />
          </section>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button type="button" disabled={pending} onClick={() => setLocation(fazendaId ? `/nutricao/planejamento?fazendaId=${fazendaId}` : "/nutricao/planejamento")} className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase bg-[#F0F0F0] text-gray-700">
              Voltar
            </button>
            {!somenteHistorico && (
              <button type="button" disabled={pending} onClick={() => void salvar(false)} className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase text-gray-900" style={{ backgroundColor: FD_PRIMARY }}>
                {pending ? "Salvando..." : "Salvar Planejamento"}
              </button>
            )}
            {podeSubstituir && (
              <button type="button" disabled={pending} onClick={() => void salvar(true)} className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase border border-amber-200 text-amber-800 bg-white">
                {substituirMut.isPending ? "Substituindo..." : "Substituir planejamento"}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
