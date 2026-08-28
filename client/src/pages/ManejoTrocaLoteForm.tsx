import AppLayout from "@/components/AppLayout";
import { AnimalAutocomplete } from "@/components/AnimalAutocomplete";
import {
  FieldBox,
  FormDatePicker,
  FormLabel,
  FormNativeSelect,
} from "@/components/FormFields";
import { trpc } from "@/lib/trpc";
import { resolveAnimalIdFromSelecao } from "@shared/animalAutocomplete";
import {
  persistRebanhoFazendaId,
} from "@shared/animal-filter-types";
import {
  filtrarLotesDestinoTroca,
  formatLoteAtualDisplay,
  isMesmoLoteDestino,
  labelLoteDestinoComPasto,
  MSG_TROCA_LOTE_GENERICO,
  MSG_TROCA_LOTE_MESMO_LOTE,
  podeSalvarTrocaLote,
} from "@shared/transferirAnimaisEntreLotes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const FD_PRIMARY = "#4ECDC4";

const fieldCls =
  "w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]";

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type LoteDestinoOpt = {
  id: number;
  nome: string;
  fazendaId?: number | null;
  ativo?: boolean | null;
  pastoNome?: string | null;
};

type AnimalTrocaLoteRow = {
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
};

export function ManejoTrocaLoteForm() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: lotes = [], isLoading: lotesLoading } = trpc.lotes.list.useQuery({
    somenteAtivos: true,
  });

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [animalSel, setAnimalSel] = useState<AnimalTrocaLoteRow | null>(null);
  const [dataMovimentacao, setDataMovimentacao] = useState(todayISODate);
  const [loteDestinoId, setLoteDestinoId] = useState("");

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;

  const { data: animais = [], isLoading: loadingAnimais } = trpc.animais.list.useQuery(
    { fazendaId: fazendaNum || undefined, status: "ativo" },
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

  const animalId = resolveAnimalIdFromSelecao(animalSel);

  const loteAtualDoAnimal = useMemo(() => {
    if (!animalSel?.loteId) return null;
    return lotes.find(l => l.id === animalSel.loteId) ?? null;
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

  const lotesDestino = useMemo(() => {
    if (!fazendaNum) return [];
    return filtrarLotesDestinoTroca(lotes as LoteDestinoOpt[], {
      fazendaAnimalId: fazendaNum,
      loteAtualId,
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lotes, fazendaNum, loteAtualId]);

  const destinoOptions = useMemo(
    () =>
      lotesDestino.map(l => ({
        value: String(l.id),
        label: labelLoteDestinoComPasto(l.nome, l.pastoNome),
      })),
    [lotesDestino],
  );

  const loteDestino = useMemo(
    () => lotesDestino.find(l => String(l.id) === loteDestinoId) ?? null,
    [lotesDestino, loteDestinoId],
  );

  const destinoSelectValue = loteDestino ? String(loteDestino.id) : "";

  useEffect(() => {
    if (!loteDestinoId) return;
    if (!loteDestino) setLoteDestinoId("");
  }, [loteDestinoId, loteDestino]);

  const destinoIdNum = loteDestino?.id ?? null;
  const mesmoLote = isMesmoLoteDestino(loteAtualId, destinoIdNum ?? 0);

  const podeSalvar =
    podeSalvarTrocaLote({
      fazendaId: fazendaNum || null,
      animalId,
      dataMovimentacao,
      loteDestinoId: destinoIdNum,
      loteAtualId,
    }) && Boolean(loteDestino);

  const mutation = trpc.lotes.movimentarAnimais.useMutation({
    onSuccess: async data => {
      toast.success(`Animal transferido para o lote ${data.loteDestinoNome}.`);
      await Promise.all([
        utils.animais.list.invalidate(),
        utils.animais.getById.invalidate(),
        utils.animais.historicoPastos.invalidate(),
        utils.lotes.list.invalidate(),
        utils.lotes.gerenciamento.invalidate(),
        utils.lotes.listHistoricoMovimentacoesAnimais.invalidate(),
        utils.lotes.ultimaMovimentacaoPorAnimais.invalidate(),
      ]);
      setLocation("/manejo/registros");
    },
    onError: err => {
      toast.error(err.message || MSG_TROCA_LOTE_GENERICO);
    },
  });

  const onChangeFazenda = (next: string) => {
    setFazendaId(next);
    persistRebanhoFazendaId(next);
    setAnimalSel(null);
    setLoteDestinoId("");
  };

  const handleAnimalSelect = useCallback((a: AnimalTrocaLoteRow | null) => {
    setAnimalSel(a);
  }, []);

  const handleDataChange = (v: string) => {
    if (v && v > todayISODate()) {
      toast.error("A data da movimentação não pode ser futura.");
      return;
    }
    setDataMovimentacao(v);
  };

  const handleSalvar = () => {
    if (!fazendaNum) {
      toast.error("Selecione uma Fazenda.");
      return;
    }
    if (!animalId || !animalSel) {
      toast.error("Selecione um animal válido.");
      return;
    }
    if (!dataMovimentacao) {
      toast.error("Data da movimentação é obrigatória.");
      return;
    }
    if (dataMovimentacao > todayISODate()) {
      toast.error("A data da movimentação não pode ser futura.");
      return;
    }
    if (!loteDestino) {
      toast.error("Selecione o lote de destino.");
      return;
    }
    if (isMesmoLoteDestino(loteAtualId, loteDestino.id)) {
      toast.error(MSG_TROCA_LOTE_MESMO_LOTE);
      return;
    }

    mutation.mutate({
      animalIds: [animalId],
      loteDestinoId: loteDestino.id,
      dataMovimentacao,
    });
  };

  const fazendaOptions = useMemo(
    () => fazendas.map(f => ({ value: String(f.id), label: f.nome })),
    [fazendas],
  );

  const destinoDisabled = !fazendaNum || mutation.isPending;
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
            Troca de Lote
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

      <div className="bg-white rounded shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FormLabel required>Fazenda</FormLabel>
            {unicaFazenda && fazendaId && nomeFazenda ? (
              <FieldBox variant="light" required>
                <div className="px-3 py-2 min-h-[34px] text-[12px] font-medium text-gray-800 flex items-center">
                  {nomeFazenda}
                </div>
              </FieldBox>
            ) : (
              <FormNativeSelect
                value={fazendaId}
                onChange={onChangeFazenda}
                placeholder="Selecione uma Fazenda"
                required
                variant="light"
                disabled={loadingFazendas || !fazendaInitDone}
                options={fazendaOptions}
              />
            )}
          </div>

          <div>
            <FormLabel required>Data da movimentação</FormLabel>
            <FormDatePicker
              value={dataMovimentacao}
              onChange={handleDataChange}
              placeholder="DD/MM/AAAA"
              required
              max={todayISODate()}
            />
          </div>

          <div>
            <FormLabel required>Animal</FormLabel>
            <AnimalAutocomplete
              selected={animalSel}
              onSelect={handleAnimalSelect}
              animals={animais as AnimalTrocaLoteRow[]}
              loading={Boolean(fazendaNum) && loadingAnimais}
              disabled={!fazendaNum}
              inputClassName={fieldCls}
              placeholder="Buscar por brinco, RFID ou nome…"
              emptyMessage="Nenhum animal ativo nesta Fazenda."
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

          <div className="sm:col-span-2">
            <FormLabel required>Lote de destino</FormLabel>
            {lotesLoading ? (
              <p className="text-[12px] text-gray-400 py-2">Carregando lotes...</p>
            ) : !fazendaNum ? (
              <FieldBox variant="light">
                <div className="px-3 py-2 min-h-[34px] text-[12px] text-gray-400">
                  Selecione uma Fazenda primeiro
                </div>
              </FieldBox>
            ) : destinoOptions.length === 0 ? (
              <p className="text-[12px] text-amber-700 py-2">
                Nenhum lote de destino disponível nesta fazenda.
              </p>
            ) : (
              <FormNativeSelect
                value={destinoSelectValue}
                onChange={setLoteDestinoId}
                placeholder="Selecione o lote de destino"
                required
                variant="light"
                disabled={destinoDisabled}
                options={destinoOptions}
              />
            )}
            {mesmoLote ? (
              <p className="mt-1.5 text-[12px] text-amber-700">{MSG_TROCA_LOTE_MESMO_LOTE}</p>
            ) : null}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
