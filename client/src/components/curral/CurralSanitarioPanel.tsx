import { FormInput, FormLabel, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  calcularQuantidadeEstoquePorDose,
  OPCOES_UNIDADE_DOSE_SANITARIO,
  produtoControlaSaldo,
  siglaUnidade,
  sugerirUnidadeDoseSanitaria,
} from "@/lib/produto-types";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import { Syringe } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const FD_PRIMARY = "#4ECDC4";
const MSG_SANITARIO_DATA_FUTURA = "A data do manejo sanitário não pode ser futura.";
const MSG_SANITARIO_ESTOQUE_INSUFICIENTE =
  "Saldo insuficiente no estoque para esta dose. Ajuste a quantidade ou escolha outro produto.";
const CATEGORIA_SANITARIO_INSUMOS = "Farmácia";

const TIPOS_SANITARIO_MANEJO = [
  { value: "Vacinação", label: "Vacinação" },
  { value: "Vermifugação", label: "Vermifugação" },
  { value: "Tratamento", label: "Tratamento" },
  { value: "Outro", label: "Outro" },
] as const;

type TipoSanitarioManejo = (typeof TIPOS_SANITARIO_MANEJO)[number]["value"];

type EstoqueSanitarioItem = {
  id: number;
  nome?: string | null;
  subcategoria?: string | null;
  unidade?: string | null;
  quantidade?: number | string | null;
  valorUnitario?: unknown;
  fabricante?: string | null;
  fazendaId?: number | null;
  situacao?: string | null;
  embalagens?: string | null;
  controlarSaldo?: boolean | null;
};

function parseCustoMedioClient(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseDoseValorSanitario(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let normalized = t;
  if (t.includes(",")) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace(".", ",");
}

function montarDosagemSanitaria(
  valorRaw: string,
  unidadeRaw: string,
): { dosagem: string | undefined; erro: string | null } {
  const valorTrim = valorRaw.trim();
  const unidade = unidadeRaw.trim();
  if (!valorTrim && !unidade) return { dosagem: undefined, erro: null };
  if (valorTrim && !unidade) {
    return { dosagem: undefined, erro: "Informe a unidade da dose." };
  }
  if (!valorTrim && unidade) {
    return { dosagem: undefined, erro: "Informe o valor da dose." };
  }
  const valor = parseDoseValorSanitario(valorTrim);
  if (!valor) {
    return { dosagem: undefined, erro: "Informe um valor de dose válido maior que zero." };
  }
  return { dosagem: `${valor} ${unidade}`, erro: null };
}

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type CurralSanitarioRegistrado = {
  animalId: number;
  resumo: string;
};

type CurralSanitarioPanelProps = {
  fazendaNum: number;
  data: string;
  animalId: number;
  /** Salva no histórico da sessão sem avançar o animal. */
  onRegistrado: (payload: CurralSanitarioRegistrado) => void;
  /** Encerra a etapa sanitária e avança fila / próximo animal. */
  onConcluir: () => void;
  onBloqueioNegocio: (msg: string) => void;
  hasNextManejoNaFila: boolean;
};

export function CurralSanitarioPanel({
  fazendaNum,
  data,
  animalId,
  onRegistrado,
  onConcluir,
  onBloqueioNegocio,
  hasNextManejoNaFila,
}: CurralSanitarioPanelProps) {
  const trpcUtils = trpc.useUtils();
  const [tipoSanitario, setTipoSanitario] = useState<TipoSanitarioManejo | "">("");
  const [estoqueId, setEstoqueId] = useState<number | null>(null);
  const [produtoSel, setProdutoSel] = useState<EstoqueSanitarioItem | null>(null);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [listaProdutoAberta, setListaProdutoAberta] = useState(false);
  const [doseValor, setDoseValor] = useState("");
  const [doseUnidade, setDoseUnidade] = useState("");
  const [descricaoOutro, setDescricaoOutro] = useState("");
  const [erroDose, setErroDose] = useState("");
  const [erroProduto, setErroProduto] = useState("");
  const produtoRef = useRef<HTMLDivElement>(null);
  const doseUnidadeManualRef = useRef<{ produtoId: number | null; manual: boolean }>({
    produtoId: null,
    manual: false,
  });
  const [qtdRegistradaAnimal, setQtdRegistradaAnimal] = useState(0);

  const limparFormulario = useCallback(() => {
    setTipoSanitario("");
    setEstoqueId(null);
    setProdutoSel(null);
    setBuscaProduto("");
    setListaProdutoAberta(false);
    setDoseValor("");
    setDoseUnidade("");
    setDescricaoOutro("");
    setErroDose("");
    setErroProduto("");
    doseUnidadeManualRef.current = { produtoId: null, manual: false };
  }, []);

  useEffect(() => {
    limparFormulario();
    setQtdRegistradaAnimal(0);
  }, [animalId, limparFormulario]);

  const formularioPreenchido = Boolean(
    tipoSanitario || estoqueId || doseValor.trim() || descricaoOutro.trim(),
  );

  const aplicarSugestaoUnidadeDose = useCallback((p: EstoqueSanitarioItem) => {
    if (
      doseUnidadeManualRef.current.produtoId === p.id &&
      doseUnidadeManualRef.current.manual
    ) {
      return;
    }
    const sugerida = sugerirUnidadeDoseSanitaria({
      unidadeEstoque: p.unidade,
      embalagensRaw: p.embalagens,
    });
    if (sugerida) {
      setDoseUnidade(sugerida);
      doseUnidadeManualRef.current = { produtoId: p.id, manual: false };
    }
  }, []);

  const exigeProduto = Boolean(tipoSanitario) && tipoSanitario !== "Outro";
  const exigeDescricaoOutro = tipoSanitario === "Outro";

  const { data: estoqueFarmácia = [], isFetching: loadingEstoque } =
    trpc.estoque.listByCategories.useQuery(
      { categorias: [CATEGORIA_SANITARIO_INSUMOS] },
      { enabled: Boolean(fazendaNum) },
    );

  const produtosFazenda = useMemo(() => {
    if (!fazendaNum) return [];
    return (estoqueFarmácia as EstoqueSanitarioItem[]).filter(item => {
      const sit = String(item.situacao || "ativo").toLowerCase();
      if (sit === "inativo") return false;
      if (!produtoControlaSaldo(item.controlarSaldo)) return false;
      const fid = Number(item.fazendaId);
      return Number.isFinite(fid) && fid === fazendaNum;
    });
  }, [estoqueFarmácia, fazendaNum]);

  const produtosFiltrados = useMemo(() => {
    const q = buscaProduto.trim().toLowerCase();
    if (!q) return produtosFazenda.slice(0, 40);
    return produtosFazenda
      .filter(p => {
        const nome = String(p.nome || "").toLowerCase();
        const sub = String(p.subcategoria || "").toLowerCase();
        const fab = String(p.fabricante || "").toLowerCase();
        return nome.includes(q) || sub.includes(q) || fab.includes(q);
      })
      .slice(0, 40);
  }, [produtosFazenda, buscaProduto]);

  const custoMedioProduto = produtoSel
    ? parseCustoMedioClient(produtoSel.valorUnitario)
    : null;

  const doseNumParsed = useMemo(() => {
    const raw = doseValor.trim();
    if (!raw) return null;
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [doseValor]);

  const consumoCalc = useMemo(() => {
    if (!produtoSel || doseNumParsed == null || !doseUnidade.trim()) return null;
    return calcularQuantidadeEstoquePorDose({
      doseValor: doseNumParsed,
      doseUnidade,
      unidadeEstoque: produtoSel.unidade,
      embalagensRaw: produtoSel.embalagens,
    });
  }, [produtoSel, doseNumParsed, doseUnidade]);

  const selecionarProduto = (p: EstoqueSanitarioItem) => {
    doseUnidadeManualRef.current = { produtoId: p.id, manual: false };
    setEstoqueId(p.id);
    setProdutoSel(p);
    setBuscaProduto(p.nome || "");
    setListaProdutoAberta(false);
    setErroProduto("");
    aplicarSugestaoUnidadeDose(p);
  };

  const limparProduto = () => {
    doseUnidadeManualRef.current = { produtoId: null, manual: false };
    setEstoqueId(null);
    setProdutoSel(null);
    setBuscaProduto("");
    setErroProduto("");
    setDoseUnidade("");
  };

  useEffect(() => {
    if (!listaProdutoAberta) return;
    const onDoc = (e: MouseEvent) => {
      if (produtoRef.current && !produtoRef.current.contains(e.target as Node)) {
        setListaProdutoAberta(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listaProdutoAberta]);

  useEffect(() => {
    if (!estoqueId) return;
    const fresh = produtosFazenda.find(p => p.id === estoqueId);
    if (fresh) {
      setProdutoSel(fresh);
      aplicarSugestaoUnidadeDose(fresh);
    }
  }, [aplicarSugestaoUnidadeDose, produtosFazenda, estoqueId]);

  const saveMutation = trpc.saude.create.useMutation({
    onSuccess: (_result, vars) => {
      const partes = [vars.tipo];
      if (vars.dosagem) partes.push(vars.dosagem);
      else if (vars.descricao) partes.push(vars.descricao);
      const resumo = partes.join(" · ");
      onRegistrado({
        animalId: vars.animalId,
        resumo,
      });
      setQtdRegistradaAnimal(prev => prev + 1);
      limparFormulario();
      toast.success(`${resumo} · registre outro ou conclua o animal.`);
      void trpcUtils.estoque.listByCategories.invalidate();
      void trpcUtils.estoque.list.invalidate();
    },
    onError: err => {
      const msg = err.message || "Não foi possível salvar o registro sanitário.";
      if (msg.includes("não pode ser futura") || isMensagemBloqueioBaixa(msg)) {
        onBloqueioNegocio(isMensagemBloqueioBaixa(msg) ? msg : MSG_SANITARIO_DATA_FUTURA);
        return;
      }
      if (
        msg.toLowerCase().includes("estoque insuficiente") ||
        msg.toLowerCase().includes("não é possível converter") ||
        msg.toLowerCase().includes("custo médio")
      ) {
        onBloqueioNegocio(msg);
        return;
      }
      toast.error(msg);
    },
  });

  const registroBloqueado =
    saveMutation.isPending ||
    Boolean(
      estoqueId &&
        doseValor.trim() &&
        doseUnidade.trim() &&
        consumoCalc &&
        "erro" in consumoCalc,
    );

  const registrar = useCallback(() => {
    if (!fazendaNum) {
      toast.error("Aguardando contexto da sessão.");
      return;
    }
    if (!data) {
      toast.error("Informe a data da sessão.");
      return;
    }
    if (data > todayISODate()) {
      onBloqueioNegocio(MSG_SANITARIO_DATA_FUTURA);
      return;
    }
    if (!tipoSanitario) {
      toast.error("Selecione o tipo de manejo sanitário.");
      return;
    }
    if (exigeDescricaoOutro && !descricaoOutro.trim()) {
      toast.error("Descreva o manejo sanitário.");
      return;
    }
    if (exigeProduto && !estoqueId) {
      setErroProduto("Selecione um produto / medicamento do estoque.");
      toast.error("Selecione um produto / medicamento do estoque.");
      return;
    }
    if (estoqueId) {
      const doseMontada = montarDosagemSanitaria(doseValor, doseUnidade);
      if (doseMontada.erro) {
        setErroDose(doseMontada.erro);
        return;
      }
      setErroDose("");
      if (consumoCalc && "erro" in consumoCalc) {
        onBloqueioNegocio(consumoCalc.erro);
        return;
      }
      if (custoMedioProduto == null) {
        onBloqueioNegocio(
          "Este produto ainda não possui custo médio no estoque. Registre uma entrada com valor antes de usá-lo no manejo sanitário.",
        );
        return;
      }
      if (consumoCalc && "quantidade" in consumoCalc && produtoSel) {
        const disponivel = parseFloat(String(produtoSel.quantidade ?? 0));
        if (Number.isFinite(disponivel) && consumoCalc.quantidade > disponivel + 1e-9) {
          onBloqueioNegocio(MSG_SANITARIO_ESTOQUE_INSUFICIENTE);
          return;
        }
      }
    } else {
      const doseMontada = montarDosagemSanitaria(doseValor, doseUnidade);
      if (doseMontada.erro) {
        setErroDose(doseMontada.erro);
        return;
      }
      setErroDose("");
    }

    const doseMontada = montarDosagemSanitaria(doseValor, doseUnidade);

    saveMutation.mutate({
      animalId,
      fazendaId: fazendaNum,
      tipo: tipoSanitario,
      estoqueId: estoqueId ?? undefined,
      dosagem: doseMontada.dosagem,
      doseValor: doseValor.trim() || undefined,
      doseUnidade: doseUnidade.trim() || undefined,
      descricao: exigeDescricaoOutro ? descricaoOutro.trim() : undefined,
      dataRegistro: data,
    });
  }, [
    animalId,
    consumoCalc,
    custoMedioProduto,
    data,
    descricaoOutro,
    doseUnidade,
    doseValor,
    estoqueId,
    exigeDescricaoOutro,
    exigeProduto,
    fazendaNum,
    onBloqueioNegocio,
    produtoSel,
    saveMutation,
    tipoSanitario,
  ]);

  const concluirAnimal = useCallback(() => {
    if (saveMutation.isPending) return;
    if (formularioPreenchido) {
      toast.error("Há dados não registrados. Registre o sanitário ou limpe o formulário.");
      return;
    }
    onConcluir();
  }, [formularioPreenchido, onConcluir, saveMutation.isPending]);

  return (
    <div className="mt-4 space-y-4">
      {qtdRegistradaAnimal > 0 ? (
        <p className="text-[11px] font-medium text-teal-700">
          {qtdRegistradaAnimal}{" "}
          {qtdRegistradaAnimal === 1 ? "sanitário registrado" : "sanitários registrados"} neste
          animal.
        </p>
      ) : null}
      <div className="space-y-4">
        <div>
          <FormLabel required>Tipo de manejo sanitário</FormLabel>
          <FormSelect
            variant="light"
            value={tipoSanitario}
            onChange={v => {
              setTipoSanitario(v as TipoSanitarioManejo | "");
              if (v !== "Outro") setDescricaoOutro("");
            }}
            placeholder="Selecione o tipo"
            required
          >
            {TIPOS_SANITARIO_MANEJO.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-[12px]">
                {o.label}
              </SelectItem>
            ))}
          </FormSelect>
        </div>

        {(exigeProduto || tipoSanitario === "Outro") && tipoSanitario ? (
          <div>
            <FormLabel required={exigeProduto}>
              Produto / medicamento
              {!exigeProduto ? (
                <span className="text-gray-400 font-normal"> (opcional)</span>
              ) : null}
            </FormLabel>
            {produtoSel ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">
                      {produtoSel.nome}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {produtoSel.subcategoria || "Farmácia"}
                      {produtoSel.unidade
                        ? ` · estoque em ${siglaUnidade(produtoSel.unidade) || produtoSel.unidade}`
                        : ""}
                      {produtoSel.quantidade != null
                        ? ` · saldo ${Number(produtoSel.quantidade).toLocaleString("pt-BR")}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-gray-600 underline shrink-0"
                    onClick={limparProduto}
                  >
                    Alterar
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative" ref={produtoRef}>
                <FormInput
                  variant="light"
                  type="search"
                  value={buscaProduto}
                  onChange={next => {
                    if (estoqueId != null || produtoSel) {
                      setEstoqueId(null);
                      setProdutoSel(null);
                    }
                    setBuscaProduto(next);
                    setListaProdutoAberta(true);
                    if (erroProduto) setErroProduto("");
                  }}
                  onFocus={() => setListaProdutoAberta(true)}
                  placeholder="Buscar insumo da Farmácia…"
                  required={exigeProduto}
                  invalid={Boolean(erroProduto)}
                />
                {listaProdutoAberta ? (
                  <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {loadingEstoque ? (
                      <li className="px-3 py-2.5 text-[11px] text-gray-400">Carregando…</li>
                    ) : produtosFiltrados.length === 0 ? (
                      <li className="px-3 py-2.5 text-[11px] text-gray-400">
                        Nenhum produto Farmácia nesta fazenda.
                      </li>
                    ) : (
                      produtosFiltrados.map(p => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => selecionarProduto(p)}
                            className="w-full text-left px-3 py-2.5 hover:bg-[#4ECDC4]/[0.08] transition"
                          >
                            <div className="text-[13px] font-semibold text-gray-900">{p.nome}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {p.subcategoria || "Farmácia"}
                              {p.unidade ? ` · ${siglaUnidade(p.unidade) || p.unidade}` : ""}
                            </div>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            )}
            {erroProduto ? <p className="text-[11px] text-red-600 mt-1">{erroProduto}</p> : null}
          </div>
        ) : null}

        {exigeDescricaoOutro ? (
          <div>
            <FormLabel required>Descreva o manejo</FormLabel>
            <FormInput
              variant="light"
              value={descricaoOutro}
              onChange={setDescricaoOutro}
              placeholder="Descreva o manejo sanitário realizado"
            />
          </div>
        ) : null}

        <div>
          <FormLabel required={Boolean(estoqueId)}>Dose</FormLabel>
          <div className="flex gap-2 items-start min-w-0">
            <FormInput
              variant="light"
              type="text"
              inputMode="decimal"
              value={doseValor}
              onChange={next => {
                setDoseValor(next);
                if (erroDose) setErroDose("");
              }}
              placeholder="Ex.: 5"
              className="min-w-0 flex-1"
              required={Boolean(estoqueId)}
              invalid={Boolean(erroDose)}
            />
            <div className="w-[7.25rem] shrink-0">
              <FormSelect
                variant="light"
                value={doseUnidade}
                onChange={v => {
                  doseUnidadeManualRef.current = { produtoId: estoqueId, manual: true };
                  setDoseUnidade(v);
                  if (erroDose) setErroDose("");
                }}
                placeholder="Unidade"
                required={Boolean(estoqueId)}
              >
                {OPCOES_UNIDADE_DOSE_SANITARIO.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-[12px]">
                    {o.label}
                  </SelectItem>
                ))}
              </FormSelect>
            </div>
          </div>
          {erroDose ? <p className="text-[11px] text-red-600 mt-1">{erroDose}</p> : null}
          {consumoCalc && "erro" in consumoCalc && doseValor.trim() && doseUnidade ? (
            <p className="text-[11px] text-amber-700 mt-1 whitespace-pre-line leading-relaxed">
              {consumoCalc.erro}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={registrar}
          disabled={registroBloqueado}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full text-gray-900 text-[13px] font-bold uppercase tracking-wide min-h-[52px] hover:opacity-95 disabled:opacity-40"
          style={{ backgroundColor: FD_PRIMARY }}
        >
          <Syringe className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
          {saveMutation.isPending ? "Salvando…" : "Registrar sanitário"}
        </button>

        <button
          type="button"
          onClick={concluirAnimal}
          disabled={saveMutation.isPending || formularioPreenchido}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-gray-300 bg-white text-gray-800 text-[13px] font-bold uppercase tracking-wide min-h-[48px] hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {hasNextManejoNaFila ? "Concluir e próximo manejo" : "Concluir animal"}
        </button>
      </div>

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        Registre cada produto aplicado. Ao terminar, conclua o animal — ou conclua sem registrar
        se não houve sanitário nesta passagem.
      </p>
    </div>
  );
}
