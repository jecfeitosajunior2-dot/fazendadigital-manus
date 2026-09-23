import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { At05RfidReaderControl } from "@/components/At05RfidReaderControl";
import { useConfirm } from "@/components/ConfirmDialog";
import { ScaleReaderControl } from "@/components/curral/ScaleReaderControl";
import { VendaAnimaisPicker } from "@/components/venda/VendaAnimaisPicker";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormNativeSelect,
  FormTextarea,
  formControlFlatCls,
} from "@/components/FormFields";
import { FAZENDA_SELECT_PLACEHOLDER } from "@/components/ManejoPontualFormLayout";
import { useScaleReader } from "@/hooks/useScaleReader";
import { readCurrentTruTestBleWeightKg, useTruTestBleReader } from "@/hooks/useTruTestBleReader";
import { formatPesoKgVisorSessao } from "@/lib/curralSessaoLeituraRfid";
import { formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  COMPRA_VENDA_VENDAS_PATH,
  compraVendaVendaDetalhePath,
  opcoesComprador,
} from "@/lib/compraVendaCompradores";
import { CONSULTA_COMPRADORES_NOVA_VENDA } from "@/lib/compradoresListagem";
import { hojeISODate } from "@shared/animalBaixa";
import { normalizeRfidKey } from "@shared/rfidUnicidade";
import {
  aplicarPadraoEmLinhas,
  avaliarInclusaoAnimalVenda,
  calcularValorItem,
  escolherAlvoPesoBalanca,
  estadoAnimalAtualVenda,
  FORMA_PRECIFICACAO_VENDA_LABEL,
  isFormaPrecificacaoVendaPersistivel,
  MSG_VENDA_ANIMAL_DUPLICADO,
  MSG_VENDA_ANIMAL_OUTRA_FAZENDA,
  MSG_VENDA_ARROBA_REQUER_MIGRATION,
  MSG_VENDA_RFID_SEM_FAZENDA,
  MSG_VENDA_SEM_ITENS,
  MSG_VENDA_RENDIMENTO_INVALIDO,
  anexarItensVendaNaOrdemDaLida,
  parsePrecoVenda,
  parsePesoVenda,
  parseRendimentoCarcaca,
  pesoBalancaVendaNaIdentificacao,
  pesoEmbarqueObrigatorio,
  resumirItensVenda,
  type FormaPrecificacaoVenda,
  type OrigemPesoEmbarque,
} from "@shared/vendaComercial";
import { formatarMetricaQuantidade, formatarMetricaValor } from "@/lib/compraVendaResumo";
import { persistRebanhoFazendaId, readPersistedRebanhoFazendaId } from "@shared/animal-filter-types";
import { trpc } from "@/lib/trpc";

type ItemDraft = {
  animalId: number;
  brinco: string;
  loteNome: string;
  pesoVenda: string;
  pesoOrigem: OrigemPesoEmbarque;
  preco: string;
  precoManual: boolean;
  rendimento: string;
  rendimentoManual: boolean;
};

const VENDA_DRAFT_KEY = "fd_vendas_form_draft";

type VendaDraft = {
  fazendaId: string;
  data: string;
  compradorId: string;
  forma: FormaPrecificacaoVenda;
  precoPadrao: string;
  rendimento: string;
  observacoes: string;
  itens: ItemDraft[];
};

function precoPadraoParaItem(formatted: string): string {
  const n = parsePrecoVenda(parseCurrencyBrl(formatted));
  return n == null ? "" : String(n).replace(".", ",");
}

function valorItemDraft(forma: FormaPrecificacaoVenda, item: ItemDraft, rendimentoPadrao?: number | null) {
  const preco = parsePrecoVenda(item.preco);
  if (preco == null) return null;
  const rendItem = parseRendimentoCarcaca(item.rendimento);
  const rendimento =
    forma === "arroba" ? (rendItem.ok ? rendItem.valor : null) : rendimentoPadrao;
  const calc = calcularValorItem({
    forma,
    pesoVenda: parsePesoVenda(item.pesoVenda),
    precoUnitario: preco,
    rendimentoCarcaca: rendimento,
  });
  return calc.ok ? calc : null;
}

export default function NovaVendaPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: compradores = [] } = trpc.pessoas.list.useQuery(CONSULTA_COMPRADORES_NOVA_VENDA);

  const fazendaInicial = useMemo(() => {
    const ids = fazendas.map(f => f.id);
    return readPersistedRebanhoFazendaId(ids) || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
  }, [fazendas]);

  const [fazendaId, setFazendaId] = useState("");
  const [data, setData] = useState(hojeISODate());
  const [compradorId, setCompradorId] = useState("");
  const [forma, setForma] = useState<FormaPrecificacaoVenda>("kg");
  const [precoPadrao, setPrecoPadrao] = useState("");
  const [rendimento, setRendimento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<ItemDraft[]>([]);
  const [rfidFeedback, setRfidFeedback] = useState<{ kind: "ok" | "erro"; text: string; detalhe?: string } | null>(null);
  const [focoPesoAnimalId, setFocoPesoAnimalId] = useState<number | null>(null);
  const pesoInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const itensRef = useRef(itens);
  itensRef.current = itens;
  const focoRef = useRef(focoPesoAnimalId);
  focoRef.current = focoPesoAnimalId;
  const ultimoFocoAplicadoRef = useRef<number | null>(null);
  const pesoS3AnteriorRef = useRef<{ animalId: number; kg: number } | null>(null);

  useEffect(() => {
    if (!fazendaId && fazendaInicial) setFazendaId(fazendaInicial);
  }, [fazendaId, fazendaInicial]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const novoCompradorId = params.get("compradorId");
    const raw = sessionStorage.getItem(VENDA_DRAFT_KEY);

    if (raw) {
      try {
        const draft = JSON.parse(raw) as VendaDraft;
        setFazendaId(draft.fazendaId);
        setData(draft.data);
        setCompradorId(draft.compradorId);
        setForma(draft.forma === "arroba" || draft.forma === "cabeca" || draft.forma === "kg" ? draft.forma : "kg");
        setPrecoPadrao(draft.precoPadrao);
        setRendimento(draft.rendimento);
        setObservacoes(draft.observacoes);
        setItens(
          (draft.itens ?? []).map(item => ({
            ...item,
            pesoOrigem: item.pesoOrigem === "balanca" ? "balanca" : "manual",
            rendimento: item.rendimento ?? "",
            rendimentoManual: Boolean(item.rendimentoManual),
          })),
        );
      } catch {
        /* rascunho inválido */
      }
      sessionStorage.removeItem(VENDA_DRAFT_KEY);
    }

    if (novoCompradorId) {
      setCompradorId(novoCompradorId);
      params.delete("compradorId");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const irCadastrarComprador = () => {
    sessionStorage.setItem(
      VENDA_DRAFT_KEY,
      JSON.stringify({
        fazendaId,
        data,
        compradorId,
        forma,
        precoPadrao,
        rendimento,
        observacoes,
        itens,
      } satisfies VendaDraft),
    );
    const retorno = window.location.pathname + window.location.search;
    setLocation(`/financeiro/pessoas?novo=cliente&retorno=${encodeURIComponent(retorno)}`);
  };

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const { data: animaisFazenda = [], isLoading: loadingAnimais } = trpc.animais.list.useQuery(
    { fazendaId: fazendaNum, status: "ativo" },
    { enabled: fazendaNum > 0 },
  );

  const confirmarMut = trpc.vendas.confirmar.useMutation({
    onError: e => toast.error(e.message),
  });

  const animaisDisponiveis = useMemo(() => {
    const ids = new Set(itens.map(i => i.animalId));
    return (animaisFazenda as Array<{ id: number; status?: string | null; fazendaId?: number | null }>).filter(
      a => !ids.has(a.id) && a.status === "ativo",
    );
  }, [animaisFazenda, itens]);

  const rendimentoParse = parseRendimentoCarcaca(rendimento, { obrigatorio: forma === "arroba" });
  const rendimentoPadrao = rendimentoParse.ok ? rendimentoParse.valor : null;

  const resumo = useMemo(() => {
    const calculados = itens
      .map(item => {
        const calc = valorItemDraft(forma, item, rendimentoPadrao);
        return calc == null
          ? null
          : { pesoVenda: parsePesoVenda(item.pesoVenda), valorItem: calc.valor, arrobas: calc.arrobas };
      })
      .filter((row): row is { pesoVenda: number | null; valorItem: number; arrobas: number | null } => row != null);
    return {
      ...resumirItensVenda(calculados, { forma, rendimentoCarcaca: rendimentoPadrao }),
      quantidade: itens.length,
    };
  }, [itens, forma, rendimentoPadrao]);

  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;

  const mudarFazenda = (value: string) => {
    setFazendaId(value);
    if (value) persistRebanhoFazendaId(value);
    setItens([]);
  };

  const aplicarPrecoPadrao = (value: string) => {
    const formatted = formatCurrencyBrl(value);
    setPrecoPadrao(formatted);
    const paraItem = precoPadraoParaItem(formatted);
    setItens(prev => aplicarPadraoEmLinhas(prev, item => item.precoManual, item => ({ ...item, preco: paraItem })));
  };

  const aplicarRendimentoPadrao = (value: string) => {
    setRendimento(value);
    setItens(prev =>
      aplicarPadraoEmLinhas(prev, item => item.rendimentoManual, item => ({ ...item, rendimento: value })),
    );
  };

  const montarDraft = (animal: {
    id: number;
    brinco?: string | null;
    loteNome?: string | null;
  }): ItemDraft => ({
    animalId: animal.id,
    brinco: String(animal.brinco ?? "").trim() || `#${animal.id}`,
    loteNome: String(animal.loteNome ?? "").trim() || "—",
    pesoVenda: "",
    pesoOrigem: "manual",
    preco: precoPadraoParaItem(precoPadrao),
    precoManual: false,
    rendimento: rendimento,
    rendimentoManual: false,
  });

  const anexarItens = (novos: ItemDraft[]) => {
    if (!novos.length) return;
    setItens(prev => {
      const next = anexarItensVendaNaOrdemDaLida(prev, novos);
      itensRef.current = next;
      return next;
    });
  };

  const adicionarAnimais = (
    lista: Array<{
      id: number;
      brinco?: string | null;
      loteNome?: string | null;
      fazendaId?: number | null;
      status?: string | null;
    }>,
  ) => {
    if (!lista.length) return;
    if (!fazendaNum) {
      toast.error("Selecione a Fazenda.");
      return;
    }
    if (loadingAnimais) return;

    const jaIncluidos: string[] = [];
    const aceitos: typeof lista = [];
    for (const animal of lista) {
      if (!animaisFazenda.some(a => a.id === animal.id)) {
        toast.error(MSG_VENDA_ANIMAL_OUTRA_FAZENDA);
        continue;
      }
      if (itens.some(i => i.animalId === animal.id) || aceitos.some(a => a.id === animal.id)) {
        jaIncluidos.push(String(animal.brinco ?? "").trim() || `#${animal.id}`);
        continue;
      }
      aceitos.push(animal);
    }
    if (!aceitos.length) {
      toast.error(MSG_VENDA_ANIMAL_DUPLICADO);
      return;
    }
    if (jaIncluidos.length) toast.error(MSG_VENDA_ANIMAL_DUPLICADO);
    anexarItens(aceitos.map(montarDraft));
    const ultimo = aceitos[aceitos.length - 1];
    if (ultimo) {
      focoRef.current = ultimo.id;
      setFocoPesoAnimalId(ultimo.id);
    }
  };

  useEffect(() => {
    if (focoPesoAnimalId == null) return;
    if (ultimoFocoAplicadoRef.current === focoPesoAnimalId) return;
    const el = pesoInputRefs.current.get(focoPesoAnimalId);
    if (!el) return;
    el.focus();
    el.select();
    ultimoFocoAplicadoRef.current = focoPesoAnimalId;
  }, [focoPesoAnimalId, itens]);

  const aplicarPesoBalanca = useCallback((kg: number) => {
    const alvo = escolherAlvoPesoBalanca(itensRef.current, focoRef.current);
    if (alvo == null) return;
    const peso = pesoBalancaVendaNaIdentificacao({
      kg,
      alvoId: alvo,
      ultimoBalanca: pesoS3AnteriorRef.current,
    });
    if (peso == null) return;
    pesoS3AnteriorRef.current = { animalId: alvo, kg: peso };
    setItens(prev =>
      prev.map(row =>
        row.animalId === alvo
          ? { ...row, pesoVenda: formatPesoKgVisorSessao(peso), pesoOrigem: "balanca" }
          : row,
      ),
    );
    setFocoPesoAnimalId(alvo);
  }, []);

  const pedirPesoVisorBalanca = useCallback(() => {
    void readCurrentTruTestBleWeightKg().then(lido => {
      if (lido == null) return;
      aplicarPesoBalanca(lido);
    });
  }, [aplicarPesoBalanca]);

  const bleSession = useTruTestBleReader({ onWeight: aplicarPesoBalanca });
  const scaleSession = useScaleReader({
    presetId: "trutest-s3",
    onStableWeight: aplicarPesoBalanca,
  });
  const balancaConectada = Boolean(bleSession.sessionActive || scaleSession.sessionActive);
  const animalAtual = estadoAnimalAtualVenda({
    animalAtualId: focoPesoAnimalId,
    itens,
    balancaConectada,
  });

  useEffect(() => {
    if (!animalAtual?.aguardandoPesoBalanca) return;
    pedirPesoVisorBalanca();
    const timer = window.setInterval(() => pedirPesoVisorBalanca(), 800);
    return () => window.clearInterval(timer);
  }, [animalAtual?.aguardandoPesoBalanca, animalAtual?.animalId, pedirPesoVisorBalanca]);

  const incluirPorRfid = async (rfidBruto: string) => {
    const rfid = normalizeRfidKey(rfidBruto);
    if (!rfid) return;
    if (!fazendaNum) {
      setRfidFeedback({ kind: "erro", text: MSG_VENDA_RFID_SEM_FAZENDA });
      return;
    }
    const animal = await utils.animais.getByBrincoEletronicoExact.fetch({ brincoEletronico: rfid });
    const animalId = Number(animal?.id);
    const decisao = avaliarInclusaoAnimalVenda({
      animal: animal && Number.isInteger(animalId) && animalId > 0
        ? {
            id: animalId,
            brinco: animal.brinco != null ? String(animal.brinco) : null,
            fazendaId: animal.fazendaId != null ? Number(animal.fazendaId) : null,
            fazendaNome: animal.fazendaNome != null ? String(animal.fazendaNome) : null,
            status: animal.status != null ? String(animal.status) : null,
          }
        : null,
      fazendaId: fazendaNum,
      idsNaVenda: itensRef.current.map(i => i.animalId),
    });
    if (!decisao.ok) {
      setRfidFeedback({ kind: "erro", text: decisao.message, detalhe: decisao.detalhe });
      return;
    }
    const draft = montarDraft({
      id: animalId,
      brinco: animal?.brinco != null ? String(animal.brinco) : null,
      loteNome: animal?.loteNome != null ? String(animal.loteNome) : null,
    });
    anexarItens([draft]);
    setRfidFeedback(null);
    focoRef.current = draft.animalId;
    setFocoPesoAnimalId(draft.animalId);
    pedirPesoVisorBalanca();
  };

  const labelPrecoPadrao =
    forma === "kg" ? "Preço padrão (R$/kg)" : forma === "cabeca" ? "Valor padrão (R$/cabeça)" : "Preço padrão (R$/@)";

  const confirmar = async () => {
    if (!fazendaNum) {
      toast.error("Selecione a Fazenda.");
      return;
    }
    if (!compradorId) {
      toast.error("Selecione o comprador.");
      return;
    }
    if (!itens.length) {
      toast.error(MSG_VENDA_SEM_ITENS);
      return;
    }
    if (!isFormaPrecificacaoVendaPersistivel(forma)) {
      toast.error(MSG_VENDA_ARROBA_REQUER_MIGRATION);
      return;
    }
    const payloadItens = [];
    for (const item of itens) {
      const preco = parsePrecoVenda(item.preco);
      if (preco == null) {
        toast.error(`Informe o preço do animal ${item.brinco}.`);
        return;
      }
      const calc = calcularValorItem({
        forma,
        pesoVenda: parsePesoVenda(item.pesoVenda),
        precoUnitario: preco,
      });
      if (!calc.ok) {
        toast.error(`${item.brinco}: ${calc.message}`);
        return;
      }
      payloadItens.push({
        animalId: item.animalId,
        pesoVenda: parsePesoVenda(item.pesoVenda),
        precoUnitario: preco,
      });
    }

    const compradorNome = compradores.find(c => String(c.id) === compradorId)?.nome ?? "—";
    const ok = await confirm({
      title: "Confirmar Venda",
      confirmText: "Confirmar Venda",
      variant: "success",
      description: (
        <div className="space-y-1 text-[13px] text-gray-700">
          <p>Comprador: <span className="font-medium">{compradorNome}</span></p>
          <p>Data: <span className="font-medium">{data.split("-").reverse().join("/")}</span></p>
          <p>Forma: <span className="font-medium">{FORMA_PRECIFICACAO_VENDA_LABEL[forma]}</span></p>
          <p>Animais: <span className="font-medium">{resumo.quantidade}</span></p>
          <p>Peso do embarque: <span className="font-medium">{resumo.pesoTotal != null ? `${resumo.pesoTotal.toLocaleString("pt-BR")} kg` : "—"}</span></p>
          <p>Valor total: <span className="font-medium">{resumo.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></p>
        </div>
      ),
    });
    if (!ok) return;

    const result = await confirmarMut.mutateAsync({
      fazendaId: fazendaNum,
      data,
      compradorId: Number(compradorId),
      formaPrecificacao: forma,
      precoPadrao: parsePrecoVenda(parseCurrencyBrl(precoPadrao)),
      observacoes: observacoes.trim() || undefined,
      itens: payloadItens,
    });
    toast.success("Venda confirmada.");
    await Promise.all([
      utils.vendas.list.invalidate(),
      utils.animais.list.invalidate(),
      utils.animais.getById.invalidate(),
    ]);
    setLocation(compraVendaVendaDetalhePath(result.vendaId));
  };

  const colSpan = forma === "arroba" ? 9 : forma === "kg" ? 6 : 5;

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation(COMPRA_VENDA_VENDAS_PATH)}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        aria-label="Voltar"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <div className="space-y-5">
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
              Nova Venda
            </h1>
          </div>

          <div className="p-5 space-y-4">
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
                    onChange={mudarFazenda}
                    fazendas={fazendas}
                    emptyLabel={FAZENDA_SELECT_PLACEHOLDER}
                    required
                  />
                </div>
              )}
              <div className="min-w-0">
                <FormLabel required>Data</FormLabel>
                <FormDatePicker value={data} onChange={setData} required minHeight={34} />
              </div>
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${forma === "arroba" ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4`}>
              <div>
                <FormLabel required>Comprador</FormLabel>
                <FormNativeSelect
                  variant="light"
                  value={compradorId}
                  onChange={setCompradorId}
                  placeholder="Selecione o comprador"
                  options={opcoesComprador(compradores)}
                  required
                />
                <button
                  type="button"
                  onClick={irCadastrarComprador}
                  className="mt-1.5 text-[11px] font-medium text-[#4ECDC4] hover:underline"
                >
                  Cadastrar novo comprador
                </button>
              </div>
              <div className="min-w-[13rem]">
                <FormLabel required>Forma de precificação</FormLabel>
                <FormNativeSelect
                  variant="light"
                  value={forma}
                  onChange={v => {
                    const next = v as FormaPrecificacaoVenda;
                    setForma(next);
                    if (next === "arroba") {
                      setItens(prev =>
                        aplicarPadraoEmLinhas(
                          prev,
                          item => item.rendimentoManual,
                          item => ({ ...item, rendimento }),
                        ),
                      );
                    }
                  }}
                  placeholder="Selecione"
                  options={[
                    { value: "kg", label: FORMA_PRECIFICACAO_VENDA_LABEL.kg },
                    { value: "cabeca", label: FORMA_PRECIFICACAO_VENDA_LABEL.cabeca },
                    { value: "arroba", label: FORMA_PRECIFICACAO_VENDA_LABEL.arroba },
                  ]}
                  required
                />
              </div>
              <div>
                <FormLabel>{labelPrecoPadrao}</FormLabel>
                <input
                  value={precoPadrao}
                  onChange={e => aplicarPrecoPadrao(e.target.value)}
                  placeholder="R$ 0,00"
                  className={`${formControlFlatCls} bg-white outline-none placeholder:text-gray-400`}
                />
              </div>
              {forma === "arroba" ? (
                <div>
                  <FormLabel required>Rendimento padrão (%)</FormLabel>
                  <input
                    value={rendimento}
                    onChange={e => aplicarRendimentoPadrao(e.target.value)}
                    placeholder="Ex.: 50"
                    className={`${formControlFlatCls} bg-white outline-none placeholder:text-gray-400`}
                  />
                  {!rendimentoParse.ok ? (
                    <p className="mt-1 text-[10px] text-red-600">{MSG_VENDA_RENDIMENTO_INVALIDO}</p>
                  ) : (
                    <p className="mt-1 text-[10px] text-gray-400">Cada animal herda este valor até você alterar a linha.</p>
                  )}
                </div>
              ) : null}
            </div>
            {forma === "arroba" ? (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                A fórmula de R$/@ já calcula na tela. A gravação desta modalidade aguarda atualização do banco.
              </p>
            ) : null}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Animais da Venda</h2>
          </div>

          <div className="p-5 space-y-5">
          <div>
            <div className="mb-3 space-y-3">
              <p className="text-[11px] text-gray-500">
                Identifique o animal pelo RFID. Com a balança conectada, o peso do embarque será preenchido automaticamente.
              </p>
              {!fazendaNum ? (
                <p className="text-[11px] text-amber-700">{MSG_VENDA_RFID_SEM_FAZENDA}</p>
              ) : (
                <>
                  <At05RfidReaderControl
                    variant="hub"
                    mode="identificar"
                    continuous
                    listeningHint="Bastão conectado — aguardando próximo animal..."
                    onRfidRead={rfid => void incluirPorRfid(rfid)}
                  />
                  {animalAtual ? (
                    <div className="text-[11px] leading-relaxed space-y-0.5" aria-live="polite">
                      <p className="text-gray-800">
                        Animal atual: <span className="font-semibold">{animalAtual.brinco}</span>
                      </p>
                      <p className="text-teal-700">✓ Adicionado à venda</p>
                      {animalAtual.aguardandoPesoBalanca ? (
                        <p className="text-gray-500">Aguardando peso...</p>
                      ) : animalAtual.pesoKg != null ? (
                        <p className="text-teal-700">
                          ✓ Peso do embarque: {formatPesoKgVisorSessao(animalAtual.pesoKg)} kg
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {rfidFeedback?.kind === "erro" ? (
                    <p className="text-[11px] text-red-600" aria-live="polite">
                      {rfidFeedback.text}
                      {rfidFeedback.detalhe ? ` ${rfidFeedback.detalhe}` : ""}
                    </p>
                  ) : null}
                  <ScaleReaderControl
                    variant="hub"
                    session={scaleSession}
                    onStableWeight={aplicarPesoBalanca}
                    bleSession={bleSession}
                  />
                </>
              )}
            </div>
            <VendaAnimaisPicker
              animals={animaisDisponiveis as never}
              loading={loadingAnimais}
              disabled={!fazendaNum}
              onAddMany={lista => adicionarAnimais(lista)}
            />
          </div>

          <div className="border border-gray-100 rounded overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Brinco</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lote</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">
                    {forma === "arroba" ? "Peso vivo" : "Peso do embarque"}
                  </th>
                  {forma === "arroba" ? (
                    <>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Rend. %</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Carcaça</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">@</th>
                    </>
                  ) : null}
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">
                    {forma === "kg" ? "Preço/kg" : forma === "cabeca" ? "Valor/cabeça" : "Preço/@"}
                  </th>
                  {forma === "cabeca" ? null : (
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Valor</th>
                  )}
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-3 py-6 text-center text-gray-400">
                      Nenhum animal adicionado
                    </td>
                  </tr>
                ) : (
                  itens.map(item => {
                    const calc = valorItemDraft(forma, item, rendimentoPadrao);
                    return (
                      <tr key={item.animalId} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 font-medium text-gray-800">{item.brinco}</td>
                        <td className="px-3 py-1.5 text-gray-600">{item.loteNome}</td>
                        <td className="px-3 py-1.5">
                          <input
                            ref={el => {
                              if (el) pesoInputRefs.current.set(item.animalId, el);
                              else pesoInputRefs.current.delete(item.animalId);
                            }}
                            value={item.pesoVenda}
                            onChange={e =>
                              setItens(prev =>
                                prev.map(row =>
                                  row.animalId === item.animalId
                                    ? { ...row, pesoVenda: e.target.value, pesoOrigem: "manual" }
                                    : row,
                                ),
                              )
                            }
                            onFocus={() => {
                              focoRef.current = item.animalId;
                              setFocoPesoAnimalId(item.animalId);
                            }}
                            onKeyDown={e => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              e.currentTarget.blur();
                            }}
                            className="w-full text-right border border-gray-200 rounded px-2 py-1"
                            placeholder={pesoEmbarqueObrigatorio(forma) ? "kg *" : "kg"}
                          />
                        </td>
                        {forma === "arroba" ? (
                          <>
                            <td className="px-3 py-1.5">
                              <input
                                value={item.rendimento}
                                onChange={e =>
                                  setItens(prev =>
                                    prev.map(row =>
                                      row.animalId === item.animalId
                                        ? { ...row, rendimento: e.target.value, rendimentoManual: true }
                                        : row,
                                    ),
                                  )
                                }
                                className="w-full text-right border border-gray-200 rounded px-2 py-1"
                                placeholder="%"
                              />
                              {item.rendimentoManual ? (
                                <p className="text-[9px] text-teal-700 text-right">próprio</p>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-700">
                              {calc?.pesoCarcaca != null ? `${calc.pesoCarcaca.toLocaleString("pt-BR")} kg` : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right text-gray-700">
                              {calc?.arrobas != null ? calc.arrobas.toLocaleString("pt-BR") : "—"}
                            </td>
                          </>
                        ) : null}
                        <td className="px-3 py-1.5">
                          <input
                            value={item.preco}
                            onChange={e =>
                              setItens(prev =>
                                prev.map(row =>
                                  row.animalId === item.animalId
                                    ? { ...row, preco: e.target.value, precoManual: true }
                                    : row,
                                ),
                              )
                            }
                            className="w-full text-right border border-gray-200 rounded px-2 py-1"
                          />
                          {item.precoManual ? (
                            <p className="text-[9px] text-teal-700 text-right">próprio</p>
                          ) : null}
                        </td>
                        {forma === "cabeca" ? null : (
                          <td className="px-3 py-1.5 text-right font-medium text-gray-800">
                            {calc
                              ? calc.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                              : "—"}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => setItens(prev => prev.filter(row => row.animalId !== item.animalId))}
                            className="p-1 text-gray-400 hover:text-red-500"
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[10px] uppercase text-gray-500">Animais</p>
              <p className="text-[18px] font-bold text-gray-800">{formatarMetricaQuantidade({ kind: "known", value: resumo.quantidade })}</p>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[10px] uppercase text-gray-500">Peso do embarque</p>
              <p className="text-[18px] font-bold text-gray-800">
                {resumo.pesoTotal != null ? `${formatPesoKgVisorSessao(resumo.pesoTotal)} kg` : "—"}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[10px] uppercase text-gray-500">
                {forma === "cabeca" ? "Média/cabeça" : forma === "arroba" ? "Média/@" : "Média/kg"}
              </p>
              <p className="text-[18px] font-bold text-gray-800">
                {forma === "cabeca"
                  ? resumo.precoMedioCabeca != null
                    ? formatarMetricaValor({ kind: "known", value: resumo.precoMedioCabeca })
                    : "—"
                  : forma === "arroba"
                    ? resumo.precoMedioArroba != null
                      ? formatarMetricaValor({ kind: "known", value: resumo.precoMedioArroba })
                      : "—"
                    : resumo.precoMedioKg != null
                      ? formatarMetricaValor({ kind: "known", value: resumo.precoMedioKg })
                      : "—"}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[10px] uppercase text-gray-500">Valor total</p>
              <p className="text-[18px] font-bold text-gray-800">{formatarMetricaValor({ kind: "known", value: resumo.valorTotal })}</p>
            </div>
          </div>

          <div>
            <FormLabel>Observações</FormLabel>
            <FormTextarea variant="light" value={observacoes} onChange={setObservacoes} rows={2} />
          </div>

          <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setLocation(COMPRA_VENDA_VENDAS_PATH)}
              disabled={confirmarMut.isPending}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={confirmarMut.isPending}
              onClick={() => void confirmar()}
              className="inline-flex items-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {confirmarMut.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Confirmar Venda"
              )}
            </button>
          </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
