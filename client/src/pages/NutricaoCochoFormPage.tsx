import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FD_PRIMARY, FormInput, FormLabel, FormSelect, FormTextarea } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { NUTRICAO_COCHO_TIPOS, parseMedidaOpcional, type NutricaoCochoTipo } from "@shared/nutricaoCochos";

export default function NutricaoCochoFormPage() {
  const params = useParams<{ id?: string }>();
  const cochoId = params.id ? Number(params.id) : null;
  const isEdit = Number.isFinite(cochoId) && (cochoId ?? 0) > 0;
  const [, setLocation] = useLocation();
  const fazendaFromUrl = new URLSearchParams(window.location.search).get("fazendaId") ?? "";

  const [fazendaId, setFazendaId] = useState(fazendaFromUrl);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState("");
  const [pastoId, setPastoId] = useState("");
  const [localizacaoDescricao, setLocalizacaoDescricao] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [largura, setLargura] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [lados, setLados] = useState("");
  const [coberto, setCoberto] = useState(false);
  const [observacoes, setObservacoes] = useState("");

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const fazendaNum = Number(fazendaId);
  const fazendaOk = fazendaNum > 0;
  const { data: pastos = [] } = trpc.nutricaoCochos.listPastos.useQuery({ fazendaId: fazendaNum }, { enabled: fazendaOk });
  const { data: existente } = trpc.nutricaoCochos.get.useQuery({ id: cochoId! }, { enabled: isEdit });

  useEffect(() => {
    if (!existente) return;
    setFazendaId(String(existente.fazendaId));
    setNome(existente.nome);
    setCodigo(existente.codigo ?? "");
    setTipo(existente.tipo);
    setPastoId(existente.pastoId ? String(existente.pastoId) : "");
    setLocalizacaoDescricao(existente.localizacaoDescricao ?? "");
    setComprimento(existente.comprimentoMetros ?? "");
    setLargura(existente.larguraMetros ?? "");
    setCapacidade(existente.capacidadeKg ?? "");
    setLados(existente.ladosAcesso != null ? String(existente.ladosAcesso) : "");
    setCoberto(Boolean(existente.coberto));
    setObservacoes(existente.observacoes ?? "");
  }, [existente]);

  const utils = trpc.useUtils();
  const voltar = () => setLocation(fazendaId ? `/nutricao/cochos?fazendaId=${fazendaId}` : "/nutricao/cochos");
  const createMut = trpc.nutricaoCochos.create.useMutation({
    onSuccess: () => { toast.success("Cocho cadastrado."); utils.nutricaoCochos.list.invalidate(); voltar(); },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.nutricaoCochos.update.useMutation({
    onSuccess: () => { toast.success("Cocho atualizado."); utils.nutricaoCochos.list.invalidate(); utils.nutricaoCochos.get.invalidate({ id: cochoId! }); setLocation(`/nutricao/cochos/${cochoId}`); },
    onError: e => toast.error(e.message),
  });

  const lerMedida = (v: string): { ok: boolean; value: number | null } => {
    if (!v.trim()) return { ok: true, value: null };
    const n = parseMedidaOpcional(v);
    return n != null && Number.isFinite(n) && n > 0 ? { ok: true, value: n } : { ok: false, value: null };
  };
  const comp = lerMedida(comprimento);
  const larg = lerMedida(largura);
  const cap = lerMedida(capacidade);
  const payload = {
    fazendaId: fazendaNum,
    nome: nome.trim(),
    codigo: codigo.trim() || null,
    tipo: tipo as NutricaoCochoTipo,
    pastoId: Number(pastoId) > 0 ? Number(pastoId) : null,
    localizacaoDescricao: localizacaoDescricao.trim() || null,
    comprimentoMetros: comp.value,
    larguraMetros: larg.value,
    capacidadeKg: cap.value,
    ladosAcesso: lados === "1" || lados === "2" ? Number(lados) as 1 | 2 : null,
    coberto,
    observacoes: observacoes.trim() || null,
  };

  const canSave = fazendaOk && payload.nome && tipo && comp.ok && larg.ok && cap.ok;
  const pending = createMut.isPending || updateMut.isPending;

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>{isEdit ? "Editar Cocho" : "Novo Cocho"}</h1>
          <button type="button" className="text-[12px] text-gray-600 underline" onClick={voltar}>Voltar</button>
        </div>
        <div className="px-4 py-5 space-y-6">
          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Identificação</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect value={fazendaId} onChange={v => { setFazendaId(v); setPastoId(""); }} fazendas={fazendas} required disabled={isEdit} />
              </div>
              <div>
                <FormLabel required>Nome</FormLabel>
                <FormInput variant="light" required value={nome} onChange={setNome} placeholder="Ex.: Cocho Pasto 444" />
              </div>
              <div>
                <FormLabel>Código</FormLabel>
                <FormInput variant="light" value={codigo} onChange={setCodigo} placeholder="Ex.: C01" />
              </div>
              <div>
                <FormLabel required>Tipo</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={tipo || "__empty__"} onChange={v => setTipo(v === "__empty__" ? "" : v)}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {NUTRICAO_COCHO_TIPOS.map(t => <SelectItem key={t.value} value={t.value} className="text-[12px]">{t.label}</SelectItem>)}
                </FormSelect>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Localização</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Pasto</FormLabel>
                <FormSelect variant="light" placeholder="Opcional" value={pastoId || "__empty__"} onChange={v => setPastoId(v === "__empty__" ? "" : v)}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Sem pasto</SelectItem>
                  {pastos.map(p => <SelectItem key={p.id} value={String(p.id)} className="text-[12px]">{p.nome}</SelectItem>)}
                </FormSelect>
              </div>
              <div>
                <FormLabel>Localização / referência</FormLabel>
                <FormInput variant="light" value={localizacaoDescricao} onChange={setLocalizacaoDescricao} placeholder="Ex.: próximo ao bebedouro norte" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Características</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Comprimento (m)</FormLabel>
                <FormInput variant="light" value={comprimento} onChange={setComprimento} inputMode="decimal" />
              </div>
              <div>
                <FormLabel>Largura (m)</FormLabel>
                <FormInput variant="light" value={largura} onChange={setLargura} inputMode="decimal" />
              </div>
              <div>
                <FormLabel>Capacidade estimada (kg)</FormLabel>
                <FormInput variant="light" value={capacidade} onChange={setCapacidade} inputMode="decimal" />
              </div>
              <div>
                <FormLabel>Lados de acesso</FormLabel>
                <FormSelect variant="light" placeholder="Opcional" value={lados || "__empty__"} onChange={v => setLados(v === "__empty__" ? "" : v)}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Não informado</SelectItem>
                  <SelectItem value="1" className="text-[12px]">1 lado</SelectItem>
                  <SelectItem value="2" className="text-[12px]">2 lados</SelectItem>
                </FormSelect>
              </div>
              <div>
                <FormLabel>Coberto</FormLabel>
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                  <button type="button" onClick={() => setCoberto(true)} className={cn("px-4 min-h-[36px] text-[12px] font-semibold", coberto ? "text-gray-900" : "bg-white text-gray-500")} style={coberto ? { backgroundColor: FD_PRIMARY } : undefined}>Sim</button>
                  <button type="button" onClick={() => setCoberto(false)} className={cn("px-4 min-h-[36px] text-[12px] font-semibold", !coberto ? "text-gray-900" : "bg-white text-gray-500")} style={!coberto ? { backgroundColor: FD_PRIMARY } : undefined}>Não</button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <FormLabel>Observações</FormLabel>
            <FormTextarea variant="light" value={observacoes} onChange={setObservacoes} />
          </section>

          <div className="flex justify-end gap-2">
            <button type="button" className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase bg-[#F0F0F0]" onClick={voltar}>Cancelar</button>
            <button
              type="button"
              disabled={!canSave || pending}
              onClick={() => isEdit ? updateMut.mutate({ id: cochoId!, ...payload }) : createMut.mutate(payload)}
              className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase text-gray-900 disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {pending ? "Salvando..." : "Salvar Cocho"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
