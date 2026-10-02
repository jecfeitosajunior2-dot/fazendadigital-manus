import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FD_PRIMARY, FormDatePicker, FormInput, FormLabel, FormSelect, FormTextarea } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { listaNutricaoComFazenda } from "@/lib/nutricaoRoutes";
import { trpc } from "@/lib/trpc";
import {
  consumoFornCicloJaFechado,
  deveExibirMensagemPreviewLeitura,
  rotuloConsumoAparenteBalanco,
  rotuloSobraInicialBalanco,
} from "@shared/nutricaoCochoLeituras";
import { formatarDataHoraFornecimento } from "@shared/nutricaoFornecimentos";

function hojeISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default function NutricaoCochoLeituraFormPage() {
  const params = useParams<{ id?: string }>();
  const editId = Number(params.id) > 0 ? Number(params.id) : 0;
  const [, setLocation] = useLocation();
  const qs = new URLSearchParams(window.location.search);
  const [fazendaId, setFazendaId] = useState(qs.get("fazendaId") ?? "");
  const [cochoId, setCochoId] = useState(qs.get("cochoId") ?? "");
  const [loteId, setLoteId] = useState(qs.get("loteId") ?? "");
  const [fornecimentoId, setFornecimentoId] = useState(qs.get("fornecimentoId") ?? "");
  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState("");
  const [sobra, setSobra] = useState("");
  const [escore, setEscore] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [preenchido, setPreenchido] = useState(false);

  const { data: existente } = trpc.nutricaoCochoLeituras.get.useQuery({ id: editId }, { enabled: editId > 0 });
  useEffect(() => {
    if (!existente || preenchido) return;
    setFazendaId(String(existente.fazendaId));
    setCochoId(String(existente.cochoId));
    setLoteId(existente.loteId ? String(existente.loteId) : "");
    setFornecimentoId(existente.fornecimentoId ? String(existente.fornecimentoId) : "");
    setData(existente.data);
    setHora(existente.hora ?? "");
    setSobra(existente.sobraKg ?? "");
    setEscore(existente.escore ?? "");
    setObservacoes(existente.observacoes ?? "");
    setPreenchido(true);
  }, [existente, preenchido]);

  const fazendaNum = Number(fazendaId);
  const cochoNum = Number(cochoId);
  const fazendaOk = fazendaNum > 0;
  const vinculoTravado = Boolean(qs.get("fornecimentoId"));
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: cochos = [] } = trpc.nutricaoCochos.list.useQuery(
    { fazendaId: fazendaNum, status: "ativo" },
    { enabled: fazendaOk },
  );
  const { data: lotes = [] } = trpc.nutricaoPlanejamento.listLotes.useQuery({ fazendaId: fazendaNum }, { enabled: fazendaOk });
  const { data: fornsRef = [] } = trpc.nutricaoCochoLeituras.listFornecimentosRef.useQuery(
    { fazendaId: fazendaNum, cochoId: cochoNum },
    { enabled: fazendaOk && cochoNum > 0 },
  );

  const fornSel = fornsRef.find(f => String(f.id) === fornecimentoId);
  const loteEfetivo = fornSel ? String(fornSel.loteId) : loteId;

  const payload = useMemo(() => {
    if (!(fazendaNum > 0) || !(cochoNum > 0) || !data) return null;
    const sobraN = sobra.trim() === "" ? null : Number(String(sobra).replace(",", "."));
    if (sobra.trim() !== "" && (!Number.isFinite(sobraN) || (sobraN as number) < 0)) return null;
    return {
      fazendaId: fazendaNum,
      cochoId: cochoNum,
      loteId: Number(loteEfetivo) > 0 ? Number(loteEfetivo) : null,
      fornecimentoId: Number(fornecimentoId) > 0 ? Number(fornecimentoId) : null,
      data,
      hora: hora || null,
      sobraKg: sobraN,
      escore: escore || null,
      observacoes: observacoes || null,
    };
  }, [fazendaNum, cochoNum, loteEfetivo, fornecimentoId, data, hora, sobra, escore, observacoes]);

  const { data: previewPack } = trpc.nutricaoCochoLeituras.preview.useQuery(
    { ...payload!, novaLeitura: editId === 0 },
    { enabled: payload != null },
  );
  const utils = trpc.useUtils();
  const voltar = () => setLocation(listaNutricaoComFazenda("/nutricao/cochos/leituras", fazendaId));

  const criar = trpc.nutricaoCochoLeituras.create.useMutation({
    onSuccess: () => {
      toast.success("Leitura registrada. Estoque não foi movimentado.");
      utils.nutricaoCochoLeituras.list.invalidate();
      voltar();
    },
    onError: e => toast.error(e.message),
  });
  const editar = trpc.nutricaoCochoLeituras.update.useMutation({
    onSuccess: () => {
      toast.success("Leitura atualizada. O consumo aparente é recalculado dos fatos.");
      utils.nutricaoCochoLeituras.list.invalidate();
      setLocation(`/nutricao/cochos/leituras/${editId}`);
    },
    onError: e => toast.error(e.message),
  });

  const consumo = previewPack?.consumo;
  const cicloFechado = !editId && consumoFornCicloJaFechado(consumo);
  const leituraExistenteId = Number(consumo?.cicloFechado?.leituraId) > 0
    ? Number(consumo?.cicloFechado?.leituraId)
    : 0;
  const pending = criar.isPending || editar.isPending;

  return (
    <AppLayout>
      <button
        type="button"
        onClick={voltar}
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
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
            {editId ? "Editar leitura" : "Nova leitura de cocho"}
          </h1>
        </div>
        <div className="px-4 py-5 space-y-6">
          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Informações</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect value={fazendaId} onChange={v => { setFazendaId(v); setCochoId(""); setLoteId(""); setFornecimentoId(""); }} fazendas={fazendas} required />
              </div>
              <div>
                <FormLabel required>Cocho</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={cochoId || "__empty__"} onChange={v => { setCochoId(v === "__empty__" ? "" : v); if (!vinculoTravado) setFornecimentoId(""); }} disabled={vinculoTravado}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {cochos.map(c => <SelectItem key={c.id} value={String(c.id)} className="text-[12px]">{c.identificacao}</SelectItem>)}
                </FormSelect>
              </div>
              <div><FormLabel required>Data</FormLabel><FormDatePicker value={data} onChange={setData} max={hojeISO()} /></div>
              <div><FormLabel>Hora</FormLabel><FormInput variant="light" value={hora} onChange={setHora} placeholder="HH:MM" /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Contexto</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Lote (opcional)</FormLabel>
                <FormSelect variant="light" placeholder="Opcional" value={loteEfetivo || "__empty__"} onChange={v => setLoteId(v === "__empty__" ? "" : v)} disabled={Boolean(fornSel) || vinculoTravado}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Sem lote</SelectItem>
                  {lotes.map(l => <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">{l.nome}</SelectItem>)}
                </FormSelect>
              </div>
              <div>
                <FormLabel>Fornecimento de referência (opcional)</FormLabel>
                <FormSelect variant="light" placeholder="Opcional" value={fornecimentoId || "__empty__"} onChange={v => setFornecimentoId(v === "__empty__" ? "" : v)} disabled={vinculoTravado || !(cochoNum > 0)}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Leitura avulsa</SelectItem>
                  {fornsRef.map(f => (
                    <SelectItem key={f.id} value={String(f.id)} className="text-[12px]">
                      {formatarDataHoraFornecimento(f.data, f.hora)} · {f.origemNomeSnapshot} · {f.quantidadeFornecidaKg.toLocaleString("pt-BR")} kg
                    </SelectItem>
                  ))}
                </FormSelect>
                {fornSel && (
                  <p className="text-[12px] text-gray-600 mt-1">
                    Lote e alimento vêm deste fornecimento. A leitura não altera o fato original.
                  </p>
                )}
                {cochoNum > 0 && fornsRef.length === 0 && (
                  <p className="text-[12px] text-gray-500 mt-1">Nenhum fornecimento confirmado neste cocho. Você pode registrar uma leitura avulsa.</p>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Leitura</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Sobra (kg)</FormLabel>
                <FormInput variant="light" value={sobra} onChange={setSobra} inputMode="decimal" placeholder="Opcional" />
                <p className="text-[11px] text-gray-500 mt-1">0 kg é válido. Não devolve estoque.</p>
              </div>
              <div>
                <FormLabel>Escore</FormLabel>
                <FormInput variant="light" value={escore} onChange={setEscore} placeholder="Avaliação visual (opcional)" />
                <p className="text-[11px] text-gray-500 mt-1">Campo operacional. Não vira kg automaticamente.</p>
              </div>
            </div>
            <div>
              <FormLabel>Observações</FormLabel>
              <FormTextarea variant="light" value={observacoes} onChange={setObservacoes} />
            </div>
            <p className="text-[11px] text-gray-500">Informe pelo menos sobra, escore ou observação.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Balanço do período</h2>
            {deveExibirMensagemPreviewLeitura(previewPack?.message, consumo) && (
              <p className="text-[12px] text-red-600">{previewPack?.message}</p>
            )}
            {consumo?.calculavel ? (
              <div className="bg-gray-50 rounded px-3 py-3 text-[12px] space-y-1">
                <p>Sobra inicial: <strong>{rotuloSobraInicialBalanco(consumo.sobraInicialKg)}</strong></p>
                <p>{consumo.sobraInicialKg != null ? "+ Fornecido no período" : "Fornecido"}: <strong>{consumo.fornecidoKg?.toLocaleString("pt-BR")} kg</strong></p>
                <p>{consumo.sobraInicialKg != null ? "− Sobra final" : "Sobra final"}: <strong>{consumo.sobraFinalKg?.toLocaleString("pt-BR")} kg</strong></p>
                <p>{consumo.sobraInicialKg != null ? "= " : ""}{rotuloConsumoAparenteBalanco(consumo.sobraInicialKg)}: <strong>{consumo.consumoAparenteKg?.toLocaleString("pt-BR")} kg</strong></p>
                {consumo.formula && <p className="text-gray-500">{consumo.formula}</p>}
                <p className="text-gray-500">Isso é consumo aparente, não consumo real. A prévia não grava a leitura.</p>
              </div>
            ) : cicloFechado ? (
              <div className="bg-gray-50 rounded px-3 py-3 text-[12px] space-y-2">
                <p className="text-gray-700">{consumo?.motivo}</p>
                <p className="text-gray-600">Para iniciar um novo ciclo, registre um novo fornecimento.</p>
                {leituraExistenteId > 0 ? (
                  <button
                    type="button"
                    className="text-[12px] text-gray-600 underline"
                    onClick={() => setLocation(`/nutricao/cochos/leituras/${leituraExistenteId}`)}
                  >
                    Ver leitura existente
                  </button>
                ) : null}
              </div>
            ) : consumo ? (
              <p className="text-[12px] text-gray-600">Consumo aparente indisponível: {consumo.motivo}</p>
            ) : (
              <p className="text-[12px] text-gray-500">Preencha a leitura para ver se o balanço pode ser calculado.</p>
            )}
          </section>

          <div className="flex justify-end gap-2">
            <button type="button" className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase bg-[#F0F0F0]" onClick={voltar}>Cancelar</button>
            <button
              type="button"
              disabled={!payload || previewPack?.ok === false || pending || cicloFechado}
              onClick={() => payload && (editId ? editar.mutate({ id: editId, ...payload }) : criar.mutate(payload))}
              className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase text-gray-900 disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {pending ? "Salvando..." : editId ? "Salvar correção" : "Registrar leitura"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
