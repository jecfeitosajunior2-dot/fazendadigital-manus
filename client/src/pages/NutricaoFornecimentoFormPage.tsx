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
  MSG_FORN_DIETA_EXIGE_PREPARO_UI,
  podeDietaSerFornecidaDiretamente,
  unidadeCompativelFormulacaoKg,
} from "@shared/nutricaoDietas";
import { formatarMetaPlan } from "@shared/nutricaoPlanejamento";
import { MSG_FORN_LOTE_VAZIO, MSG_FORN_SEM_PLAN } from "@shared/nutricaoFornecimentos";

function hojeISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default function NutricaoFornecimentoFormPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const fazendaFromUrl = params.get("fazendaId") ?? "";
  const batidaFromUrl = params.get("batidaId") ?? "";
  const [fazendaId, setFazendaId] = useState(fazendaFromUrl);
  const [loteId, setLoteId] = useState("");
  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState("");
  const [modo, setModo] = useState<"avulso" | "plan">("avulso");
  const [planejamentoId, setPlanejamentoId] = useState("");
  const [origemOp, setOrigemOp] = useState<"direta" | "batida">(batidaFromUrl ? "batida" : "direta");
  const [batidaId, setBatidaId] = useState(batidaFromUrl);
  const [tipoOrigem, setTipoOrigem] = useState<"produto" | "dieta">(batidaFromUrl ? "dieta" : "produto");
  const [produtoId, setProdutoId] = useState("");
  const [dietaId, setDietaId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [cochoId, setCochoId] = useState("");

  const fazendaNum = Number(fazendaId);
  const loteNum = Number(loteId);
  const fazendaOk = fazendaNum > 0;
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: lotes = [] } = trpc.nutricaoPlanejamento.listLotes.useQuery({ fazendaId: fazendaNum }, { enabled: fazendaOk });
  const { data: produtos = [] } = trpc.nutricaoPlanejamento.listProdutos.useQuery({ fazendaId: fazendaNum }, { enabled: fazendaOk });
  const { data: dietas = [] } = trpc.nutricaoPlanejamento.listDietas.useQuery({ fazendaId: fazendaNum }, { enabled: fazendaOk });
  const { data: cochos = [] } = trpc.nutricaoCochos.list.useQuery(
    { fazendaId: fazendaNum, status: "ativo" },
    { enabled: fazendaOk },
  );
  const { data: planos = [] } = trpc.nutricaoFornecimentos.listPlanejamentos.useQuery(
    { fazendaId: fazendaNum, loteId: loteNum, data },
    { enabled: fazendaOk && loteNum > 0 && Boolean(data) },
  );
  const { data: batidasDisp = [] } = trpc.nutricaoBatidas.listDisponiveis.useQuery(
    { fazendaId: fazendaNum },
    { enabled: fazendaOk && origemOp === "batida" },
  );

  const produtosOk = produtos.filter(p => unidadeCompativelFormulacaoKg(p.unidade, p.embalagens));
  const batidaSel = batidasDisp.find(b => String(b.id) === batidaId);
  const planSel = planos.find(p => String(p.id) === planejamentoId);
  const origemEfetiva = origemOp === "batida"
    ? "dieta" as const
    : modo === "plan" && planSel
      ? (planSel.tipoOrigem === "dieta" ? "dieta" : "produto")
      : tipoOrigem;
  const produtoEfetivo = origemOp === "batida"
    ? ""
    : modo === "plan" && planSel?.tipoOrigem === "produto" ? String(planSel.produtoId ?? "") : produtoId;
  const dietaEfetiva = origemOp === "batida"
    ? String(batidaSel?.dietaId ?? "")
    : modo === "plan" && planSel?.tipoOrigem === "dieta" ? String(planSel.dietaId ?? "") : dietaId;
  const planosCompativeis = origemOp === "batida" && batidaSel
    ? planos.filter(p => p.tipoOrigem === "dieta" && Number(p.dietaId) === Number(batidaSel.dietaId))
    : planos;
  const dietaSel = dietas.find(d => String(d.id) === String(dietaEfetiva));
  const exigePreparoDireto =
    origemOp === "direta"
    && origemEfetiva === "dieta"
    && Boolean(dietaSel)
    && !podeDietaSerFornecidaDiretamente(dietaSel?.formaUso);

  const payload = useMemo(() => {
    const qtd = Number(String(quantidade).replace(",", "."));
    if (!(fazendaNum > 0) || !(loteNum > 0) || !data || !(qtd > 0)) return null;
    if (modo === "plan" && !(Number(planejamentoId) > 0)) return null;
    if (origemOp === "batida" && !(Number(batidaId) > 0)) return null;
    return {
      fazendaId: fazendaNum,
      loteId: loteNum,
      planejamentoId: modo === "plan" && Number(planejamentoId) > 0 ? Number(planejamentoId) : null,
      cochoId: Number(cochoId) > 0 ? Number(cochoId) : null,
      tipoOrigem: origemEfetiva as "produto" | "dieta",
      produtoId: origemEfetiva === "produto" && Number(produtoEfetivo) > 0 ? Number(produtoEfetivo) : null,
      dietaId: origemEfetiva === "dieta" && Number(dietaEfetiva) > 0 ? Number(dietaEfetiva) : null,
      origemOperacional: origemOp,
      batidaId: origemOp === "batida" && Number(batidaId) > 0 ? Number(batidaId) : null,
      data,
      hora: hora || null,
      quantidadeFornecidaKg: qtd,
      observacoes: observacoes || null,
    };
  }, [fazendaNum, loteNum, data, hora, modo, planejamentoId, cochoId, origemEfetiva, produtoEfetivo, dietaEfetiva, quantidade, observacoes, origemOp, batidaId]);

  const { data: previewPack } = trpc.nutricaoFornecimentos.preview.useQuery(payload!, { enabled: payload != null });
  const preview = previewPack?.preview;
  const utils = trpc.useUtils();
  const confirmar = trpc.nutricaoFornecimentos.confirmar.useMutation({
    onSuccess: () => {
      toast.success(origemOp === "batida"
        ? "Fornecimento confirmado. Nenhuma baixa de estoque — apenas distribuição da batida."
        : "Fornecimento confirmado. Estoque atualizado.");
      utils.nutricaoFornecimentos.list.invalidate();
      utils.nutricaoBatidas.list.invalidate();
      setLocation(`/nutricao/fornecimentos?fazendaId=${fazendaId}`);
    },
    onError: e => toast.error(e.message),
  });

  const voltarLista = () => setLocation(listaNutricaoComFazenda("/nutricao/fornecimentos", fazendaId));

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
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>Novo Fornecimento</h1>
        </div>
        <div className="px-4 py-5 space-y-6">
          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Informações</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><FormLabel required>Fazenda</FormLabel><FazendaOverviewSelect value={fazendaId} onChange={v => { setFazendaId(v); setLoteId(""); setCochoId(""); }} fazendas={fazendas} required /></div>
              <div>
                <FormLabel required>Lote</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={loteId || "__empty__"} onChange={v => { setLoteId(v === "__empty__" ? "" : v); setPlanejamentoId(""); }}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {lotes.map(l => <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">{l.nome}</SelectItem>)}
                </FormSelect>
              </div>
              <div>
                <FormLabel>Cocho (opcional)</FormLabel>
                {fazendaOk && cochos.length === 0 ? (
                  <p className="text-[12px] text-gray-500 pt-1">Nenhum cocho cadastrado. Você pode continuar sem cocho.</p>
                ) : (
                  <FormSelect variant="light" placeholder="Opcional" value={cochoId || "__empty__"} onChange={v => setCochoId(v === "__empty__" ? "" : v)}>
                    <SelectItem value="__empty__" className="text-[12px] text-gray-400">Sem cocho</SelectItem>
                    {cochos.map(c => <SelectItem key={c.id} value={String(c.id)} className="text-[12px]">{c.identificacao}</SelectItem>)}
                  </FormSelect>
                )}
              </div>
              <div><FormLabel required>Data</FormLabel><FormDatePicker value={data} onChange={setData} max={hojeISO()} /></div>
              <div><FormLabel>Hora</FormLabel><FormInput variant="light" value={hora} onChange={setHora} placeholder="HH:MM" /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Origem operacional</h2>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
              <button type="button" onClick={() => { setOrigemOp("direta"); setBatidaId(""); }} className={cn("px-4 min-h-[36px] text-[12px] font-semibold", origemOp === "direta" ? "text-gray-900" : "bg-white text-gray-500")} style={origemOp === "direta" ? { backgroundColor: FD_PRIMARY } : undefined}>Direto</button>
              <button type="button" onClick={() => { setOrigemOp("batida"); setTipoOrigem("dieta"); setProdutoId(""); setModo("avulso"); }} className={cn("px-4 min-h-[36px] text-[12px] font-semibold", origemOp === "batida" ? "text-gray-900" : "bg-white text-gray-500")} style={origemOp === "batida" ? { backgroundColor: FD_PRIMARY } : undefined}>De uma Batida</button>
            </div>
            {origemOp === "batida" && (
              <div className="max-w-xl space-y-2">
                <FormLabel required>Batida</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={batidaId || "__empty__"} onChange={v => { setBatidaId(v === "__empty__" ? "" : v); setPlanejamentoId(""); }}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {batidasDisp.map(b => (
                    <SelectItem key={b.id} value={String(b.id)} className="text-[12px]">
                      Batida {b.id} · {b.dietaNomeSnapshot} · saldo {b.saldoDisponivelKg.toLocaleString("pt-BR")} kg
                    </SelectItem>
                  ))}
                </FormSelect>
                {batidaSel && (
                  <p className="text-[12px] text-gray-600">
                    Dieta: <strong>{batidaSel.dietaNomeSnapshot}</strong> · Saldo disponível: <strong>{batidaSel.saldoDisponivelKg.toLocaleString("pt-BR")} kg</strong>
                    {" · "}A dieta não pode ser trocada. Esta distribuição não baixa estoque.
                  </p>
                )}
                {batidasDisp.length === 0 && <p className="text-[12px] text-gray-500">Nenhuma batida confirmada com saldo nesta fazenda.</p>}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Planejamento</h2>
            {loteNum > 0 && planos.length === 0 && <p className="text-[12px] text-gray-500">{MSG_FORN_SEM_PLAN}. Você pode registrar um fornecimento avulso.</p>}
            {planos.length > 0 && (
              <div className="space-y-2">
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                  <button type="button" onClick={() => { setModo("plan"); }} className={cn("px-4 min-h-[36px] text-[12px] font-semibold", modo === "plan" ? "text-gray-900" : "bg-white text-gray-500")} style={modo === "plan" ? { backgroundColor: FD_PRIMARY } : undefined}>Usar planejamento</button>
                  <button type="button" onClick={() => { setModo("avulso"); setPlanejamentoId(""); }} className={cn("px-4 min-h-[36px] text-[12px] font-semibold", modo === "avulso" ? "text-gray-900" : "bg-white text-gray-500")} style={modo === "avulso" ? { backgroundColor: FD_PRIMARY } : undefined}>Fornecimento avulso</button>
                </div>
                {modo === "plan" && (
                  <FormSelect variant="light" placeholder="Selecione o planejamento" value={planejamentoId || "__empty__"} onChange={v => setPlanejamentoId(v === "__empty__" ? "" : v)}>
                    <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                    {planosCompativeis.map(p => {
                      const nome = p.tipoOrigem === "dieta"
                        ? (dietas.find(d => d.id === p.dietaId)?.nome ?? `Dieta ${p.dietaId}`)
                        : (produtos.find(x => x.produtoId === p.produtoId)?.nome ?? `Produto ${p.produtoId}`);
                      return (
                        <SelectItem key={p.id} value={String(p.id)} className="text-[12px]">
                          {nome} · {formatarMetaPlan(p.modalidadeMeta, p.valorMeta)}
                        </SelectItem>
                      );
                    })}
                  </FormSelect>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Alimentação</h2>
            {origemOp === "direta" && modo === "avulso" && (
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                {(["produto", "dieta"] as const).map(t => (
                  <button key={t} type="button" onClick={() => setTipoOrigem(t)} className={cn("px-4 min-h-[36px] text-[12px] font-semibold", origemEfetiva === t ? "text-gray-900" : "bg-white text-gray-500")} style={origemEfetiva === t ? { backgroundColor: FD_PRIMARY } : undefined}>
                    {t === "produto" ? "Produto pronto" : "Dieta"}
                  </button>
                ))}
              </div>
            )}
            {origemOp === "batida" ? (
              <div className="max-w-xl">
                <FormLabel>Dieta</FormLabel>
                <FormInput variant="light" value={batidaSel?.dietaNomeSnapshot ?? ""} onChange={() => undefined} readOnly />
              </div>
            ) : origemEfetiva === "produto" ? (
              <div className="max-w-xl">
                <FormLabel required>Produto</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={produtoEfetivo || "__empty__"} onChange={v => setProdutoId(v === "__empty__" ? "" : v)} disabled={modo === "plan"}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {produtosOk.map(p => <SelectItem key={p.produtoId} value={String(p.produtoId)} className="text-[12px]">{p.nome}</SelectItem>)}
                </FormSelect>
              </div>
            ) : (
              <div className="max-w-xl">
                <FormLabel required>Dieta</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={dietaEfetiva || "__empty__"} onChange={v => setDietaId(v === "__empty__" ? "" : v)} disabled={modo === "plan"}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {dietas.map(d => <SelectItem key={d.id} value={String(d.id)} className="text-[12px]">{d.nome}</SelectItem>)}
                </FormSelect>
                {exigePreparoDireto && (
                  <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 space-y-2">
                    <p>{MSG_FORN_DIETA_EXIGE_PREPARO_UI}</p>
                    <button
                      type="button"
                      className="underline font-semibold"
                      onClick={() => { setOrigemOp("batida"); setTipoOrigem("dieta"); setProdutoId(""); }}
                    >
                      Usar uma Batida
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="max-w-[220px]">
              <FormLabel required>Quantidade fornecida (kg)</FormLabel>
              <FormInput variant="light" required value={quantidade} onChange={setQuantidade} inputMode="decimal" />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Prévia do evento</h2>
            {preview?.loteVazio && <p className="text-[12px] text-amber-800 font-semibold">{MSG_FORN_LOTE_VAZIO} A confirmação é permitida, mas não haverá kg/cabeça.</p>}
            {preview && (
              <div className="space-y-3 text-[12px]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 rounded px-3 py-3">
                  <div><div className="text-[10px] uppercase text-gray-500">Animais atuais</div><div className="font-semibold">{preview.animaisAtuais}</div></div>
                  <div><div className="text-[10px] uppercase text-gray-500">A oferecer</div><div className="font-semibold">{preview.quantidadeKg.toLocaleString("pt-BR")} kg</div></div>
                  <div><div className="text-[10px] uppercase text-gray-500">Oferecido/cabeça</div><div className="font-semibold">{preview.oferecidoPorCabeca != null ? `${preview.oferecidoPorCabeca.toLocaleString("pt-BR")} kg` : "—"}</div></div>
                  <div><div className="text-[10px] uppercase text-gray-500">Custo previsto</div><div className="font-semibold">{preview.custo.completo && preview.custo.custoTotal != null ? preview.custo.custoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Custo incompleto"}</div></div>
                </div>
                {preview.planejamento?.vinculado && (
                  <p className="text-gray-600">
                    Meta: {preview.planejamento.metaLabel}
                    {preview.planejamento.adLibitum
                      ? " · Oferta à vontade — sem desvio de meta."
                      : preview.planejamento.necessidadeKg != null
                        ? ` · Necessidade projetada: ${preview.planejamento.necessidadeKg.toLocaleString("pt-BR")} kg · Diferença: ${preview.planejamento.diferencaKg! > 0 ? "+" : ""}${preview.planejamento.diferencaKg?.toLocaleString("pt-BR")} kg (informativa, não bloqueia).`
                        : ""}
                  </p>
                )}
                {origemOp === "batida" ? (
                  <p className="text-gray-600">Sem nova baixa de estoque. Os ingredientes já foram baixados na batida.</p>
                ) : (
                <div className="overflow-x-auto border border-gray-200 rounded">
                  <table className="w-full text-[12px]">
                    <thead className="bg-gray-50"><tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-center">Necessário</th>
                      <th className="px-3 py-2 text-center">Saldo</th>
                      <th className="px-3 py-2 text-center">Após</th>
                    </tr></thead>
                    <tbody>
                      {preview.baixas.map(b => (
                        <tr key={b.produtoId} className="border-t">
                          <td className="px-3 py-1.5">{b.nome}</td>
                          <td className="px-3 py-1.5 text-center">
                            {b.quantidadeKg.toLocaleString("pt-BR")} kg
                            {b.unidade && b.unidade !== "kg" && b.quantidadeUnidade > 0
                              ? ` · ${b.quantidadeUnidade.toLocaleString("pt-BR")} ${b.unidade}`
                              : ""}
                          </td>
                          <td className="px-3 py-1.5 text-center">{b.saldoUnidade.toLocaleString("pt-BR")} {b.unidade}</td>
                          <td className={cn("px-3 py-1.5 text-center", !b.suficiente && "text-red-600 font-semibold")}>{b.saldoAposUnidade.toLocaleString("pt-BR")} {b.unidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
                {(previewPack?.message || preview.motivoBloqueio) && (
                  <p className="text-red-600">{previewPack?.message || preview.motivoBloqueio}</p>
                )}
              </div>
            )}
            <p className="text-[11px] text-gray-500">{origemOp === "batida" ? "A prévia não cria fornecimento nem reserva saldo da batida." : "A prévia não movimenta estoque. Só a confirmação cria o fato e a baixa."}</p>
          </section>

          <section>
            <FormLabel>Observações</FormLabel>
            <FormTextarea variant="light" value={observacoes} onChange={setObservacoes} />
          </section>

          <div className="flex justify-end gap-2">
            <button type="button" className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase bg-[#F0F0F0]" onClick={() => setLocation(`/nutricao/fornecimentos?fazendaId=${fazendaId}`)}>Cancelar</button>
            <button
              type="button"
              disabled={!payload || exigePreparoDireto || previewPack?.ok === false || !preview?.podeConfirmar || confirmar.isPending}
              onClick={() => payload && confirmar.mutate(payload)}
              className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase text-gray-900 disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {confirmar.isPending ? "Confirmando..." : "Confirmar fornecimento"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
