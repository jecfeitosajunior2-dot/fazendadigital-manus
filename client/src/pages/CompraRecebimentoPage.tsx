import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { At05RfidReaderControl } from "@/components/At05RfidReaderControl";
import { RecebimentoS3ReaderControl } from "@/components/venda/RecebimentoS3ReaderControl";
import DesfazerRecebimentoDialog, {
  type AlvoDesfazerRecebimento,
} from "@/components/compra/DesfazerRecebimentoDialog";
import { useAt05Reader } from "@/hooks/useAt05Reader";
import { readCurrentTruTestBleWeightKg, useTruTestBleReader } from "@/hooks/useTruTestBleReader";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormSelect,
} from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { filtrarLotesPorFazenda } from "@/lib/loteFazendaFilter";
import { compraVendaCompraDetalhePath, parseRetornoCompraVendaVisaoGeral } from "@/lib/compraVendaCompradores";
import { formatarMetricaQuantidade } from "@/lib/compraVendaResumo";
import {
  deveAplicarRfidRecebimentoCompra,
  deveGuardarRfidPendenteRecebimento,
  formularioRecebimentoAptoParaRfid,
  proximoCicloCapturaRecebimento,
} from "@/lib/compraRecebimentoAt05";
import {
  HINT_RECEBIMENTO_IDENTIFICACAO,
  MSG_RECEBIMENTO_IDENTIFICACAO,
  temIdentificacaoRecebimento,
} from "@shared/compraRecebimento";
import { normalizeRfidKey } from "@shared/rfidUnicidade";
import {
  aplicarEdicaoManualPesoRecebimento,
  aplicarLeituraPesoS3Recebimento,
  consumirPesoS3AposConfirmar,
  estadoInicialPesoS3Recebimento,
  INTERVALO_PEDIDO_VISOR_S3_RECEBIMENTO_MS,
} from "@/lib/compraRecebimentoS3";
import {
  TOAST_DESFAZER_RECEBIMENTO_SUCESSO,
  deveAceitarCliqueDesfazerRecebimento,
  deveLimparUltimoRecebidoAposDesfazer,
  mensagemErroDesfazerRecebimento,
  queriesParaInvalidarAposDesfazerRecebimento,
  type PayloadDesfazerRecebimento,
} from "@/lib/compraRecebimentoDesfazer";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { RACAS } from "@shared/animal-types";
import { hojeISODateLocal } from "@shared/transferirAnimaisEntreLotes";
import {
  TEXTO_VAZIO_RECEBIMENTO_LISTA,
  formatarPesoRecebimentoLista,
  formatarRecebidoEmLista,
  podeMostrarAcaoDesfazerRecebimento,
  recebimentosVisiveisNaSecao,
  rotuloUltimoAnimalRecebido,
  textoOuTracoRecebimento,
} from "@shared/compraRecebimentosListagem";

const VAZIO = "__none__";

type UltimoRecebido = {
  brincoVisual: string;
  rfid: string | null;
  categoria: string;
  sexoLabel: string;
  pesoKg: number | null;
  loteNome: string | null;
  pastoNome: string | null;
  recebidoEm: string;
};

function qtd(value: number): string {
  return formatarMetricaQuantidade({ kind: "known", value });
}

function rotuloIdentificados(sexo: string, n: number, total: number): string {
  const palavra = String(sexo).toLowerCase() === "femea" ? "identificadas" : "identificados";
  return `${n} de ${total} ${palavra}`;
}

function formatHoraRecebido(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatPesoRecebido(pesoKg: number | null): string | null {
  if (pesoKg == null || !Number.isFinite(pesoKg) || pesoKg <= 0) return null;
  return Number.isInteger(pesoKg) ? `${pesoKg} kg` : `${pesoKg} kg`;
}

function focarIdentificacao(preferirRfid: boolean) {
  window.requestAnimationFrame(() => {
    const id = preferirRfid ? "recebimento-rfid" : "recebimento-brinco";
    document.getElementById(id)?.focus();
  });
}

function valorSelect(raw: string): string {
  return raw === VAZIO ? "" : raw;
}

function MenuAcoesRecebimentoConfirmado({ onDesfazer }: { onDesfazer: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="grid place-items-center h-7 w-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          aria-label="Mais ações"
          title="Mais ações"
        >
          <span className="material-icons text-[16px]" aria-hidden>
            more_vert
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px] z-[100]">
        <DropdownMenuItem className="text-[12px] cursor-pointer" onSelect={onDesfazer}>
          Desfazer recebimento
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SecaoRecebimento({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      {children}
    </div>
  );
}


export default function CompraRecebimentoPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const retornoVisaoGeral = useMemo(() => {
    const qs = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    return parseRetornoCompraVendaVisaoGeral(qs.get("retorno"));
  }, [searchString]);
  const utils = trpc.useUtils();
  const id = Number(params.id);
  const { data, isLoading } = trpc.compras.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) && id > 0 },
  );
  const { data: recebimentos = [] } = trpc.compras.listarRecebimentos.useQuery(
    { compraId: id },
    { enabled: Number.isFinite(id) && id > 0 },
  );
  const recebimentosVisiveis = useMemo(
    () => recebimentosVisiveisNaSecao(recebimentos),
    [recebimentos],
  );

  const [dataRecebimento, setDataRecebimento] = useState(hojeISODateLocal);
  const [grupoId, setGrupoId] = useState<number | null>(null);
  const [brincoVisual, setBrincoVisual] = useState("");
  const [rfid, setRfid] = useState("");
  const [pesoEntrada, setPesoEntrada] = useState("");
  const [loteId, setLoteId] = useState("");
  const [pastoId, setPastoId] = useState("");
  const [raca, setRaca] = useState("");
  const [ultimo, setUltimo] = useState<UltimoRecebido | null>(null);
  const [desfazerAlvo, setDesfazerAlvo] = useState<AlvoDesfazerRecebimento | null>(null);
  const [desfazerErro, setDesfazerErro] = useState<string | null>(null);
  const cicloCapturaRef = useRef(1);
  const aceitandoLeituraRef = useRef(false);
  const confirmandoRef = useRef(false);
  const rfidPendenteRef = useRef<string | null>(null);
  const desfazendoRef = useRef(false);
  const pesoS3Ref = useRef(estadoInicialPesoS3Recebimento());

  const fazendaId = data?.fazendaId ?? null;
  const { data: todosLotes = [] } = trpc.lotes.list.useQuery(
    { somenteAtivos: true },
    { enabled: fazendaId != null && fazendaId > 0 },
  );
  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: Number(fazendaId) },
    { enabled: fazendaId != null && fazendaId > 0 },
  );

  const lotes = useMemo(
    () =>
      filtrarLotesPorFazenda(todosLotes, fazendaId)
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" })),
    [todosLotes, fazendaId],
  );

  const pastosOrdenados = useMemo(
    () =>
      [...pastos].sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" }),
      ),
    [pastos],
  );

  const receberMut = trpc.compras.receberAnimal.useMutation();
  const desfazerMut = trpc.compras.desfazerRecebimento.useMutation();
  const cancelada = data?.status === "cancelado";
  const compraConcluida = data?.status === "concluido";
  const grupos = data?.identificacao.grupos ?? [];
  const grupoSelecionado = grupos.find(g => g.id === grupoId) ?? null;
  const grupoAberto = Boolean(grupoSelecionado && grupoSelecionado.pendentes > 0);
  const mostraEquipamentos = compraConcluida && !cancelada && (data?.identificacao.pendentes ?? 0) > 0;

  useEffect(() => {
    if (grupoId != null) return;
    const aberto = grupos.find(g => g.pendentes > 0);
    if (aberto) setGrupoId(aberto.id);
  }, [grupoId, grupos]);
  const podeReceber =
    Boolean(data) &&
    compraConcluida &&
    !cancelada &&
    (data?.identificacao.pendentes ?? 0) > 0 &&
    grupoAberto &&
    temIdentificacaoRecebimento(brincoVisual, rfid) &&
    !receberMut.isPending;

  aceitandoLeituraRef.current = formularioRecebimentoAptoParaRfid({
    grupoSelecionado: grupoSelecionado != null,
    pendentes: grupoSelecionado?.pendentes ?? 0,
    confirmando: confirmandoRef.current,
  });

  const aplicarRfidLido = useCallback((rfidLido: string) => {
    const cicloDaLeitura = cicloCapturaRef.current;
    const decisao = deveAplicarRfidRecebimentoCompra({
      rfid: rfidLido,
      aceitandoLeituras: aceitandoLeituraRef.current,
      cicloAtual: cicloCapturaRef.current,
      cicloDaLeitura,
    });
    if (!decisao.aplicar) {
      if (
        deveGuardarRfidPendenteRecebimento({
          motivo: decisao.motivo,
          confirmando: confirmandoRef.current,
        })
      ) {
        rfidPendenteRef.current = normalizeRfidKey(rfidLido) || null;
      }
      return;
    }
    rfidPendenteRef.current = null;
    setRfid(decisao.rfid);
  }, []);

  const aplicarRfidLidoRef = useRef(aplicarRfidLido);
  aplicarRfidLidoRef.current = aplicarRfidLido;

  const at05 = useAt05Reader({
    onRead: rfidLido => aplicarRfidLidoRef.current(rfidLido),
  });

  useEffect(() => {
    if (!grupoAberto) return;
    const pendente = rfidPendenteRef.current;
    if (!pendente) return;
    rfidPendenteRef.current = null;
    aplicarRfidLido(pendente);
  }, [grupoAberto, aplicarRfidLido]);

  const aplicarPesoS3 = useCallback((kg: number) => {
    const decisao = aplicarLeituraPesoS3Recebimento({
      kg,
      aceitandoLeituras: aceitandoLeituraRef.current,
      estado: pesoS3Ref.current,
    });
    pesoS3Ref.current = decisao.estado;
    if (decisao.aplicar) setPesoEntrada(decisao.textoCampo);
  }, []);

  const aplicarPesoS3Ref = useRef(aplicarPesoS3);
  aplicarPesoS3Ref.current = aplicarPesoS3;

  const pedirPesoVisorBalanca = useCallback(() => {
    if (confirmandoRef.current) return;
    void readCurrentTruTestBleWeightKg().then(lido => {
      if (lido == null) return;
      aplicarPesoS3Ref.current(lido);
    });
  }, []);

  const s3 = useTruTestBleReader({
    onWeight: kg => aplicarPesoS3Ref.current(kg),
  });

  useEffect(() => {
    if (!mostraEquipamentos || !grupoAberto || !s3.sessionActive) return;
    if (pesoEntrada.trim()) return;
    pedirPesoVisorBalanca();
    const timer = window.setInterval(
      () => pedirPesoVisorBalanca(),
      INTERVALO_PEDIDO_VISOR_S3_RECEBIMENTO_MS,
    );
    return () => window.clearInterval(timer);
  }, [
    mostraEquipamentos,
    grupoAberto,
    s3.sessionActive,
    pesoEntrada,
    pedirPesoVisorBalanca,
  ]);

  const handleConfirmar = async () => {
    if (!data || grupoSelecionado == null) return;
    if (!temIdentificacaoRecebimento(brincoVisual, rfid)) {
      toast.error(MSG_RECEBIMENTO_IDENTIFICACAO);
      return;
    }
    const identificouPorRfid = Boolean(normalizeRfidKey(rfid));
    confirmandoRef.current = true;
    aceitandoLeituraRef.current = false;
    rfidPendenteRef.current = null;
    try {
      const out = await receberMut.mutateAsync({
        compraId: data.id,
        compraGrupoId: grupoSelecionado.id,
        brincoVisual,
        rfid: rfid.trim() || null,
        pesoEntrada: pesoEntrada.trim() || null,
        loteId: loteId ? Number(loteId) : null,
        pastoId: pastoId ? Number(pastoId) : null,
        raca: raca.trim() || null,
        dataRecebimento,
      });
      await Promise.all([
        utils.compras.get.invalidate({ id: data.id }),
        utils.compras.listarRecebimentos.invalidate({ compraId: data.id }),
      ]);
      setUltimo({
        brincoVisual: brincoVisual.trim(),
        rfid: normalizeRfidKey(rfid) || null,
        categoria: out.categoria,
        sexoLabel: out.sexoLabel,
        pesoKg: out.pesoKg,
        loteNome: out.loteNome,
        pastoNome: out.pastoNome,
        recebidoEm: out.recebidoEm,
      });
      setBrincoVisual("");
      setRfid("");
      setRaca("");
      pesoS3Ref.current = consumirPesoS3AposConfirmar(pesoS3Ref.current);
      setPesoEntrada("");
      cicloCapturaRef.current = proximoCicloCapturaRecebimento(cicloCapturaRef.current);
      toast.success("Entrada confirmada.");
      focarIdentificacao(identificouPorRfid);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível confirmar a entrada.");
    } finally {
      confirmandoRef.current = false;
      aceitandoLeituraRef.current = grupoAberto;
    }
  };

  const handleDesfazerRecebimento = async (payload: PayloadDesfazerRecebimento) => {
    if (
      !deveAceitarCliqueDesfazerRecebimento({
        formularioValido: true,
        pending: desfazendoRef.current || desfazerMut.isPending,
      })
    ) {
      return;
    }
    desfazendoRef.current = true;
    setDesfazerErro(null);
    try {
      await desfazerMut.mutateAsync({
        recebimentoId: payload.recebimentoId,
        motivo: payload.motivo,
        observacao: payload.observacao,
      });
      const compraId = data?.id ?? id;
      const queries = queriesParaInvalidarAposDesfazerRecebimento(compraId);
      await Promise.all([
        utils.compras.get.invalidate(queries.get),
        utils.compras.listarRecebimentos.invalidate(queries.listarRecebimentos),
      ]);
      if (
        deveLimparUltimoRecebidoAposDesfazer({
          ultimoBrinco: ultimo?.brincoVisual || ultimo?.rfid,
          alvoBrinco: desfazerAlvo?.brinco,
        })
      ) {
        setUltimo(null);
      }
      setDesfazerAlvo(null);
      setDesfazerErro(null);
      toast.success(TOAST_DESFAZER_RECEBIMENTO_SUCESSO);
    } catch (error) {
      setDesfazerErro(mensagemErroDesfazerRecebimento(error));
    } finally {
      desfazendoRef.current = false;
    }
  };

  const fecharDesfazer = () => {
    if (desfazerMut.isPending || desfazendoRef.current) return;
    setDesfazerAlvo(null);
    setDesfazerErro(null);
  };

  const voltar = () => {
    if (retornoVisaoGeral) {
      setLocation(retornoVisaoGeral);
      return;
    }
    setLocation(Number.isFinite(id) ? compraVendaCompraDetalhePath(id) : "/compra-venda/compras");
  };

  return (
    <AppLayout>
      <button
        type="button"
        onClick={voltar}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>

      {isLoading || !data ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-[12px] text-gray-400">{isLoading ? "Carregando..." : "Compra não encontrada"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <h1 className="text-[15px] font-medium text-gray-800">Recebimento da Compra {data.id}</h1>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
              <div>
                <p className="text-[10px] uppercase text-gray-500">Fornecedor</p>
                <p className="font-medium text-gray-800">{data.fornecedor}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-500">Fazenda</p>
                <p className="font-medium text-gray-800">{data.fazendaNome || "—"}</p>
              </div>
            </div>
            <div className="mt-4 max-w-xs">
              <FormLabel required>Data do recebimento</FormLabel>
              <FormDatePicker
                variant="light"
                value={dataRecebimento}
                onChange={setDataRecebimento}
                max={hojeISODateLocal()}
              />
            </div>
          </div>

          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[10px] uppercase text-gray-500">Comprados</p>
                <p className="text-[22px] font-bold text-gray-800 tabular-nums">{qtd(data.identificacao.comprados)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[10px] uppercase text-gray-500">Identificados</p>
                <p className="text-[22px] font-bold text-gray-800 tabular-nums">{qtd(data.identificacao.identificados)}</p>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-3",
                  !cancelada && data.identificacao.pendentes > 0
                    ? "bg-amber-50 border-amber-100"
                    : "bg-gray-50 border-gray-100",
                )}
              >
                <p className="text-[10px] uppercase text-gray-500">Pendentes</p>
                <p
                  className={cn(
                    "text-[22px] font-bold tabular-nums",
                    !cancelada && data.identificacao.pendentes > 0 ? "text-amber-800" : "text-gray-800",
                  )}
                >
                  {qtd(data.identificacao.pendentes)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[12px] font-medium text-gray-800">{data.identificacao.situacaoLabel}</p>
          </div>

          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <h2 className="text-[13px] font-semibold text-gray-800 mb-3">Grupos da compra</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {grupos.map(grupo => {
                const concluido = grupo.pendentes <= 0;
                const selecionado = grupo.id === grupoId;
                return (
                  <button
                    key={grupo.id}
                    type="button"
                    onClick={() => setGrupoId(grupo.id)}
                    className={cn(
                      "text-left rounded-lg border p-3 transition-colors",
                      selecionado ? "border-[#4ECDC4] bg-[#4ECDC414]" : "border-gray-100 bg-gray-50 hover:border-gray-200",
                      concluido && !selecionado && "opacity-80",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-gray-800">
                        {grupo.categoria} • {grupo.sexoLabel}
                      </p>
                      {concluido ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                          Concluído
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[12px] text-gray-600">
                      {rotuloIdentificados(grupo.sexo, grupo.identificados, grupo.comprados)}
                    </p>
                    <p className="text-[12px] text-gray-500">{grupo.pendentes} pendentes</p>
                  </button>
                );
              })}
            </div>
          </div>

          {mostraEquipamentos ? (
            <div
              id="recebimento-equipamentos"
              className="bg-white rounded shadow-sm border border-gray-100 px-3 py-2 space-y-1.5"
            >
              <At05RfidReaderControl
                session={at05}
                currentValue={rfid}
                mode="identificar"
                continuous
                variant="strip"
                listeningHint="AT05 escutando · passe a tag"
                onRfidRead={aplicarRfidLido}
              />
              <RecebimentoS3ReaderControl session={s3} />
            </div>
          ) : null}

          {!compraConcluida || cancelada ? (
            <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
              <p className="text-[12px] text-gray-600">
                {cancelada
                  ? "Esta compra está cancelada e não aceita recebimento."
                  : "Só é possível receber animais de uma compra concluída."}
              </p>
            </div>
          ) : data.identificacao.pendentes <= 0 ? (
            <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
              <p className="text-[13px] font-medium text-gray-800">Identificação concluída</p>
              <p className="mt-1 text-[12px] text-gray-500">
                Todos os animais comprados já foram identificados. O status comercial da compra permanece concluído.
              </p>
            </div>
          ) : grupoSelecionado == null ? null : !grupoAberto ? (
            <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
              <p className="text-[13px] font-medium text-gray-800">
                {grupoSelecionado.categoria} • {grupoSelecionado.sexoLabel} — Concluído
              </p>
              <p className="mt-1 text-[12px] text-gray-500">
                Este grupo já atingiu a quantidade comprada. Selecione outro grupo pendente.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded shadow-sm border border-gray-100 p-4 space-y-4">
              <div>
                <h2 className="text-[13px] font-semibold text-gray-800">Recebimento do animal</h2>
                <p className="mt-1 text-[12px] text-gray-500">
                  {grupoSelecionado.categoria} • {grupoSelecionado.sexoLabel}
                </p>
              </div>

              <SecaoRecebimento titulo="Identificação">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FormLabel>Brinco visual</FormLabel>
                    <FormInput
                      id="recebimento-brinco"
                      variant="light"
                      value={brincoVisual}
                      onChange={setBrincoVisual}
                      placeholder="Opcional"
                    />
                  </div>
                  <div>
                    <FormLabel>RFID</FormLabel>
                    <FormInput
                      id="recebimento-rfid"
                      variant="light"
                      value={rfid}
                      onChange={setRfid}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-gray-500">{HINT_RECEBIMENTO_IDENTIFICACAO}</p>
              </SecaoRecebimento>

              <div className="border-t border-gray-100 pt-4">
                <SecaoRecebimento titulo="Entrada">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FormLabel>Peso de entrada</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormInput
                          id="recebimento-peso"
                          variant="light"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.1"
                          value={pesoEntrada}
                          onChange={valor => {
                            pesoS3Ref.current = aplicarEdicaoManualPesoRecebimento(
                              pesoS3Ref.current,
                              valor,
                            );
                            setPesoEntrada(valor);
                          }}
                          placeholder="Opcional"
                          className="flex-1"
                        />
                        <span className="text-[12px] text-gray-500">kg</span>
                      </div>
                    </div>
                    <div>
                      <FormLabel>Raça</FormLabel>
                      <FormSelect
                        variant="light"
                        value={raca}
                        onChange={v => setRaca(valorSelect(v))}
                        placeholder="Opcional"
                      >
                        <SelectItem value={VAZIO} className="text-[12px]">
                          Sem raça
                        </SelectItem>
                        {RACAS.map(item => (
                          <SelectItem key={item} value={item} className="text-[12px]">
                            {item}
                          </SelectItem>
                        ))}
                      </FormSelect>
                    </div>
                    <div>
                      <FormLabel>Lote</FormLabel>
                      <FormSelect
                        variant="light"
                        value={loteId}
                        onChange={v => setLoteId(valorSelect(v))}
                        placeholder="Opcional"
                        disabled={!fazendaId}
                      >
                        <SelectItem value={VAZIO} className="text-[12px]">
                          Sem lote
                        </SelectItem>
                        {lotes.map(lote => (
                          <SelectItem key={lote.id} value={String(lote.id)} className="text-[12px]">
                            {lote.nome}
                          </SelectItem>
                        ))}
                      </FormSelect>
                    </div>
                    <div>
                      <FormLabel>Pasto</FormLabel>
                      <FormSelect
                        variant="light"
                        value={pastoId}
                        onChange={v => setPastoId(valorSelect(v))}
                        placeholder="Opcional"
                        disabled={!fazendaId}
                      >
                        <SelectItem value={VAZIO} className="text-[12px]">
                          Sem pasto
                        </SelectItem>
                        {pastosOrdenados.map(pasto => (
                          <SelectItem key={pasto.id} value={String(pasto.id)} className="text-[12px]">
                            {pasto.nome}
                          </SelectItem>
                        ))}
                      </FormSelect>
                    </div>
                  </div>
                </SecaoRecebimento>
              </div>

              <div className="border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => void handleConfirmar()}
                disabled={!podeReceber}
                className="inline-flex items-center px-5 min-h-[42px] rounded-lg text-[12px] font-semibold text-gray-800 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {receberMut.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  "Confirmar entrada e próximo"
                )}
              </button>
              </div>
            </div>
          )}

          {ultimo ? (
            <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
              <h2 className="text-[13px] font-semibold text-gray-800 mb-2">Último animal recebido</h2>
              <p className="text-[13px] font-medium text-gray-800">
                {rotuloUltimoAnimalRecebido({
                  brincoVisual: ultimo.brincoVisual,
                  rfid: ultimo.rfid,
                })}
              </p>
              <p className="text-[12px] text-gray-600">
                {ultimo.categoria} • {ultimo.sexoLabel}
              </p>
              {formatPesoRecebido(ultimo.pesoKg) ? (
                <p className="text-[12px] text-gray-600">{formatPesoRecebido(ultimo.pesoKg)}</p>
              ) : null}
              {ultimo.loteNome || ultimo.pastoNome ? (
                <p className="text-[12px] text-gray-600">
                  {[ultimo.loteNome ? `Lote ${ultimo.loteNome}` : null, ultimo.pastoNome ? `Pasto ${ultimo.pastoNome}` : null]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              ) : null}
              {formatHoraRecebido(ultimo.recebidoEm) ? (
                <p className="mt-1 text-[11px] text-gray-500">Recebido às {formatHoraRecebido(ultimo.recebidoEm)}</p>
              ) : null}
            </div>
          ) : null}

          <div
            id="recebimento-animais-recebidos"
            className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-[13px] font-semibold text-gray-800">Animais recebidos</h2>
            </div>
            {recebimentosVisiveis.length === 0 ? (
              <p className="px-4 py-2.5 text-[12px] text-gray-500">
                Nenhum animal recebido nesta compra.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Brinco</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Grupo</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">RFID</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Peso</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Destino</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Recebido em</th>
                      <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-2 py-2 w-10 text-right text-[10px] font-semibold text-gray-500 uppercase">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recebimentosVisiveis.map(item => (
                      <tr key={item.chaveLista} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-medium text-gray-800">
                          {textoOuTracoRecebimento(item.brincoVisual)}
                        </td>
                        <td className="px-4 py-2 text-gray-700">{item.grupoLabel}</td>
                        <td className="px-4 py-2 text-gray-700">{textoOuTracoRecebimento(item.rfid)}</td>
                        <td className="px-4 py-2 text-gray-700 tabular-nums">
                          {formatarPesoRecebimentoLista(item.pesoKg)}
                        </td>
                        <td className="px-4 py-2 text-gray-700">{item.destinoLabel}</td>
                        <td className="px-4 py-2 text-gray-700">
                          {formatarRecebidoEmLista(item)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                            {item.statusLabel}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          {podeMostrarAcaoDesfazerRecebimento(item) && item.recebimentoId != null ? (
                            <MenuAcoesRecebimentoConfirmado
                              onDesfazer={() => {
                                setDesfazerErro(null);
                                setDesfazerAlvo({
                                  recebimentoId: item.recebimentoId,
                                  brinco: item.brincoVisual.trim() || item.rfid || "",
                                  grupoLabel: item.grupoLabel,
                                })
                              }}
                            />
                          ) : (
                            TEXTO_VAZIO_RECEBIMENTO_LISTA
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      <DesfazerRecebimentoDialog
        open={desfazerAlvo != null}
        alvo={desfazerAlvo}
        submitting={desfazerMut.isPending}
        submitError={desfazerErro}
        onClose={fecharDesfazer}
        onConfirm={handleDesfazerRecebimento}
      />
    </AppLayout>
  );
}
