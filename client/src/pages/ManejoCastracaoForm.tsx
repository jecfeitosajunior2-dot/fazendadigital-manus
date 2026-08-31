import AppLayout from "@/components/AppLayout";
import { BloqueioNegocioDialog } from "@/components/BloqueioNegocioDialog";
import { AnimalAutocomplete } from "@/components/AnimalAutocomplete";
import {
  FieldBox,
  FormDatePicker,
  FormDownSelect,
  FormInput,
  FormLabel,
} from "@/components/FormFields";
import { trpc } from "@/lib/trpc";
import { resolveAnimalIdFromSelecao } from "@shared/animalAutocomplete";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import { persistRebanhoFazendaId } from "@shared/animal-filter-types";
import { formatLoteAtualDisplay } from "@shared/transferirAnimaisEntreLotes";
import {
  filtrarMachosElegiveisCastracao,
  METODOS_CASTRACAO,
  MSG_CASTRACAO_GENERICO,
  MSG_CASTRACAO_SUCESSO,
  podeSalvarCastracao,
  type MetodoCastracao,
} from "@shared/castracaoManejo";
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

type AnimalCastracaoRow = {
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
  castrado?: boolean | number | null;
  categoria?: string | null;
};

const metodoOptions = METODOS_CASTRACAO.map(m => ({ value: m.value, label: m.label }));

export function ManejoCastracaoForm() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: lotes = [] } = trpc.lotes.list.useQuery({ somenteAtivos: true });

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [animalSel, setAnimalSel] = useState<AnimalCastracaoRow | null>(null);
  const [dataCastracao, setDataCastracao] = useState(todayISODate);
  const [metodo, setMetodo] = useState("");
  const [descricaoMetodo, setDescricaoMetodo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [bloqueioMsg, setBloqueioMsg] = useState<string | null>(null);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;
  const metodoOutro = metodo === "outro";

  const { data: animais = [], isLoading: loadingAnimais } = trpc.animais.list.useQuery(
    {
      fazendaId: fazendaNum || undefined,
      status: "ativo",
      dataManejo: dataCastracao,
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

  const machos = useMemo(
    () =>
      filtrarMachosElegiveisCastracao(
        (animais as AnimalCastracaoRow[]).map(animal => ({ ...animal, status: "ativo" })),
      ),
    [animais],
  );

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

  const podeSalvar = podeSalvarCastracao({
    fazendaId: fazendaNum || null,
    animalId,
    dataCastracao,
    metodo,
    descricaoMetodo,
  });

  const mutation = trpc.saude.registrarCastracao.useMutation({
    onSuccess: async () => {
      toast.success(MSG_CASTRACAO_SUCESSO);
      await Promise.all([
        utils.animais.list.invalidate(),
        utils.animais.getById.invalidate(),
        utils.saude.list.invalidate(),
      ]);
      setLocation("/manejo/registros");
    },
    onError: err => {
      const message = err.message || MSG_CASTRACAO_GENERICO;
      if (isMensagemBloqueioBaixa(message)) {
        setBloqueioMsg(message);
        return;
      }
      toast.error(message);
    },
  });

  const limparDependentes = () => {
    setAnimalSel(null);
    setMetodo("");
    setDescricaoMetodo("");
  };

  const onChangeFazenda = (next: string) => {
    setFazendaId(next);
    persistRebanhoFazendaId(next);
    limparDependentes();
  };

  const handleAnimalSelect = useCallback((a: AnimalCastracaoRow | null) => {
    setAnimalSel(a);
  }, []);

  const handleDataChange = (v: string) => {
    if (v && v > todayISODate()) {
      toast.error("A data da castração não pode ser futura.");
      return;
    }
    setDataCastracao(v);
  };

  const handleMetodoChange = (next: string) => {
    setMetodo(next);
    if (next !== "outro") setDescricaoMetodo("");
  };

  const handleSalvar = () => {
    if (!podeSalvar || !animalId || !isMetodo(metodo)) return;
    mutation.mutate({
      fazendaId: fazendaNum,
      animalId,
      dataCastracao,
      metodo,
      descricaoMetodo: metodoOutro ? descricaoMetodo.trim() : undefined,
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
            Castração
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
              value={dataCastracao}
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
              animals={machos}
              loading={Boolean(fazendaNum) && loadingAnimais}
              disabled={!fazendaNum}
              inputClassName={fieldCls}
              placeholder="Buscar por brinco, RFID ou nome…"
              emptyMessage="Nenhum macho ativo nesta Fazenda."
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
          <FormLabel required>Método</FormLabel>
          <FormDownSelect
            value={metodo}
            onChange={handleMetodoChange}
            placeholder="Selecione o método"
            options={metodoOptions}
          />
          {metodoOutro ? (
            <div className="mt-3">
              <FormLabel required>Descrição do método</FormLabel>
              <FormInput
                value={descricaoMetodo}
                onChange={setDescricaoMetodo}
                placeholder="Ex.: técnica utilizada"
                variant="light"
              />
            </div>
          ) : null}
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

function isMetodo(value: string): value is MetodoCastracao {
  return METODOS_CASTRACAO.some(m => m.value === value);
}
