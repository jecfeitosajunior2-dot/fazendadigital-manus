import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { At05RfidReaderControl } from "@/components/At05RfidReaderControl";
import { RecebimentoS3ReaderControl } from "@/components/venda/RecebimentoS3ReaderControl";
import { useAt05Reader } from "@/hooks/useAt05Reader";
import { useTruTestBleReader } from "@/hooks/useTruTestBleReader";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormSelect,
} from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { filtrarLotesPorFazenda } from "@/lib/loteFazendaFilter";
import { compraVendaCompraDetalhePath } from "@/lib/compraVendaCompradores";
import { formatarMetricaQuantidade } from "@/lib/compraVendaResumo";
import {
  deveAplicarRfidRecebimentoCompra,
  proximoCicloCapturaRecebimento,
} from "@/lib/compraRecebimentoAt05";
import {
  aplicarEdicaoManualPesoRecebimento,
  aplicarLeituraPesoS3Recebimento,
  consumirPesoS3AposConfirmar,
  estadoInicialPesoS3Recebimento,
} from "@/lib/compraRecebimentoS3";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { RACAS } from "@shared/animal-types";
import { hojeISODateLocal } from "@shared/transferirAnimaisEntreLotes";

const VAZIO = "__none__";

type UltimoRecebido = {
  brinco: string;
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

function focarBrinco() {
  window.requestAnimationFrame(() => {
    document.getElementById("recebimento-brinco")?.focus();
  });
}

function valorSelect(raw: string): string {
  return raw === VAZIO ? "" : raw;
}

function SecaoRecebimento({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{titulo}</p>
      {children}
    </div>
  );
}


export default function CompraRecebimentoPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const id = Number(params.id);
  const { data, isLoading } = trpc.compras.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) && id > 0 },
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
  const cicloCapturaRef = useRef(1);
  const aceitandoLeituraRef = useRef(false);
  const confirmandoRef = useRef(false);
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
  const cancelada = data?.status === "cancelado";
  const compraConcluida = data?.status === "concluido";
  const grupos = data?.identificacao.grupos ?? [];
  const grupoSelecionado = grupos.find(g => g.id === grupoId) ?? null;
  const grupoAberto = Boolean(grupoSelecionado && grupoSelecionado.pendentes > 0);
  const mostraEquipamentos = compraConcluida && !cancelada && (data?.identificacao.pendentes ?? 0) > 0;
  const podeReceber =
    Boolean(data) &&
    compraConcluida &&
    !cancelada &&
    (data?.identificacao.pendentes ?? 0) > 0 &&
    grupoAberto &&
    brincoVisual.trim().length > 0 &&
    !receberMut.isPending;

  useEffect(() => {
    if (grupoAberto) focarBrinco();
  }, [grupoAberto, grupoId]);

  useEffect(() => {
    aceitandoLeituraRef.current = grupoAberto && !confirmandoRef.current;
  }, [grupoAberto]);

  const aplicarRfidLido = useCallback((rfidLido: string) => {
    const cicloDaLeitura = cicloCapturaRef.current;
    const decisao = deveAplicarRfidRecebimentoCompra({
      rfid: rfidLido,
      aceitandoLeituras: aceitandoLeituraRef.current,
      cicloAtual: cicloCapturaRef.current,
      cicloDaLeitura,
    });
    if (!decisao.aplicar) return;
    setRfid(decisao.rfid);
  }, []);

  const aplicarRfidLidoRef = useRef(aplicarRfidLido);
  aplicarRfidLidoRef.current = aplicarRfidLido;

  const at05 = useAt05Reader({
    onRead: rfidLido => aplicarRfidLidoRef.current(rfidLido),
  });

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

  const s3 = useTruTestBleReader({
    onWeight: kg => aplicarPesoS3Ref.current(kg),
  });

  const handleConfirmar = async () => {
    if (!data || grupoSelecionado == null) return;
    confirmandoRef.current = true;
    aceitandoLeituraRef.current = false;
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
      await utils.compras.get.invalidate({ id: data.id });
      setUltimo({
        brinco: out.brinco,
        categoria: out.categoria,
        sexoLabel: out.sexoLabel,
        pesoKg: out.pesoKg,
        loteNome: out.loteNome,
        pastoNome: out.pastoNome,
        recebidoEm: out.recebidoEm,
      });
      setBrincoVisual("");
      setRfid("");
      pesoS3Ref.current = consumirPesoS3AposConfirmar(pesoS3Ref.current);
      setPesoEntrada("");
      cicloCapturaRef.current = proximoCicloCapturaRecebimento(cicloCapturaRef.current);
      toast.success("Entrada confirmada.");
      focarBrinco();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível confirmar a entrada.");
    } finally {
      confirmandoRef.current = false;
      aceitandoLeituraRef.current = grupoAberto;
    }
  };

  const voltar = () => setLocation(Number.isFinite(id) ? compraVendaCompraDetalhePath(id) : "/compra-venda/compras");

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
                <p className="text-[10px] uppercase text-gray-400">Fornecedor</p>
                <p className="font-medium text-gray-800">{data.fornecedor}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Fazenda</p>
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
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                <p className="text-[10px] uppercase text-gray-500">Pendentes</p>
                <p className="text-[22px] font-bold text-gray-800 tabular-nums">{qtd(data.identificacao.pendentes)}</p>
              </div>
            </div>
            <p className="mt-3 text-[12px] font-medium text-gray-800">{data.identificacao.situacaoLabel}</p>
          </div>

          {mostraEquipamentos ? (
            <div
              id="recebimento-equipamentos"
              className="bg-white rounded shadow-sm border border-gray-100 p-4 space-y-2"
            >
              <At05RfidReaderControl
                session={at05}
                currentValue={rfid}
                mode="identificar"
                continuous
                variant="strip"
                listeningHint="AT05 escutando · passe a tag"
                onRfidRead={() => undefined}
              />
              <RecebimentoS3ReaderControl session={s3} />
            </div>
          ) : null}

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

          {ultimo ? (
            <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
              <h2 className="text-[13px] font-semibold text-gray-800 mb-2">Último animal recebido</h2>
              <p className="text-[13px] font-medium text-gray-800">Brinco {ultimo.brinco}</p>
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
                    <FormLabel required>Brinco visual</FormLabel>
                    <FormInput
                      id="recebimento-brinco"
                      variant="light"
                      value={brincoVisual}
                      onChange={setBrincoVisual}
                      required
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
        </div>
      )}
    </AppLayout>
  );
}
