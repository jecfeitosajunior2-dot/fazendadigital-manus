import AppLayout from "@/components/AppLayout";
import { ManejoAnimalField, type ManejoAnimalRow } from "@/components/ManejoAnimalField";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FieldBox,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormSelect,
} from "@/components/FormFields";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import {
  FAZENDA_SELECT_PLACEHOLDER,
  ManejoPontualFormShell,
  ManejoSectionCard,
} from "@/components/ManejoPontualFormLayout";
import { SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  MSG_BAIXA_GENERICO,
  MSG_BAIXA_SUCESSO,
  STATUS_ANIMAL_LABEL,
  TIPO_BAIXA_LABEL,
  TIPOS_MOVIMENTACAO_ANIMAL,
  montarConfirmacaoTransferenciaExterna,
  validarBaixaAnimalInput,
  type TipoMovimentacaoAnimal,
} from "@shared/animalBaixa";
import {
  CAUSA_MORTE_LABEL,
  CAUSAS_MORTE,
  montarConfirmacaoMorte,
  montarMotivoMorte,
} from "@shared/causaMorte";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";
import {
  MSG_TRANSFERENCIA_MESMA_FAZENDA,
  MSG_TRANSFERENCIA_SUCESSO,
  montarConfirmacaoTransferenciaInterna,
  validarTransferenciaInternaInput,
} from "@shared/transferenciaInternaAnimal";
import { formatLoteAtualDisplay } from "@shared/transferirAnimaisEntreLotes";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const FD_PRIMARY = "#4ECDC4";

function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

type AnimalSaidaRow = ManejoAnimalRow & {
  status?: "ativo" | "vendido" | "morto" | "transferido" | null;
  pastoNome?: string | null;
};

type TipoDestino = "interna" | "externa" | "";

export function ManejoBaixaAnimalForm() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: lotes = [] } = trpc.lotes.list.useQuery({ somenteAtivos: true });

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [dataEvento, setDataEvento] = useState(todayISODate);
  const [tipo, setTipo] = useState<TipoMovimentacaoAnimal | "">("");
  const [tipoDestino, setTipoDestino] = useState<TipoDestino>("");
  const [animal, setAnimal] = useState<AnimalSaidaRow | null>(null);
  const [destino, setDestino] = useState("");
  const [causaCodigo, setCausaCodigo] = useState("");
  const [causaOutro, setCausaOutro] = useState("");
  const [fazendaDestinoId, setFazendaDestinoId] = useState("");
  const [loteDestinoId, setLoteDestinoId] = useState("");
  const [bloqueioMsg, setBloqueioMsg] = useState<string | null>(null);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const fazendaDestinoNum = fazendaDestinoId ? Number(fazendaDestinoId) : 0;
  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;
  const fazendasDestino = fazendas.filter(f => String(f.id) !== fazendaId);
  const lotesDestino = lotes.filter(l => Number(l.fazendaId) === fazendaDestinoNum);
  const loteDestino = lotesDestino.find(l => String(l.id) === loteDestinoId);

  const { data: animais = [], isLoading: loadingAnimais } = trpc.animais.list.useQuery(
    { fazendaId: fazendaNum || undefined, status: "ativo" },
    { enabled: Boolean(fazendaNum) },
  );
  const pastoDestinoNome =
    (loteDestino as { pastoNome?: string | null } | undefined)?.pastoNome?.trim() ||
    (loteDestino ? "Sem subdivisão" : "—");
  const pastoDestinoDerivadoId =
    loteDestino?.pastoAtualId != null && Number(loteDestino.pastoAtualId) > 0
      ? Number(loteDestino.pastoAtualId)
      : null;

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const persistida = readPersistedRebanhoFazendaId(fazendas.map(f => f.id));
    const persistidaValida = fazendas.some(f => String(f.id) === persistida);
    const resolved =
      fazendas.length === 1
        ? String(fazendas[0]!.id)
        : persistidaValida
          ? persistida
          : "";
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  const baixaMutation = trpc.animais.registrarBaixa.useMutation({
    onSuccess: async () => {
      toast.success(MSG_BAIXA_SUCESSO);
      await Promise.all([
        utils.animais.list.invalidate(),
        utils.animais.getById.invalidate(),
      ]);
      setLocation("/manejo/registros");
    },
    onError: error => setBloqueioMsg(error.message || MSG_BAIXA_GENERICO),
  });

  const internaMutation = trpc.animais.transferirEntreFazendas.useMutation({
    onSuccess: async () => {
      toast.success(MSG_TRANSFERENCIA_SUCESSO);
      await Promise.all([
        utils.animais.list.invalidate(),
        utils.animais.getById.invalidate(),
        utils.animais.historicoPastos.invalidate(),
      ]);
      setLocation("/manejo/registros");
    },
    onError: error => setBloqueioMsg(error.message || MSG_BAIXA_GENERICO),
  });

  const isPending = baixaMutation.isPending || internaMutation.isPending;

  const onChangeFazenda = (next: string) => {
    setFazendaId(next);
    persistRebanhoFazendaId(next);
    setAnimal(null);
    if (fazendaDestinoId === next) {
      setFazendaDestinoId("");
      setLoteDestinoId("");
    }
  };

  const handleAnimalSelect = useCallback((next: AnimalSaidaRow | null) => {
    setAnimal(next);
  }, []);

  const ehTransferenciaInterna = tipo === "transferencia" && tipoDestino === "interna";

  const validacaoSaida = useMemo(
    () =>
      validarBaixaAnimalInput({
        fazendaId: fazendaNum || null,
        animalId: animal?.id ?? null,
        dataBaixa: dataEvento,
        tipo,
        destino: tipo === "transferencia" ? destino : undefined,
      }),
    [animal?.id, dataEvento, destino, fazendaNum, tipo],
  );

  const validacaoInterna = useMemo(
    () =>
      validarTransferenciaInternaInput({
        fazendaOrigemId: fazendaNum || null,
        fazendaDestinoId: fazendaDestinoNum || null,
        animalId: animal?.id ?? null,
        loteDestinoId: loteDestinoId ? Number(loteDestinoId) : null,
        loteDestinoFazendaId: loteDestino?.fazendaId ?? null,
        loteDestinoAtivo: loteDestino?.ativo ?? true,
        pastoDestinoId: pastoDestinoDerivadoId,
        pastoDestinoFazendaId: loteDestino?.fazendaId ?? null,
        dataTransferencia: dataEvento,
      }),
    [
      animal?.id,
      dataEvento,
      fazendaDestinoNum,
      fazendaNum,
      loteDestino?.ativo,
      loteDestino?.fazendaId,
      loteDestinoId,
      pastoDestinoDerivadoId,
    ],
  );

  const handleSalvar = async () => {
    if (!animal || !tipo) {
      setBloqueioMsg("Selecione o tipo de movimentação e um animal.");
      return;
    }
    if (tipo === "transferencia" && !tipoDestino) {
      setBloqueioMsg("Selecione o tipo de destino da transferência.");
      return;
    }
    if (ehTransferenciaInterna) {
      if (fazendaDestinoNum && fazendaDestinoNum === fazendaNum) {
        setBloqueioMsg(MSG_TRANSFERENCIA_MESMA_FAZENDA);
        return;
      }
      if (!validacaoInterna.ok) {
        setBloqueioMsg(validacaoInterna.message);
        return;
      }
      const destNome =
        fazendas.find(f => f.id === validacaoInterna.fazendaDestinoId)?.nome?.trim() ?? "";
      const loteNome = loteDestino?.nome?.trim() ?? "";
      const confirmacao = montarConfirmacaoTransferenciaInterna({
        identificacao: animal.brinco || animal.nome || String(animal.id),
        fazendaDestinoNome: destNome,
        loteDestinoNome: loteNome,
      });
      if (!confirmacao.ok) {
        setBloqueioMsg(confirmacao.message);
        return;
      }
      const confirmado = await confirm({
        title: confirmacao.title,
        description: confirmacao.texto,
        confirmText: confirmacao.confirmText,
        cancelText: "Cancelar",
        variant: "warning",
      });
      if (!confirmado) return;
      internaMutation.mutate({
        fazendaOrigemId: validacaoInterna.fazendaOrigemId,
        fazendaDestinoId: validacaoInterna.fazendaDestinoId,
        animalId: animal.id,
        loteDestinoId: validacaoInterna.loteDestinoId,
        pastoDestinoId: validacaoInterna.pastoDestinoId,
        dataTransferencia: validacaoInterna.dataISO,
      });
      return;
    }

    if (!validacaoSaida.ok) {
      setBloqueioMsg(validacaoSaida.message);
      return;
    }

    let motivoMorte: string | null = null;
    if (validacaoSaida.tipo === "morte") {
      const causa = montarMotivoMorte({
        codigo: causaCodigo,
        descricaoOutro: causaOutro,
      });
      if (!causa.ok) {
        toast.error(causa.message);
        return;
      }
      motivoMorte = causa.motivo;
    }

    const identificacao = animal.brinco || animal.nome || `Animal #${animal.id}`;
    const confirmacaoMorte =
      validacaoSaida.tipo === "morte"
        ? montarConfirmacaoMorte({
            identificacao: animal.brinco || animal.nome || String(animal.id),
            dataISO: validacaoSaida.dataISO,
            motivo: motivoMorte,
          })
        : null;
    const confirmacaoExterna =
      validacaoSaida.tipo === "transferencia"
        ? montarConfirmacaoTransferenciaExterna({
            identificacao: animal.brinco || animal.nome || String(animal.id),
            destino: destino.trim(),
            dataISO: validacaoSaida.dataISO,
          })
        : null;
    if (confirmacaoExterna && !confirmacaoExterna.ok) {
      setBloqueioMsg(confirmacaoExterna.message);
      return;
    }

    const confirmado = await confirm({
      title:
        confirmacaoMorte?.title ??
        (confirmacaoExterna?.ok ? confirmacaoExterna.title : "Confirmar saída do animal"),
      description: confirmacaoMorte ? (
        <div className="space-y-3">
          <p>{confirmacaoMorte.texto}</p>
          {confirmacaoMorte.causa ? (
            <div>
              <p className="text-[11px] font-medium text-gray-500 mb-0.5">Causa</p>
              <p className="text-gray-800">{confirmacaoMorte.causa}</p>
            </div>
          ) : null}
        </div>
      ) : confirmacaoExterna?.ok ? (
        confirmacaoExterna.texto
      ) : (
        `${identificacao} será marcado como ${
          STATUS_ANIMAL_LABEL[validacaoSaida.status]
        } em ${dataEvento.split("-").reverse().join("/")}. Esta ação não possui reativação simples.`
      ),
      confirmText:
        confirmacaoMorte?.confirmText ??
        (confirmacaoExterna?.ok ? confirmacaoExterna.confirmText : "Confirmar saída"),
      cancelText: "Cancelar",
      variant: "warning",
    });
    if (!confirmado) return;

    baixaMutation.mutate({
      fazendaId: fazendaNum,
      animalId: animal.id,
      dataBaixa: validacaoSaida.dataISO,
      tipo: validacaoSaida.tipo,
      destino: validacaoSaida.tipo === "transferencia" ? destino.trim() || null : null,
      motivo: validacaoSaida.tipo === "morte" ? motivoMorte : null,
    });
  };

  const loteAtualDoAnimal = useMemo(() => {
    if (!animal?.loteId) return null;
    return lotes.find(l => l.id === animal.loteId) ?? null;
  }, [animal?.loteId, lotes]);

  const loteAtualId =
    animal?.loteId != null && animal.loteId > 0 ? animal.loteId : null;

  const loteAtualDisplay = useMemo(() => {
    if (!animal) return { titulo: "—" };
    return formatLoteAtualDisplay({
      temLote: loteAtualId != null,
      loteNome: loteAtualDoAnimal?.nome ?? animal.loteNome,
      pastoNome: loteAtualDoAnimal?.pastoNome ?? animal.pastoNome,
    });
  }, [animal, loteAtualDoAnimal, loteAtualId]);

  const statusAtual =
    animal?.status && animal.status in STATUS_ANIMAL_LABEL
      ? STATUS_ANIMAL_LABEL[animal.status]
      : "—";

  return (
    <AppLayout>
      <ManejoPontualFormShell
        title="Movimentação do Animal"
        onCancel={() => setLocation("/manejo/registros")}
        onSave={() => void handleSalvar()}
        savePending={isPending}
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
                value={dataEvento}
                onChange={setDataEvento}
                max={todayISODate()}
                minHeight={34}
              />
            </div>
          </div>

          <FormLabel required>Tipo de movimentação</FormLabel>
          <FormSelect
            variant="light"
            value={tipo}
            onChange={v => {
              setTipo(v as TipoMovimentacaoAnimal | "");
              setTipoDestino("");
              setDestino("");
              setCausaCodigo("");
              setCausaOutro("");
              setFazendaDestinoId("");
              setLoteDestinoId("");
            }}
            placeholder="Selecione o tipo"
            required
          >
            {TIPOS_MOVIMENTACAO_ANIMAL.map(value => (
              <SelectItem key={value} value={value} className="text-[12px]">
                {TIPO_BAIXA_LABEL[value]}
              </SelectItem>
            ))}
          </FormSelect>
        </ManejoSectionCard>

        <ManejoSectionCard title="Animal">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ManejoAnimalField
              embedded
              selected={animal}
              onSelect={handleAnimalSelect}
              animals={animais as AnimalSaidaRow[]}
              loading={loadingAnimais}
              disabled={!fazendaNum}
              hintMessage={
                fazendaNum
                  ? "Somente animais ativos desta Fazenda estão disponíveis."
                  : "Selecione uma Fazenda primeiro."
              }
            />

            <div className="space-y-3">
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

              <div>
                <FormLabel>Status atual</FormLabel>
                <FormInput variant="light" value={statusAtual} onChange={() => {}} readOnly />
              </div>
            </div>
          </div>
        </ManejoSectionCard>

        {tipo === "transferencia" ? (
          <ManejoSectionCard title="Transferência">
            <FormLabel required>Tipo de destino</FormLabel>
            <FormSelect
              variant="light"
              value={tipoDestino}
              onChange={v => {
                setTipoDestino(v as TipoDestino);
                setDestino("");
                setFazendaDestinoId("");
                setLoteDestinoId("");
              }}
              placeholder="Selecione o destino"
              required
            >
              <SelectItem value="interna" className="text-[12px]">
                Fazenda cadastrada
              </SelectItem>
              <SelectItem value="externa" className="text-[12px]">
                Destino externo
              </SelectItem>
            </FormSelect>

            {tipoDestino === "interna" ? (
              <>
                <FormLabel required>Fazenda de destino</FormLabel>
                <FormSelect
                  variant="light"
                  value={fazendaDestinoId}
                  onChange={v => {
                    setFazendaDestinoId(v);
                    setLoteDestinoId("");
                  }}
                  placeholder="Selecione a Fazenda de destino"
                  required
                >
                  {fazendasDestino.map(f => (
                    <SelectItem key={f.id} value={String(f.id)} className="text-[12px]">
                      {f.nome}
                    </SelectItem>
                  ))}
                </FormSelect>

                <FormLabel required>Lote de destino</FormLabel>
                <FormSelect
                  variant="light"
                  side="top"
                  value={loteDestinoId}
                  onChange={setLoteDestinoId}
                  placeholder={
                    fazendaDestinoNum
                      ? "Selecione o Lote"
                      : "Selecione a Fazenda de destino primeiro"
                  }
                  disabled={!fazendaDestinoNum}
                  required
                >
                  {lotesDestino.map(l => (
                    <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">
                      {l.nome}
                    </SelectItem>
                  ))}
                </FormSelect>

                <FormLabel>Subdivisão / Pasto de destino</FormLabel>
                <FormInput variant="light" value={pastoDestinoNome} onChange={() => {}} readOnly />
              </>
            ) : null}

            {tipoDestino === "externa" ? (
              <div>
                <FormLabel required>Destino</FormLabel>
                <FormInput
                  variant="light"
                  value={destino}
                  onChange={setDestino}
                  placeholder="Informe o destino"
                />
              </div>
            ) : null}
          </ManejoSectionCard>
        ) : null}

        {tipo === "morte" ? (
          <ManejoSectionCard title="Morte">
            <FormLabel>Motivo / Causa</FormLabel>
            <FormSelect
              variant="light"
              side="top"
              value={causaCodigo}
              placeholder="Selecione a causa"
              onChange={next => {
                setCausaCodigo(next);
                if (next !== "outro") setCausaOutro("");
              }}
            >
              {CAUSAS_MORTE.map(value => (
                <SelectItem key={value} value={value} className="text-[12px]">
                  {CAUSA_MORTE_LABEL[value]}
                </SelectItem>
              ))}
            </FormSelect>
            {causaCodigo === "outro" ? (
              <div>
                <FormLabel required>Descrição da causa</FormLabel>
                <FormInput
                  variant="light"
                  value={causaOutro}
                  onChange={setCausaOutro}
                  placeholder="Digite a causa..."
                />
              </div>
            ) : null}
          </ManejoSectionCard>
        ) : null}
      </ManejoPontualFormShell>

      <Dialog open={Boolean(bloqueioMsg)}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          onEscapeKeyDown={e => e.preventDefault()}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <DialogTitle>Não foi possível concluir</DialogTitle>
            </div>
            <DialogDescription className="text-gray-600 leading-relaxed whitespace-pre-line">
              {bloqueioMsg}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setBloqueioMsg(null)}
              className="w-full text-white hover:opacity-95"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

export default ManejoBaixaAnimalForm;
