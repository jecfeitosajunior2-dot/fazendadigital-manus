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
import { FormDatePicker, FormDownSelect, FormLabel } from "@/components/FormFields";
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
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const FD_PRIMARY = "#4ECDC4";
const fieldCls =
  "w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[40px] bg-white";
const labelCls = "block text-[11px] text-gray-600 font-medium mb-1";

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

  const statusAtual =
    animal?.status && animal.status in STATUS_ANIMAL_LABEL
      ? STATUS_ANIMAL_LABEL[animal.status]
      : "—";

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
            Movimentação do Animal
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocation("/manejo/registros")}
            disabled={isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSalvar()}
            disabled={isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[40px] disabled:opacity-60"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
          {unicaFazenda && fazendaId && nomeFazenda ? (
            <div className="min-w-0">
              <label className={labelCls}>Fazenda</label>
              <div className={`${fieldCls} bg-gray-50 font-medium flex items-center`}>
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
              value={dataEvento}
              onChange={setDataEvento}
              max={todayISODate()}
              minHeight={42}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Tipo de movimentação<span className="text-red-500">*</span>
          </label>
          <select
            value={tipo}
            onChange={e => {
              setTipo(e.target.value as TipoMovimentacaoAnimal | "");
              setTipoDestino("");
              setDestino("");
              setCausaCodigo("");
              setCausaOutro("");
              setFazendaDestinoId("");
              setLoteDestinoId("");
            }}
            className={fieldCls}
          >
            <option value="">Selecione o tipo</option>
            {TIPOS_MOVIMENTACAO_ANIMAL.map(value => (
              <option key={value} value={value}>
                {TIPO_BAIXA_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <ManejoAnimalField
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-gray-100 pt-5">
          <div>
            <label className={labelCls}>Status atual</label>
            <div className={`${fieldCls} bg-gray-50 font-medium flex items-center`}>
              {statusAtual}
            </div>
          </div>
          <div>
            <label className={labelCls}>Lote atual</label>
            <div className={`${fieldCls} bg-gray-50 font-medium flex items-center`}>
              {animal?.loteNome || (animal ? "Sem lote" : "—")}
            </div>
          </div>
          <div>
            <label className={labelCls}>Subdivisão / Pasto</label>
            <div className={`${fieldCls} bg-gray-50 font-medium flex items-center`}>
              {animal?.pastoNome || (animal ? "—" : "—")}
            </div>
          </div>
        </div>

        {tipo === "transferencia" ? (
          <div className="space-y-4 border-t border-gray-100 pt-5">
            <div>
              <label className={labelCls}>
                Tipo de destino<span className="text-red-500">*</span>
              </label>
              <select
                value={tipoDestino}
                onChange={e => {
                  setTipoDestino(e.target.value as TipoDestino);
                  setDestino("");
                  setFazendaDestinoId("");
                  setLoteDestinoId("");
                }}
                className={fieldCls}
              >
                <option value="">Selecione o destino</option>
                <option value="interna">Fazenda cadastrada</option>
                <option value="externa">Destino externo</option>
              </select>
            </div>

            {tipoDestino === "interna" ? (
              <>
                <div>
                  <label className={labelCls}>
                    Fazenda de destino<span className="text-red-500">*</span>
                  </label>
                  <select
                    value={fazendaDestinoId}
                    onChange={e => {
                      setFazendaDestinoId(e.target.value);
                      setLoteDestinoId("");
                    }}
                    className={fieldCls}
                  >
                    <option value="">Selecione a Fazenda de destino</option>
                    {fazendasDestino.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>
                    Lote de destino<span className="text-red-500">*</span>
                  </label>
                  <select
                    value={loteDestinoId}
                    onChange={e => setLoteDestinoId(e.target.value)}
                    className={fieldCls}
                    disabled={!fazendaDestinoNum}
                  >
                    <option value="">
                      {fazendaDestinoNum ? "Selecione o Lote" : "Selecione a Fazenda de destino primeiro"}
                    </option>
                    {lotesDestino.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Subdivisão / Pasto de destino</label>
                  <div className={`${fieldCls} bg-gray-50 font-medium flex items-center`}>
                    {pastoDestinoNome}
                  </div>
                </div>
              </>
            ) : null}

            {tipoDestino === "externa" ? (
              <div>
                <label className={labelCls}>
                  Destino<span className="text-red-500">*</span>
                </label>
                <input
                  value={destino}
                  onChange={e => setDestino(e.target.value)}
                  maxLength={255}
                  className={fieldCls}
                  placeholder="Informe o destino"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {tipo === "morte" ? (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Motivo / Causa</label>
              <FormDownSelect
                value={causaCodigo}
                placeholder="Selecione a causa"
                options={CAUSAS_MORTE.map(value => ({
                  value,
                  label: CAUSA_MORTE_LABEL[value],
                }))}
                onChange={next => {
                  setCausaCodigo(next);
                  if (next !== "outro") setCausaOutro("");
                }}
              />
            </div>
            {causaCodigo === "outro" ? (
              <div>
                <label className={labelCls}>
                  Descrição da causa<span className="text-red-500">*</span>
                </label>
                <input
                  value={causaOutro}
                  onChange={e => setCausaOutro(e.target.value)}
                  maxLength={249}
                  className={fieldCls}
                  placeholder="Digite a causa..."
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

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
