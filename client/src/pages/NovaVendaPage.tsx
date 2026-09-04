import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { At05RfidReaderControl } from "@/components/At05RfidReaderControl";
import { useConfirm } from "@/components/ConfirmDialog";
import { CompradorFormDialog } from "@/components/venda/CompradorFormDialog";
import { VendaAnimaisPicker } from "@/components/venda/VendaAnimaisPicker";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormDownSelect,
  FormLabel,
  FormTextarea,
  formControlFlatCls,
} from "@/components/FormFields";
import { formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  COMPRA_VENDA_VENDAS_PATH,
  compraVendaVendaDetalhePath,
  opcoesComprador,
} from "@/lib/compraVendaCompradores";
import { hojeISODate } from "@shared/animalBaixa";
import { normalizeRfidKey } from "@shared/rfidUnicidade";
import {
  avaliarInclusaoAnimalVenda,
  calcularValorItem,
  FORMA_PRECIFICACAO_VENDA_LABEL,
  MSG_VENDA_ANIMAL_DUPLICADO,
  MSG_VENDA_ANIMAL_OUTRA_FAZENDA,
  MSG_VENDA_RFID_SEM_FAZENDA,
  MSG_VENDA_SEM_ITENS,
  MSG_VENDA_RENDIMENTO_INVALIDO,
  parsePrecoVenda,
  parsePesoVenda,
  parseRendimentoCarcaca,
  calcularPesoCarne,
  resumirItensVenda,
  type FormaPrecificacaoVenda,
} from "@shared/vendaComercial";
import { formatarMetricaPeso, formatarMetricaQuantidade, formatarMetricaValor } from "@/lib/compraVendaResumo";
import { persistRebanhoFazendaId, readPersistedRebanhoFazendaId } from "@shared/animal-filter-types";
import { trpc } from "@/lib/trpc";

type ItemDraft = {
  animalId: number;
  brinco: string;
  loteNome: string;
  pesoVenda: string;
  preco: string;
  precoManual: boolean;
};

function precoPadraoParaItem(formatted: string): string {
  const n = parsePrecoVenda(parseCurrencyBrl(formatted));
  return n == null ? "" : String(n).replace(".", ",");
}

function valorItemDraft(
  forma: FormaPrecificacaoVenda,
  item: ItemDraft,
  rendimentoCarcaca?: number | null,
) {
  const preco = parsePrecoVenda(item.preco);
  if (preco == null) return null;
  const calc = calcularValorItem({
    forma,
    pesoVenda: parsePesoVenda(item.pesoVenda),
    precoUnitario: preco,
    rendimentoCarcaca,
  });
  return calc.ok ? calc.valor : null;
}

export default function NovaVendaPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: compradores = [] } = trpc.pessoas.list.useQuery({ tipo: "cliente" });

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
  const [showNovoComprador, setShowNovoComprador] = useState(false);
  const [usarRfid, setUsarRfid] = useState(false);
  const [rfidFeedback, setRfidFeedback] = useState<{ kind: "ok" | "erro"; text: string; detalhe?: string } | null>(null);
  const [ultimoBrincoRfid, setUltimoBrincoRfid] = useState<string | null>(null);
  const [focoPesoAnimalId, setFocoPesoAnimalId] = useState<number | null>(null);
  const pesoInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  useEffect(() => {
    if (!fazendaId && fazendaInicial) setFazendaId(fazendaInicial);
  }, [fazendaId, fazendaInicial]);

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

  const rendimentoParse = parseRendimentoCarcaca(rendimento);
  const rendimentoValor =
    forma === "kg" && rendimentoParse.ok ? rendimentoParse.valor : null;
  const temRendimento = rendimentoValor != null;

  const resumo = useMemo(() => {
    const calculados = itens
      .map(item => {
        const valor = valorItemDraft(forma, item, rendimentoValor);
        return valor == null ? null : { pesoVenda: parsePesoVenda(item.pesoVenda), valorItem: valor };
      })
      .filter((row): row is { pesoVenda: number | null; valorItem: number } => row != null);
    return { ...resumirItensVenda(calculados, { rendimentoCarcaca: rendimentoValor }), quantidade: itens.length };
  }, [itens, forma, rendimentoValor]);

  const mudarFazenda = (value: string) => {
    setFazendaId(value);
    if (value) persistRebanhoFazendaId(value);
    setItens([]);
  };

  const aplicarPrecoPadrao = (value: string) => {
    const formatted = formatCurrencyBrl(value);
    setPrecoPadrao(formatted);
    const paraItem = precoPadraoParaItem(formatted);
    setItens(prev =>
      prev.map(item => (item.precoManual ? item : { ...item, preco: paraItem })),
    );
  };

  const pesoSugeridoDoAnimal = (animal: {
    ultimoPeso?: number | null;
    origemUltimoPeso?: "pesagem" | "entrada" | null;
  }) => {
    if (animal.origemUltimoPeso !== "pesagem") return "";
    const peso = parsePesoVenda(animal.ultimoPeso);
    return peso == null ? "" : String(peso).replace(".", ",");
  };

  const montarDraft = (animal: {
    id: number;
    brinco?: string | null;
    loteNome?: string | null;
    ultimoPeso?: number | null;
    origemUltimoPeso?: "pesagem" | "entrada" | null;
  }): ItemDraft => ({
    animalId: animal.id,
    brinco: String(animal.brinco ?? "").trim() || `#${animal.id}`,
    loteNome: String(animal.loteNome ?? "").trim() || "—",
    pesoVenda: pesoSugeridoDoAnimal(animal),
    preco: precoPadraoParaItem(precoPadrao),
    precoManual: false,
  });

  const anexarItens = (novos: ItemDraft[]) => {
    if (!novos.length) return;
    setItens(prev => {
      const jaTem = new Set(prev.map(i => i.animalId));
      const unique = novos.filter(n => !jaTem.has(n.animalId));
      return unique.length ? [...prev, ...unique] : prev;
    });
  };

  const adicionarAnimais = (
    lista: Array<{
      id: number;
      brinco?: string | null;
      loteNome?: string | null;
      fazendaId?: number | null;
      status?: string | null;
      ultimoPeso?: number | null;
      origemUltimoPeso?: "pesagem" | "entrada" | null;
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
    if (jaIncluidos.length) {
      toast.error(MSG_VENDA_ANIMAL_DUPLICADO);
    }
    anexarItens(aceitos.map(montarDraft));
  };

  useEffect(() => {
    if (focoPesoAnimalId == null) return;
    const el = pesoInputRefs.current.get(focoPesoAnimalId);
    if (el) {
      el.focus();
      el.select();
    }
    setFocoPesoAnimalId(null);
  }, [focoPesoAnimalId, itens]);

  const incluirPorRfid = async (rfidBruto: string) => {
    const rfid = normalizeRfidKey(rfidBruto);
    if (!rfid) return;
    if (!fazendaNum) {
      setRfidFeedback({ kind: "erro", text: MSG_VENDA_RFID_SEM_FAZENDA });
      return;
    }
    const animal = await utils.animais.getByBrincoEletronicoExact.fetch({ brincoEletronico: rfid });
    const naLista = (animaisFazenda as Array<{
      id: number;
      ultimoPeso?: number | null;
      origemUltimoPeso?: "pesagem" | "entrada" | null;
    }>).find(a => a.id === animal?.id);
    const decisao = avaliarInclusaoAnimalVenda({
      animal: animal
        ? {
            id: animal.id,
            brinco: animal.brinco,
            fazendaId: animal.fazendaId,
            fazendaNome: animal.fazendaNome,
            status: animal.status,
          }
        : null,
      fazendaId: fazendaNum,
      idsNaVenda: itens.map(i => i.animalId),
    });
    if (!decisao.ok) {
      setRfidFeedback({ kind: "erro", text: decisao.message, detalhe: decisao.detalhe });
      return;
    }
    const draft = montarDraft({
      id: animal!.id,
      brinco: animal!.brinco,
      loteNome: animal!.loteNome,
      ultimoPeso: naLista?.ultimoPeso,
      origemUltimoPeso: naLista?.origemUltimoPeso,
    });
    anexarItens([draft]);
    setUltimoBrincoRfid(draft.brinco);
    setRfidFeedback({ kind: "ok", text: `Animal ${draft.brinco} adicionado.` });
    setFocoPesoAnimalId(draft.animalId);
  };

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
    if (forma === "kg" && !rendimentoParse.ok) {
      toast.error(MSG_VENDA_RENDIMENTO_INVALIDO);
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
        rendimentoCarcaca: rendimentoValor,
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
          <p>Animais: <span className="font-medium">{resumo.quantidade}</span></p>
          {temRendimento ? (
            <p>Rendimento: <span className="font-medium">{rendimentoValor.toLocaleString("pt-BR")}%</span></p>
          ) : null}
          <p>{temRendimento ? "Peso carne" : "Peso total"}: <span className="font-medium">{resumo.pesoTotal != null ? `${resumo.pesoTotal.toLocaleString("pt-BR")} kg` : "—"}</span></p>
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
      rendimentoCarcaca: rendimentoValor,
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
            <div className="flex flex-row items-end gap-4">
              <div className="min-w-0 flex-1">
                <FormLabel required>Fazenda</FormLabel>
                <FormDownSelect
                  value={fazendaId}
                  onChange={mudarFazenda}
                  placeholder="Selecione a Fazenda"
                  options={fazendas.map(f => ({ value: String(f.id), label: f.nome }))}
                  required
                />
              </div>
              <div className="w-[11.5rem] shrink-0">
                <FormLabel required>Data</FormLabel>
                <FormDatePicker value={data} onChange={setData} required minHeight={34} />
              </div>
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${forma === "kg" ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4`}>
              <div>
                <FormLabel required>Comprador</FormLabel>
              <FormDownSelect
                value={compradorId}
                onChange={setCompradorId}
                placeholder="Buscar comprador..."
                options={opcoesComprador(compradores)}
                required
              />
              <button
                type="button"
                onClick={() => setShowNovoComprador(true)}
                className="mt-1.5 text-[12px] font-medium text-[#4ECDC4] hover:underline"
              >
                + Novo comprador
              </button>
            </div>
            <div className="min-w-[13rem]">
              <FormLabel required>Forma de precificação</FormLabel>
              <FormDownSelect
                value={forma}
                onChange={v => setForma(v as FormaPrecificacaoVenda)}
                placeholder="Selecione"
                options={[
                  { value: "kg", label: FORMA_PRECIFICACAO_VENDA_LABEL.kg },
                  { value: "cabeca", label: FORMA_PRECIFICACAO_VENDA_LABEL.cabeca },
                ]}
                required
              />
            </div>
            <div>
              <FormLabel>Preço padrão (R$)</FormLabel>
              <input
                value={precoPadrao}
                onChange={e => aplicarPrecoPadrao(e.target.value)}
                placeholder="R$ 0,00"
                className={`${formControlFlatCls} bg-white outline-none placeholder:text-gray-400`}
              />
            </div>
            {forma === "kg" ? (
              <div>
                <FormLabel>Rendimento (%)</FormLabel>
                <input
                  value={rendimento}
                  onChange={e => setRendimento(e.target.value)}
                  placeholder="Ex.: 52"
                  className={`${formControlFlatCls} bg-white outline-none placeholder:text-gray-400`}
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Em branco = peso vivo. 52 = 52% de carne.
                </p>
              </div>
            ) : null}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Animais da Venda</h2>
          </div>

          <div className="p-5 space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-gray-500">Buscar e selecionar abaixo</span>
              <button
                type="button"
                onClick={() => setUsarRfid(aberto => !aberto)}
                className={`h-7 px-2.5 rounded text-[11px] font-medium border ${
                  usarRfid
                    ? "border-[#4ECDC4] bg-[#4ECDC4]/10 text-gray-800"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Usar RFID
              </button>
            </div>
            {usarRfid ? (
              <div className="mb-3 rounded border border-gray-200 bg-white p-3">
                <p className="text-[12px] font-semibold text-gray-800">RFID</p>
                {!fazendaNum ? (
                  <p className="mt-2 text-[12px] text-amber-700">{MSG_VENDA_RFID_SEM_FAZENDA}</p>
                ) : (
                  <At05RfidReaderControl
                    mode="identificar"
                    onRfidRead={rfid => void incluirPorRfid(rfid)}
                  />
                )}
                {ultimoBrincoRfid ? (
                  <p className="mt-1 text-[11px] text-gray-500">Último animal: {ultimoBrincoRfid}</p>
                ) : null}
                {rfidFeedback ? (
                  <p
                    className={`mt-1 text-[11px] ${rfidFeedback.kind === "ok" ? "text-teal-700" : "text-red-600"}`}
                    aria-live="polite"
                  >
                    {rfidFeedback.text}
                    {rfidFeedback.detalhe ? ` ${rfidFeedback.detalhe}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
            <VendaAnimaisPicker
              animals={animaisDisponiveis as never}
              loading={loadingAnimais}
              disabled={!fazendaNum}
              onAddMany={lista => adicionarAnimais(lista)}
            />
          </div>

          <div className="border border-gray-100 rounded overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Brinco</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lote</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso vivo</th>
                  {temRendimento ? (
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso carne</th>
                  ) : null}
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Preço</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Valor</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 ? (
                  <tr>
                    <td colSpan={temRendimento ? 7 : 6} className="px-3 py-6 text-center text-gray-400">
                      Nenhum animal adicionado
                    </td>
                  </tr>
                ) : (
                  itens.map(item => {
                    const valor = valorItemDraft(forma, item, rendimentoValor);
                    const pesoVivo = parsePesoVenda(item.pesoVenda);
                    const pesoCarne = pesoVivo != null && temRendimento
                      ? calcularPesoCarne(pesoVivo, rendimentoValor)
                      : null;
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
                                  row.animalId === item.animalId ? { ...row, pesoVenda: e.target.value } : row,
                                ),
                              )
                            }
                            onKeyDown={e => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              e.currentTarget.blur();
                            }}
                            className="w-full text-right border border-gray-200 rounded px-2 py-1"
                            placeholder={forma === "kg" ? "kg *" : "kg"}
                          />
                        </td>
                        {temRendimento ? (
                          <td className="px-3 py-1.5 text-right text-gray-700">
                            {pesoCarne != null ? `${pesoCarne.toLocaleString("pt-BR")} kg` : "—"}
                          </td>
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
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-800">
                          {valor != null
                            ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                            : "—"}
                        </td>
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
              <p className="text-[10px] uppercase text-gray-500">{temRendimento ? "Peso carne" : "Peso total"}</p>
              <p className="text-[18px] font-bold text-gray-800">
                {resumo.pesoTotal != null ? formatarMetricaPeso({ kind: "known", value: resumo.pesoTotal }) : "—"}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[10px] uppercase text-gray-500">Valor total</p>
              <p className="text-[18px] font-bold text-gray-800">{formatarMetricaValor({ kind: "known", value: resumo.valorTotal })}</p>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[10px] uppercase text-gray-500">Preço médio/kg</p>
              <p className="text-[18px] font-bold text-gray-800">
                {resumo.precoMedioKg != null
                  ? formatarMetricaValor({ kind: "known", value: resumo.precoMedioKg })
                  : "—"}
              </p>
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

      <CompradorFormDialog
        open={showNovoComprador}
        onOpenChange={setShowNovoComprador}
        onSaved={id => setCompradorId(String(id))}
      />
    </AppLayout>
  );
}
