import AppLayout from "@/components/AppLayout";
import { AnimalAutocomplete } from "@/components/AnimalAutocomplete";
import { BloqueioNegocioDialog } from "@/components/BloqueioNegocioDialog";
import {
  FieldBox,
  FormDatePicker,
  FormInput,
  FormLabel,
} from "@/components/FormFields";
import { trpc } from "@/lib/trpc";
import { resolveAnimalIdFromSelecao } from "@shared/animalAutocomplete";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import { persistRebanhoFazendaId } from "@shared/animal-filter-types";
import { formatLoteAtualDisplay } from "@shared/transferirAnimaisEntreLotes";
import {
  filtrarAnimaisElegiveisDesmama,
  isAnimalElegivelParaDesmama,
  MSG_DESMAMA_GENERICO,
  MSG_DESMAMA_IDADE,
  MSG_DESMAMA_PESO,
  MSG_DESMAMA_SUCESSO,
  parsePesoKgDesmama,
  podeSalvarDesmama,
} from "@shared/desmamaManejo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const FD_PRIMARY = "#4ECDC4";

const fieldCls =
  "w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]";
const labelCls = "block text-[11px] text-gray-600 font-medium mb-1";

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type LoteOpt = {
  id: number;
  nome: string;
  pastoNome?: string | null;
};

type AnimalDesmamaRow = {
  id: number;
  brinco?: string | null;
  nome?: string | null;
  brincoEletronico?: string | null;
  sexo?: string | null;
  loteId?: number | null;
  loteNome?: string | null;
  fazendaId?: number | null;
  pastoNome?: string | null;
  status?: string | null;
  dataDesmama?: string | Date | null;
  dataNascimento?: string | null;
  categoria?: string | null;
};

export function ManejoDesmamaForm() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: lotes = [] } = trpc.lotes.list.useQuery({ somenteAtivos: true });

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [animalSel, setAnimalSel] = useState<AnimalDesmamaRow | null>(null);
  const [dataDesmama, setDataDesmama] = useState(todayISODate);
  const [pesoKg, setPesoKg] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [bloqueioMsg, setBloqueioMsg] = useState<string | null>(null);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;

  const { data: animais = [], isLoading: loadingAnimais } = trpc.animais.list.useQuery(
    {
      fazendaId: fazendaNum || undefined,
      status: "ativo",
      dataManejo: dataDesmama,
    },
    { enabled: Boolean(fazendaNum) },
  );

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const resolved = fazendas.length === 1 ? String(fazendas[0]!.id) : "";
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  const elegiveis = useMemo(
    () =>
      filtrarAnimaisElegiveisDesmama(
        (animais as AnimalDesmamaRow[]).map(animal => ({ ...animal, status: "ativo" })),
        dataDesmama,
      ),
    [animais, dataDesmama],
  );

  useEffect(() => {
    if (!animalSel) return;
    const r = isAnimalElegivelParaDesmama({
      status: animalSel.status,
      dataDesmama: animalSel.dataDesmama,
      dataNascimento: animalSel.dataNascimento,
      categoria: animalSel.categoria,
      dataEvento: dataDesmama,
    });
    if (r.eligible) return;
    setAnimalSel(null);
    toast(MSG_DESMAMA_IDADE);
  }, [animalSel, dataDesmama]);

  const animalId = resolveAnimalIdFromSelecao(animalSel);

  const loteAtualDoAnimal = useMemo(() => {
    if (!animalSel?.loteId) return null;
    return (lotes as LoteOpt[]).find(l => l.id === animalSel.loteId) ?? null;
  }, [animalSel?.loteId, lotes]);

  const loteAtualId =
    animalSel?.loteId != null && animalSel.loteId > 0 ? animalSel.loteId : null;

  const loteAtualDisplay = useMemo(() => {
    if (!animalSel) return { titulo: "—" };
    return formatLoteAtualDisplay({
      temLote: loteAtualId != null,
      loteNome: loteAtualDoAnimal?.nome ?? animalSel.loteNome,
      pastoNome: loteAtualDoAnimal?.pastoNome ?? animalSel.pastoNome,
    });
  }, [animalSel, loteAtualDoAnimal, loteAtualId]);

  const podeSalvar = podeSalvarDesmama({
    fazendaId: fazendaNum || null,
    animalId,
    dataDesmama,
    pesoKg,
  });

  const mutation = trpc.animais.registrarDesmama.useMutation({
    onSuccess: async () => {
      toast.success(MSG_DESMAMA_SUCESSO);
      await Promise.all([
        utils.animais.list.invalidate(),
        utils.animais.getById.invalidate(),
        utils.pesagens.list.invalidate(),
      ]);
      setLocation("/manejo/registros");
    },
    onError: err => {
      const message = err.message || MSG_DESMAMA_GENERICO;
      if (isMensagemBloqueioBaixa(message)) {
        setBloqueioMsg(message);
        return;
      }
      toast.error(message);
    },
  });

  const limparDependentes = () => {
    setAnimalSel(null);
    setPesoKg("");
  };

  const onChangeFazenda = (next: string) => {
    setFazendaId(next);
    persistRebanhoFazendaId(next);
    limparDependentes();
  };

  const handleAnimalSelect = useCallback((a: AnimalDesmamaRow | null) => {
    setAnimalSel(a);
  }, []);

  const handleDataChange = (v: string) => {
    if (v && v > todayISODate()) {
      toast.error("A data da desmama não pode ser futura.");
      return;
    }
    setDataDesmama(v);
  };

  const handleSalvar = () => {
    if (!podeSalvar || !animalId) return;
    const pesoOk = parsePesoKgDesmama(pesoKg);
    if (!pesoOk.ok) {
      toast.error(MSG_DESMAMA_PESO);
      return;
    }
    mutation.mutate({
      fazendaId: fazendaNum,
      animalId,
      dataDesmama,
      pesoKg: pesoOk.peso,
      observacoes: observacoes.trim() || undefined,
    });
  };

  const salvarDisabled = !podeSalvar || mutation.isPending;

  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Manejo pontual
          </p>
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Desmama
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocation("/manejo/registros")}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvarDisabled}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[40px] disabled:opacity-60"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
          {unicaFazenda && fazendaId && nomeFazenda ? (
            <div className="min-w-0">
              <label className={labelCls}>Fazenda</label>
              <div
                className={`${fieldCls} bg-gray-50 text-gray-800 font-medium flex items-center`}
              >
                {nomeFazenda}
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <label className={labelCls}>
                Fazenda<span className="text-red-500">*</span>
              </label>
              <select
                value={fazendaId}
                onChange={e => onChangeFazenda(e.target.value)}
                className={fieldCls}
                disabled={loadingFazendas || !fazendaInitDone}
              >
                <option value="">Selecione uma Fazenda</option>
                {fazendas.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="min-w-0">
            <FormLabel required>Data</FormLabel>
            <FormDatePicker
              value={dataDesmama}
              onChange={handleDataChange}
              max={todayISODate()}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FormLabel required>Animal</FormLabel>
            <AnimalAutocomplete
              selected={animalSel}
              onSelect={handleAnimalSelect}
              animals={elegiveis}
              loading={Boolean(fazendaNum) && loadingAnimais}
              disabled={!fazendaNum}
              inputClassName={fieldCls}
              placeholder="Buscar por brinco, RFID ou nome…"
              emptyMessage="Nenhum animal com idade compatível para Desmama nesta data."
              hintMessage={
                fazendaNum
                  ? "Clique para ver animais ou digite para filtrar."
                  : "Selecione uma Fazenda primeiro."
              }
            />
          </div>

          <div>
            <FormLabel>Lote atual</FormLabel>
            <FieldBox variant="light">
              <div className="px-3 py-2 min-h-[34px]">
                <p className="text-[12px] font-medium text-gray-800">
                  {loteAtualDisplay.titulo || "—"}
                </p>
                {loteAtualDisplay.subtitulo ? (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {loteAtualDisplay.subtitulo}
                  </p>
                ) : null}
              </div>
            </FieldBox>
          </div>
        </div>

        <div>
          <FormLabel>Peso à desmama (kg)</FormLabel>
          <FormInput
            value={pesoKg}
            onChange={setPesoKg}
            placeholder="Opcional"
            inputMode="decimal"
            variant="light"
          />
        </div>

        <div>
          <FormLabel>Observações</FormLabel>
          <textarea
            rows={3}
            value={observacoes}
            onChange={e => setObservacoes(e.target.value)}
            className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 resize-none"
            placeholder="Opcional"
            maxLength={2000}
          />
        </div>
      </div>
      <BloqueioNegocioDialog
        message={bloqueioMsg}
        onClose={() => setBloqueioMsg(null)}
      />
    </AppLayout>
  );
}
