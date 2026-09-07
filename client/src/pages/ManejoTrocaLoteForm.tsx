import AppLayout from "@/components/AppLayout";
import { BloqueioNegocioDialog } from "@/components/BloqueioNegocioDialog";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { ManejoAnimalField } from "@/components/ManejoAnimalField";
import {
  FAZENDA_SELECT_PLACEHOLDER,
  ManejoPontualFormShell,
  ManejoSectionCard,
} from "@/components/ManejoPontualFormLayout";
import {
  FieldBox,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormSelect,
} from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { resolveAnimalIdFromSelecao } from "@shared/animalAutocomplete";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
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
import { useLocation, useSearch } from "wouter";


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
  const search = useSearch();
  const prefillParams = useMemo(() => {
    const params = new URLSearchParams(search);
    const fazendaRaw = params.get("fazendaId")?.trim() ?? "";
    const animalRaw = params.get("animalId")?.trim() ?? "";
    const fazendaId = /^\d+$/.test(fazendaRaw) && Number(fazendaRaw) > 0 ? fazendaRaw : null;
    const animalId = /^\d+$/.test(animalRaw) && Number(animalRaw) > 0 ? Number(animalRaw) : null;
    return { fazendaId, animalId };
  }, [search]);

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
  const [bloqueioMsg, setBloqueioMsg] = useState<string | null>(null);
  const [animalPrefillDone, setAnimalPrefillDone] = useState(false);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;

  const { data: animais = [], isLoading: loadingAnimais } = trpc.animais.list.useQuery(
    {
      fazendaId: fazendaNum || undefined,
      status: "ativo",
      dataManejo: dataMovimentacao,
    },
    { enabled: Boolean(fazendaNum) },
  );

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const fromUrl = prefillParams.fazendaId;
    const urlOk = fromUrl != null && fazendas.some(f => String(f.id) === fromUrl);
    const resolved = urlOk
      ? fromUrl
      : fazendas.length === 1
        ? String(fazendas[0]!.id)
        : "";
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas, prefillParams.fazendaId]);

  useEffect(() => {
    if (animalPrefillDone || prefillParams.animalId == null || !fazendaNum) return;
    if (loadingAnimais) return;
    const found = (animais as AnimalTrocaLoteRow[]).find(a => a.id === prefillParams.animalId);
    if (found) {
      setAnimalSel(found);
      setAnimalPrefillDone(true);
      return;
    }
    setAnimalPrefillDone(true);
  }, [
    animalPrefillDone,
    prefillParams.animalId,
    fazendaNum,
    loadingAnimais,
    animais,
  ]);

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
      const message = err.message || MSG_TROCA_LOTE_GENERICO;
      if (isMensagemBloqueioBaixa(message)) {
        setBloqueioMsg(message);
        return;
      }
      toast.error(message);
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

  const destinoDisabled = !fazendaNum || mutation.isPending;
  const salvarDisabled = !podeSalvar || mutation.isPending;

  return (
    <AppLayout>
      <ManejoPontualFormShell
        title="Troca de Lote"
        onCancel={() => setLocation("/manejo/registros")}
        onSave={handleSalvar}
        saveDisabled={salvarDisabled}
        savePending={mutation.isPending}
      >
        <ManejoSectionCard title="Contexto">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
            {unicaFazenda && fazendaId && nomeFazenda ? (
              <div className="min-w-0">
                <FormLabel>Fazenda</FormLabel>
                <FormInput variant="light" value={nomeFazenda} onChange={() => {}} readOnly />
              </div>
            ) : (
              <div className="min-w-0">
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect
                  value={fazendaId}
                  onChange={onChangeFazenda}
                  fazendas={fazendas}
                  emptyLabel={FAZENDA_SELECT_PLACEHOLDER}
                  disabled={loadingFazendas || !fazendaInitDone}
                  required
                />
              </div>
            )}

            <div className="min-w-0">
              <FormLabel required>Data</FormLabel>
              <FormDatePicker
                value={dataMovimentacao}
                onChange={handleDataChange}
                max={todayISODate()}
              />
            </div>
          </div>
        </ManejoSectionCard>

        <ManejoSectionCard title="Animal">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ManejoAnimalField
              embedded
              selected={animalSel}
              onSelect={handleAnimalSelect}
              animals={animais as AnimalTrocaLoteRow[]}
              loading={Boolean(fazendaNum) && loadingAnimais}
              disabled={!fazendaNum}
              hintMessage={
                fazendaNum
                  ? "Clique para ver animais ou digite para filtrar."
                  : "Selecione uma Fazenda primeiro."
              }
            />

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
        </ManejoSectionCard>

        <ManejoSectionCard title="Troca de Lote">
          <FormLabel required>Lote de destino</FormLabel>
          {lotesLoading ? (
            <p className="text-[12px] text-gray-400 py-2">Carregando lotes...</p>
          ) : fazendaNum && destinoOptions.length === 0 ? (
            <p className="text-[12px] text-amber-700 py-2">
              Nenhum lote de destino disponível nesta fazenda.
            </p>
          ) : (
            <FormSelect
              variant="light"
              side="top"
              value={destinoSelectValue}
              onChange={setLoteDestinoId}
              placeholder={
                fazendaNum
                  ? "Selecione o lote de destino"
                  : "Selecione uma Fazenda primeiro"
              }
              disabled={destinoDisabled || destinoOptions.length === 0}
              required
            >
              {destinoOptions.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-[12px]">
                  {o.label}
                </SelectItem>
              ))}
            </FormSelect>
          )}
          {mesmoLote ? (
            <p className="mt-1.5 text-[12px] text-amber-700">{MSG_TROCA_LOTE_MESMO_LOTE}</p>
          ) : null}
        </ManejoSectionCard>
      </ManejoPontualFormShell>
      <BloqueioNegocioDialog
        message={bloqueioMsg}
        onClose={() => setBloqueioMsg(null)}
      />
    </AppLayout>
  );
}
