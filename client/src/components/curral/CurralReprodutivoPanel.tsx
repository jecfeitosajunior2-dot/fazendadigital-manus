import { AnimalAutocomplete } from "@/components/AnimalAutocomplete";
import {
  FormInput,
  FormLabel,
  FormSelect,
  FormTextarea,
  formCheckboxCls,
  FD_PRIMARY,
} from "@/components/FormFields";
import { ManejoAnimalRow } from "@/components/ManejoAnimalField";
import { SemenReprodutorExternoField } from "@/components/SemenReprodutorExternoField";
import { SelectItem } from "@/components/ui/select";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateBR } from "@/lib/date-utils";
import { invalidateSemenQueriesAfterConsumo, invalidateSemenUtilizadoQueries } from "@/lib/invalidateSemenAfterConsumo";
import { shouldLoadSemenPartidasParaInseminacao } from "@/lib/semenInseminacaoQuery";
import {
  curralResultadoToggleGridClass,
  DG_RESULTADOS_CURRAL,
  EXAME_ANDROLOGICO_RESULTADOS_CURRAL,
  getCurralResultadoToggleOptions,
  isDgResultadoCurralAvancado,
  isDgResultadoCurralPrincipal,
  isExameAndrologicoResultadoAvancado,
  isExameAndrologicoResultadoPrincipal,
  maisDetalhesResumoCurral,
  showCioResultadoCurral,
  showColetaSemenCurral,
  showDgResultadoAvancadoCurral,
  showExameAndrologicoAvancadoCurral,
  showExameAndrologicoCurral,
  formatMsgMatrizJaCobertaNesteTouro,
  isMatrizJaRegistradaCoberturaCurral,
  usesCurralReproMultiRegistro,
  usesCurralResultadoToggle,
} from "@/lib/curralReprodutivoUi";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { subtituloMachoReprodutor } from "@shared/animalBuscaDisplay";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import {
  buildReproAnimalElegibilidadeInput,
  getReproTipoOptionsElegiveis,
  hasCategoriaIdadeMismatchRepro,
  isFemeaReprodutivamenteMadura,
  isReproTipoPermitidoParaAnimal,
  MSG_REPRO_INELEGIVEL,
} from "@shared/reproElegibilidade";
import {
  coberturaAlvoPermiteModoIndividual,
  isEstacaoMontaMacho,
  MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO,
  MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS,
  showReproCoberturaAlvoFieldManejo,
} from "@shared/reproCoberturaAlvo";
import {
  countMatrizesElegiveisPorLote,
  labelAnimalCobertura,
  listMatrizesElegiveisDoLote,
} from "@shared/reproCoberturaAlvoSelection";
import {
  custoDoseInseminacaoExternaInformado,
  sanitizeReproEccInputString,
  validateReproCustoDoseInseminacaoExterna,
  validateReproEcc,
} from "@shared/reproInseminacao";
import {
  filterMachosReprodutoresCandidatos,
  resolveMachoIdFromSelecao,
} from "@shared/reproMachoSelect";
import { buildReproReprodutorPayload } from "@shared/reproReprodutorPersist";
import {
  calcPrevisaoParto283,
  getReproResultadoOptions,
  isReproResultadoRequiredManejo,
  MSG_REPRO_RESULTADO_INCOMPATIVEL,
  shouldCalcPrevisaoParto,
  shouldShowPrevisaoPartoForm,
  showReproDescricaoOutroManejo,
  showReproDescricaoResultadoOutroManejo,
  showReproReprodutorFieldManejo,
  showReproResultadoFieldManejo,
  validateReproResultadoForSave,
} from "@shared/reproRegistroMeta";
import {
  formatSemenCustoTotalDisplay,
  formatSemenPartidaInseminacaoOptionLabel,
  parseSemenCustoTotal,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  tryBuildSemenReprodutorKeyExterno,
} from "@shared/semenEstoque";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, HeartPulse } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const MSG_REPRODUTIVO_DATA_FUTURA = "A data do manejo reprodutivo não pode ser futura.";
const fieldCls =
  "w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]";

export type CurralReprodutivoAnimal = ManejoAnimalRow;

type CurralResultadoToggleGroupProps = {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
};

function CurralResultadoToggleGroup({
  options,
  value,
  onChange,
}: CurralResultadoToggleGroupProps) {
  return (
    <div className={cn("grid gap-2", curralResultadoToggleGridClass(options.length))}>
      {options.map(opcao => (
        <button
          key={opcao}
          type="button"
          onClick={() => onChange(value === opcao ? "" : opcao)}
          className={cn(
            "rounded-xl border px-2 py-3 text-[12px] font-semibold leading-snug transition-colors",
            value === opcao
              ? "border-[#4ECDC4] bg-[#4ECDC4]/10 text-gray-900"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
          )}
        >
          {opcao}
        </button>
      ))}
    </div>
  );
}

export type CurralReprodutivoRegistrado = {
  animalId: number;
  resumo: string;
};

type CurralReprodutivoPanelProps = {
  fazendaNum: number;
  data: string;
  animal: CurralReprodutivoAnimal;
  /** Salva no histórico da sessão sem avançar o animal. */
  onRegistrado: (payload: CurralReprodutivoRegistrado) => void;
  /** Encerra a etapa reprodutiva e avança fila / próximo animal. */
  onConcluir: () => void;
  onBloqueioNegocio: (msg: string) => void;
  hasNextManejoNaFila: boolean;
};

function formatResumoReproCurral(
  tipo: string,
  resultado?: string,
  matrizLabel?: string,
): string {
  const r = resultado?.trim();
  let resumo = r ? `${tipo} · ${r}` : tipo;
  const matriz = matrizLabel?.trim();
  if (matriz) resumo = `${resumo} · Matriz ${matriz}`;
  return resumo;
}

export function CurralReprodutivoPanel({
  fazendaNum,
  data,
  animal,
  onRegistrado,
  onConcluir,
  onBloqueioNegocio,
  hasNextManejoNaFila,
}: CurralReprodutivoPanelProps) {
  const trpcUtils = trpc.useUtils();
  const animalId = animal.id;
  const animalSexo = animal.sexo ?? null;

  const [tipoReprodutivo, setTipoReprodutivo] = useState("");
  const [resultado, setResultado] = useState("");
  const [descricaoOutro, setDescricaoOutro] = useState("");
  const [descricaoResultadoOutro, setDescricaoResultadoOutro] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [reprodutorOrigem, setReprodutorOrigem] = useState<"" | "interno" | "externo">("");
  const [machoSel, setMachoSel] = useState<ManejoAnimalRow | null>(null);
  const [matrizSel, setMatrizSel] = useState<ManejoAnimalRow | null>(null);
  const [reprodutorSemen, setReprodutorSemen] = useState("");
  const [partidaSemen, setPartidaSemen] = useState("");
  const [semenPartidaId, setSemenPartidaId] = useState<number | null>(null);
  const [centralOrigemSemen, setCentralOrigemSemen] = useState("");
  const [custoDoseSemen, setCustoDoseSemen] = useState("");
  const [inseminador, setInseminador] = useState("");
  const [eccMatriz, setEccMatriz] = useState("");
  const [criaBrinco, setCriaBrinco] = useState("");
  const [criaSexo, setCriaSexo] = useState<"" | "macho" | "femea">("");
  const [maisDetalhesAberto, setMaisDetalhesAberto] = useState(false);
  const [qtdRegistradaAnimal, setQtdRegistradaAnimal] = useState(0);
  const [matrizesRegistradasIds, setMatrizesRegistradasIds] = useState<number[]>([]);
  const [coberturaSelecaoModo, setCoberturaSelecaoModo] = useState<"" | "individual" | "lote">("");
  const [loteCoberturaId, setLoteCoberturaId] = useState("");
  const [matrizesLoteSelecionadas, setMatrizesLoteSelecionadas] = useState<number[]>([]);
  const matrizCoberturaRegistroRef = useRef<ManejoAnimalRow | null>(null);
  const matrizCoberturaBatchRef = useRef<{ ids: number[]; resumo: string } | null>(null);

  const matrizesRegistradasSet = useMemo(
    () => new Set(matrizesRegistradasIds),
    [matrizesRegistradasIds],
  );

  const limparEntradaCobertura = useCallback(() => {
    setMatrizSel(null);
    setCoberturaSelecaoModo("");
    setLoteCoberturaId("");
    setMatrizesLoteSelecionadas([]);
    setObservacoes("");
    setMaisDetalhesAberto(false);
  }, []);

  useEffect(() => {
    setQtdRegistradaAnimal(0);
    setMatrizesRegistradasIds([]);
    setTipoReprodutivo("");
    setResultado("");
    setDescricaoOutro("");
    setDescricaoResultadoOutro("");
    setObservacoes("");
    setReprodutorOrigem("");
    setMachoSel(null);
    setMatrizSel(null);
    setCoberturaSelecaoModo("");
    setLoteCoberturaId("");
    setMatrizesLoteSelecionadas([]);
    setReprodutorSemen("");
    setPartidaSemen("");
    setSemenPartidaId(null);
    setCentralOrigemSemen("");
    setCustoDoseSemen("");
    setInseminador("");
    setEccMatriz("");
    setCriaBrinco("");
    setCriaSexo("");
    setMaisDetalhesAberto(false);
  }, [animalId]);

  const reproElegibilidade = useMemo(
    () => buildReproAnimalElegibilidadeInput(animal),
    [animal],
  );

  const reproTipoOptions = useMemo(
    () => getReproTipoOptionsElegiveis(reproElegibilidade),
    [reproElegibilidade],
  );

  const categoriaIdadeMismatch = useMemo(
    () => hasCategoriaIdadeMismatchRepro(reproElegibilidade),
    [reproElegibilidade],
  );

  const reproResultadoOptions = useMemo(
    () => getReproResultadoOptions(animalSexo, tipoReprodutivo, resultado),
    [animalSexo, tipoReprodutivo, resultado],
  );

  const showReprodutorFemea =
    animalSexo === "femea" &&
    (tipoReprodutivo === "Cobertura" || tipoReprodutivo === "Inseminação");
  const showCoberturaAlvo = showReproCoberturaAlvoFieldManejo(tipoReprodutivo, animalSexo);
  const estacaoMontaCurral = isEstacaoMontaMacho(tipoReprodutivo);
  const coberturaPermiteIndividual = coberturaAlvoPermiteModoIndividual(tipoReprodutivo);
  const showResultado = showReproResultadoFieldManejo(tipoReprodutivo, animalSexo);
  const exigeResultado = isReproResultadoRequiredManejo(tipoReprodutivo, animalSexo);
  const resultadoOcultoComDefault =
    tipoReprodutivo === "Inseminação" || tipoReprodutivo === "Cobertura";
  const isDgCurral = tipoReprodutivo === "Diagnóstico de prenhez";
  const isExameAndrologicoCurral = showExameAndrologicoCurral(tipoReprodutivo);
  const isColetaSemenCurral = showColetaSemenCurral(tipoReprodutivo);
  const dgResultadoPrincipal = isDgResultadoCurralPrincipal(resultado);
  const exameResultadoPrincipal = isExameAndrologicoResultadoPrincipal(resultado);
  const showDgResultadoAvancado = showDgResultadoAvancadoCurral(tipoReprodutivo, resultado);
  const showExameAndrologicoAvancado = showExameAndrologicoAvancadoCurral(
    tipoReprodutivo,
    resultado,
  );
  const showCioResultado = showCioResultadoCurral(tipoReprodutivo);
  const resultadoEfetivo = resultadoOcultoComDefault ? "Realizado" : resultado;
  const showResultadoToggle =
    showResultado &&
    !resultadoOcultoComDefault &&
    usesCurralResultadoToggle(tipoReprodutivo);
  const showResultadoSelect =
    showResultado &&
    !resultadoOcultoComDefault &&
    !isDgCurral &&
    !isExameAndrologicoCurral &&
    !usesCurralResultadoToggle(tipoReprodutivo);
  const showDescricaoOutro = showReproDescricaoOutroManejo(tipoReprodutivo);
  const showDescricaoResultadoOutro = showReproDescricaoResultadoOutroManejo(
    tipoReprodutivo,
    resultado,
  );
  const showReprodutorMacho = showReproReprodutorFieldManejo(tipoReprodutivo, animalSexo);
  const modoMultiRegistroCurral = usesCurralReproMultiRegistro(tipoReprodutivo);
  const isDadosCobertura = tipoReprodutivo === "Cobertura";
  const isDadosInseminacao = tipoReprodutivo === "Inseminação";
  const isParto = tipoReprodutivo === "Parto";
  const isPartoComCria =
    isParto && (resultado === "Normal" || resultado === "Com assistência");
  const reprodutorModoInterno =
    isDadosCobertura || (isDadosInseminacao && reprodutorOrigem === "interno");
  const reprodutorModoExterno = isDadosInseminacao && reprodutorOrigem === "externo";
  const machoIdRepro = machoSel ? resolveMachoIdFromSelecao(machoSel) : null;
  const reprodutorSemenDebounced = useDebounce(reprodutorSemen, 300);
  const reprodutorKeyExterno = useMemo(
    () =>
      reprodutorOrigem === "externo"
        ? tryBuildSemenReprodutorKeyExterno(reprodutorSemenDebounced)
        : null,
    [reprodutorOrigem, reprodutorSemenDebounced],
  );

  const showPrevisaoParto =
    shouldShowPrevisaoPartoForm(animalSexo) &&
    shouldCalcPrevisaoParto(tipoReprodutivo, animalSexo);
  const previsaoPartoEstimada = useMemo(() => {
    if (!showPrevisaoParto || !data) return null;
    return calcPrevisaoParto283(data);
  }, [showPrevisaoParto, data]);

  const { data: animaisFazenda = [], isFetching: carregandoAnimais } =
    trpc.animais.list.useQuery(
      { fazendaId: fazendaNum || undefined, status: "ativo", dataManejo: data },
      { enabled: Boolean(fazendaNum) },
    );

  const { data: lotesTodos = [] } = trpc.lotes.list.useQuery(
    { somenteAtivos: true },
    { enabled: Boolean(fazendaNum) && showCoberturaAlvo },
  );

  const matrizesElegiveisPorLote = useMemo(
    () => countMatrizesElegiveisPorLote(animaisFazenda, matrizesRegistradasSet),
    [animaisFazenda, matrizesRegistradasSet],
  );

  const lotesDaFazenda = useMemo(
    () =>
      lotesTodos.filter(l => {
        if (!fazendaNum) return false;
        return l.fazendaId == null || l.fazendaId === fazendaNum;
      }),
    [lotesTodos, fazendaNum],
  );

  const lotesCoberturaElegiveis = useMemo(
    () => lotesDaFazenda.filter(l => (matrizesElegiveisPorLote.get(l.id) ?? 0) > 0),
    [lotesDaFazenda, matrizesElegiveisPorLote],
  );

  const matrizesDoLoteElegiveis = useMemo(() => {
    const loteNum = loteCoberturaId ? Number(loteCoberturaId) : 0;
    if (!loteNum) return [];
    return listMatrizesElegiveisDoLote(animaisFazenda, loteNum, matrizesRegistradasSet);
  }, [animaisFazenda, loteCoberturaId, matrizesRegistradasSet]);

  const { data: reprodutoresExternosCatalogo = [], isFetching: carregandoExternos } =
    trpc.semen.listCatalogoExternos.useQuery(
      { fazendaId: fazendaNum },
      { enabled: isDadosInseminacao && reprodutorOrigem === "externo" && fazendaNum > 0 },
    );

  const partidasSemenQueryEnabled = shouldLoadSemenPartidasParaInseminacao({
    tipoReprodutivo,
    fazendaId: fazendaNum,
    origemReprodutor: reprodutorOrigem,
    machoId: machoIdRepro,
    reprodutorKeyExterno,
  });

  const { data: partidasSemenDisponiveis = [], isFetching: carregandoPartidas } =
    trpc.semen.listDisponiveisParaInseminacao.useQuery(
      {
        fazendaId: fazendaNum,
        origemReprodutor:
          reprodutorOrigem === "interno" ? SEMEN_ORIGEM_INTERNO : SEMEN_ORIGEM_EXTERNO,
        machoId: reprodutorOrigem === "interno" ? machoIdRepro ?? undefined : undefined,
        reprodutorKey: reprodutorOrigem === "externo" ? reprodutorKeyExterno ?? undefined : undefined,
        reprodutorTexto:
          reprodutorOrigem === "externo" ? reprodutorSemenDebounced.trim() : undefined,
      },
      { enabled: partidasSemenQueryEnabled },
    );

  const partidaSemenSelecionada = useMemo(
    () => partidasSemenDisponiveis.find(p => p.id === semenPartidaId) ?? null,
    [partidasSemenDisponiveis, semenPartidaId],
  );

  const temPartidasEstoque =
    partidasSemenQueryEnabled && partidasSemenDisponiveis.length > 0;
  const partidaEstoqueObrigatoria = isDadosInseminacao && temPartidasEstoque;
  const custoAutoPartida =
    partidaSemenSelecionada != null &&
    parseSemenCustoTotal(partidaSemenSelecionada.custoUnitario) != null;
  /** JetBov: custo vem da partida; manual só sem estoque (ou partida sem custo cadastrado). */
  const showCustoManualCurral =
    reprodutorModoExterno &&
    partidasSemenQueryEnabled &&
    !carregandoPartidas &&
    (!temPartidasEstoque ||
      (semenPartidaId != null && !custoAutoPartida));
  const custoExternoCompleto = custoDoseInseminacaoExternaInformado(
    reprodutorModoExterno,
    custoDoseSemen,
  );

  const filterMachoReprodutor = useCallback(
    (a: ManejoAnimalRow) =>
      filterMachosReprodutoresCandidatos([{ ...a, status: "ativo" }], {
        fazendaId: fazendaNum,
        excludeAnimalId: animalId,
      }).length > 0,
    [fazendaNum, animalId],
  );

  const filterMatrizCobertura = useCallback(
    (a: ManejoAnimalRow) =>
      a.sexo === "femea" &&
      isFemeaReprodutivamenteMadura(buildReproAnimalElegibilidadeInput(a)) &&
      !isMatrizJaRegistradaCoberturaCurral(a.id, matrizesRegistradasSet),
    [matrizesRegistradasSet],
  );

  const invalidatePosReproSave = useCallback(() => {
    void trpcUtils.reproducao.list.invalidate();
    void trpcUtils.animais.list.invalidate();
    void trpcUtils.dashboard.stats.invalidate();
    invalidateSemenUtilizadoQueries(trpcUtils);
    void trpcUtils.semen.listCatalogoExternos.invalidate();
  }, [trpcUtils]);

  const handleMutationError = useCallback(
    (msg: string) => {
      if (msg.includes("não pode ser futura") || isMensagemBloqueioBaixa(msg)) {
        onBloqueioNegocio(isMensagemBloqueioBaixa(msg) ? msg : MSG_REPRODUTIVO_DATA_FUTURA);
        return;
      }
      if (
        msg.includes(MSG_REPRO_INELEGIVEL) ||
        msg.includes(MSG_REPRO_RESULTADO_INCOMPATIVEL) ||
        msg.includes(MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO)
      ) {
        onBloqueioNegocio(msg);
        return;
      }
      toast.error(msg);
    },
    [onBloqueioNegocio],
  );

  const finalizarRegistroCurral = useCallback(
    (payload: { tipo: string; resultado?: string; matrizLabel?: string; qtdMatrizes?: number }) => {
      const resumo = formatResumoReproCurral(
        payload.tipo,
        payload.resultado,
        payload.matrizLabel,
      );
      onRegistrado({ animalId, resumo });
      if (usesCurralReproMultiRegistro(payload.tipo)) {
        const batch = matrizCoberturaBatchRef.current;
        const matrizId = matrizCoberturaRegistroRef.current?.id;
        const idsNovos =
          batch && batch.ids.length > 0
            ? batch.ids
            : matrizId != null
              ? [matrizId]
              : [];
        const incremento = idsNovos.length > 0 ? idsNovos.length : 1;
        setQtdRegistradaAnimal(prev => prev + incremento);
        if (idsNovos.length > 0) {
          setMatrizesRegistradasIds(prev => [...new Set([...prev, ...idsNovos])]);
        }
        matrizCoberturaRegistroRef.current = null;
        matrizCoberturaBatchRef.current = null;
        limparEntradaCobertura();
        if (payload.tipo === "Estação de monta" || batch) {
          toast.success(`${resumo} · registre outro lote ou conclua o touro.`);
        } else {
          toast.success(`${resumo} · registre outra matriz ou conclua o touro.`);
        }
        return;
      }
      onConcluir();
    },
    [animalId, limparEntradaCobertura, onConcluir, onRegistrado],
  );

  const saveMutation = trpc.reproducao.create.useMutation({
    onSuccess: async (_data, variables) => {
      invalidatePosReproSave();
      if (variables.semenPartidaId != null && variables.semenPartidaId > 0) {
        await invalidateSemenQueriesAfterConsumo(trpcUtils, {
          partidaId: variables.semenPartidaId,
        });
      }
      finalizarRegistroCurral({
        tipo: variables.tipo,
        resultado: variables.resultado ?? undefined,
        matrizLabel:
          matrizCoberturaBatchRef.current?.resumo ??
          (variables.tipo === "Cobertura realizada" && matrizCoberturaRegistroRef.current
            ? matrizCoberturaRegistroRef.current.brinco ??
              String(matrizCoberturaRegistroRef.current.id)
            : undefined),
        qtdMatrizes: matrizCoberturaBatchRef.current?.ids.length,
      });
    },
    onError: err => handleMutationError(err.message || "Não foi possível salvar o registro reprodutivo."),
  });

  const savePartoMutation = trpc.reproducao.registrarPartoComCrias.useMutation({
    onSuccess: () => {
      invalidatePosReproSave();
      finalizarRegistroCurral({ tipo: tipoReprodutivo, resultado });
    },
    onError: err => handleMutationError(err.message || "Não foi possível registrar o parto."),
  });

  const onChangeTipo = (next: string) => {
    setTipoReprodutivo(next);
    setResultado(
      next === "Inseminação" || next === "Cobertura" ? "Realizado" : "",
    );
    setDescricaoOutro("");
    setDescricaoResultadoOutro("");
    setMachoSel(null);
    setMatrizSel(null);
    setCoberturaSelecaoModo(isEstacaoMontaMacho(next) ? "lote" : "");
    setLoteCoberturaId("");
    setMatrizesLoteSelecionadas([]);
    setReprodutorSemen("");
    setSemenPartidaId(null);
    setPartidaSemen("");
    setCentralOrigemSemen("");
    setCustoDoseSemen("");
    setCriaBrinco("");
    setCriaSexo("");
    setMaisDetalhesAberto(false);
    if (next === "Cobertura") setReprodutorOrigem("interno");
    else setReprodutorOrigem("");
  };

  const onChangeCoberturaSelecaoModo = (modo: "" | "individual" | "lote") => {
    setCoberturaSelecaoModo(modo);
    setMatrizSel(null);
    setLoteCoberturaId("");
    setMatrizesLoteSelecionadas([]);
  };

  const onChangeLoteCobertura = (loteId: string) => {
    setLoteCoberturaId(loteId);
    setMatrizesLoteSelecionadas([]);
  };

  const toggleMatrizLote = (matrizId: number) => {
    setMatrizesLoteSelecionadas(prev =>
      prev.includes(matrizId) ? prev.filter(id => id !== matrizId) : [...prev, matrizId],
    );
  };

  const toggleSelecionarTodasMatrizesLote = () => {
    if (matrizesLoteSelecionadas.length === matrizesDoLoteElegiveis.length) {
      setMatrizesLoteSelecionadas([]);
      return;
    }
    setMatrizesLoteSelecionadas(matrizesDoLoteElegiveis.map(a => a.id));
  };

  const registrar = useCallback(() => {
    if (!fazendaNum) {
      toast.error("Aguardando contexto da sessão.");
      return;
    }
    if (!data) {
      toast.error("Informe a data da sessão.");
      return;
    }
    if (data > new Date().toISOString().slice(0, 10)) {
      onBloqueioNegocio(MSG_REPRODUTIVO_DATA_FUTURA);
      return;
    }
    if (!tipoReprodutivo) {
      toast.error("Selecione o tipo de manejo reprodutivo.");
      return;
    }
    if (!isReproTipoPermitidoParaAnimal(reproElegibilidade, tipoReprodutivo)) {
      onBloqueioNegocio(MSG_REPRO_INELEGIVEL);
      return;
    }
    if (exigeResultado && !resultadoEfetivo.trim()) {
      toast.error("Informe o resultado do manejo reprodutivo.");
      return;
    }
    if (showDescricaoOutro && !descricaoOutro.trim()) {
      toast.error("Descreva o manejo reprodutivo.");
      return;
    }
    if (showDescricaoResultadoOutro && !descricaoResultadoOutro.trim()) {
      toast.error("Descreva o resultado do manejo reprodutivo.");
      return;
    }

    const validacaoResultado = validateReproResultadoForSave({
      sexo: animalSexo,
      tipo: tipoReprodutivo,
      resultado:
        showResultadoToggle ||
        showResultadoSelect ||
        isDgCurral ||
        isExameAndrologicoCurral ||
        showCioResultado ||
        resultadoOcultoComDefault
          ? resultadoEfetivo
          : undefined,
      descricaoResultadoOutro: showDescricaoResultadoOutro ? descricaoResultadoOutro : undefined,
    });
    if (!validacaoResultado.ok) {
      onBloqueioNegocio(validacaoResultado.message);
      return;
    }

    if (showReprodutorFemea && reprodutorModoInterno && !machoSel) {
      toast.error("Selecione o reprodutor da lista.");
      return;
    }
    if (showReprodutorFemea && isDadosInseminacao && !reprodutorOrigem) {
      toast.error("Selecione a origem do reprodutor.");
      return;
    }
    if (showReprodutorFemea && reprodutorModoExterno && !reprodutorSemen.trim()) {
      toast.error("Informe o reprodutor ou sêmen externo.");
      return;
    }
    if (isDadosInseminacao && temPartidasEstoque && semenPartidaId == null) {
      toast.error("Selecione a partida do estoque.");
      return;
    }
    if (reprodutorModoExterno) {
      const validacaoCusto = validateReproCustoDoseInseminacaoExterna(
        parseSemenCustoTotal(custoDoseSemen),
      );
      if (!validacaoCusto.ok) {
        toast.error(validacaoCusto.message);
        return;
      }
    }

    let eccPersistido: number | undefined;
    if (isDadosInseminacao && eccMatriz.trim()) {
      const validacaoEcc = validateReproEcc(eccMatriz);
      if (!validacaoEcc.ok) {
        toast.error(validacaoEcc.message);
        return;
      }
      eccPersistido = validacaoEcc.value;
    }

    if (showCoberturaAlvo) {
      const modoEfetivo = estacaoMontaCurral ? "lote" : coberturaSelecaoModo;
      if (!modoEfetivo) {
        toast.error(MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO);
        return;
      }
      if (modoEfetivo === "individual") {
        if (!matrizSel) {
          toast.error("Selecione a matriz atendida na cobertura.");
          return;
        }
        if (isMatrizJaRegistradaCoberturaCurral(matrizSel.id, matrizesRegistradasSet)) {
          toast.error(
            formatMsgMatrizJaCobertaNesteTouro(matrizSel.brinco ?? String(matrizSel.id)),
          );
          return;
        }
      }
      if (modoEfetivo === "lote") {
        if (!loteCoberturaId) {
          toast.error("Selecione o lote atendido.");
          return;
        }
        if (matrizesLoteSelecionadas.length === 0) {
          toast.error(MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS);
          return;
        }
      }
    }

    if (isParto) {
      if (isPartoComCria) {
        if (!criaBrinco.trim()) {
          toast.error("Informe o brinco da cria.");
          return;
        }
        if (!criaSexo) {
          toast.error("Selecione o sexo da cria.");
          return;
        }
      }

      savePartoMutation.mutate({
        femeaId: animalId,
        fazendaId: fazendaNum,
        dataParto: data,
        resultado: resultadoEfetivo as "Normal" | "Com assistência" | "Natimorto" | "Outro",
        descricaoResultadoOutro: showDescricaoResultadoOutro
          ? descricaoResultadoOutro.trim()
          : undefined,
        observacoes: observacoes.trim() || undefined,
        crias: isPartoComCria
          ? [
              {
                brinco: criaBrinco.trim(),
                sexo: criaSexo as "macho" | "femea",
                categoria: criaSexo === "macho" ? "Bezerro" : "Bezerra",
              },
            ]
          : undefined,
      });
      return;
    }

    const reprodutorPayload = (() => {
      if (showDescricaoOutro) {
        return { reprodutorSemen: descricaoOutro.trim() || undefined };
      }
      if (showReprodutorFemea) {
        return buildReproReprodutorPayload({
          tipo: tipoReprodutivo,
          animalSexo: animalSexo ?? undefined,
          machoId: resolveMachoIdFromSelecao(machoSel),
          machoLabel: machoSel?.brinco ?? undefined,
          textoExterno: reprodutorSemen,
          origem: isDadosCobertura ? "interno" : reprodutorOrigem,
        });
      }
      if (showReprodutorMacho && reprodutorSemen.trim()) {
        return { reprodutorSemen: reprodutorSemen.trim() };
      }
      return {};
    })();

    const modoAlvoSalvar = estacaoMontaCurral ? "lote" : coberturaSelecaoModo;
    const matrizIdsSalvar =
      showCoberturaAlvo && modoAlvoSalvar === "individual" && matrizSel
        ? [matrizSel.id]
        : showCoberturaAlvo && modoAlvoSalvar === "lote"
          ? matrizesLoteSelecionadas
          : undefined;

    if (showCoberturaAlvo && modoAlvoSalvar === "individual") {
      matrizCoberturaRegistroRef.current = matrizSel;
      matrizCoberturaBatchRef.current = null;
    } else if (showCoberturaAlvo && modoAlvoSalvar === "lote") {
      matrizCoberturaRegistroRef.current = null;
      const loteNome =
        lotesCoberturaElegiveis.find(l => String(l.id) === loteCoberturaId)?.nome ??
        `Lote #${loteCoberturaId}`;
      matrizCoberturaBatchRef.current = {
        ids: matrizesLoteSelecionadas,
        resumo: `${loteNome} · ${matrizesLoteSelecionadas.length} matriz(es)`,
      };
    }

    saveMutation.mutate({
      animalId,
      fazendaId: fazendaNum || undefined,
      tipo: tipoReprodutivo,
      dataCobertura: data,
      resultado:
        (showResultadoToggle ||
          showResultadoSelect ||
          isDgCurral ||
          isExameAndrologicoCurral ||
          showCioResultado ||
          resultadoOcultoComDefault) &&
        resultadoEfetivo.trim()
          ? resultadoEfetivo.trim()
          : undefined,
      ...reprodutorPayload,
      coberturaSelecaoModo: showCoberturaAlvo && modoAlvoSalvar ? modoAlvoSalvar : undefined,
      coberturaMatrizIds: matrizIdsSalvar,
      coberturaLoteId:
        showCoberturaAlvo && modoAlvoSalvar === "lote" && loteCoberturaId
          ? Number(loteCoberturaId)
          : undefined,
      descricaoResultadoOutro: showDescricaoResultadoOutro
        ? descricaoResultadoOutro.trim()
        : undefined,
      observacoes: observacoes.trim() || undefined,
      partidaSemen: isDadosInseminacao
        ? partidaSemenSelecionada?.partida ?? (partidaSemen.trim() || undefined)
        : undefined,
      semenPartidaId: isDadosInseminacao && semenPartidaId != null ? semenPartidaId : undefined,
      custoDoseSemen: isDadosInseminacao
        ? parseSemenCustoTotal(custoDoseSemen) ?? undefined
        : undefined,
      centralOrigem: isDadosInseminacao ? centralOrigemSemen.trim() || undefined : undefined,
      inseminador: isDadosInseminacao ? inseminador.trim() || undefined : undefined,
      ecc: eccPersistido,
      dataPrevistoParto:
        showPrevisaoParto && previsaoPartoEstimada ? previsaoPartoEstimada : undefined,
    });
  }, [
    animalId,
    animalSexo,
    criaBrinco,
    criaSexo,
    custoDoseSemen,
    data,
    descricaoOutro,
    descricaoResultadoOutro,
    eccMatriz,
    exigeResultado,
    fazendaNum,
    inseminador,
    isDadosCobertura,
    isDadosInseminacao,
    isParto,
    isPartoComCria,
    machoSel,
    coberturaSelecaoModo,
    estacaoMontaCurral,
    loteCoberturaId,
    lotesCoberturaElegiveis,
    matrizSel,
    matrizesLoteSelecionadas,
    matrizesRegistradasSet,
    observacoes,
    onBloqueioNegocio,
    partidaSemen,
    partidaSemenSelecionada,
    previsaoPartoEstimada,
    reproElegibilidade,
    reprodutorModoExterno,
    reprodutorModoInterno,
    reprodutorOrigem,
    reprodutorSemen,
    isDgCurral,
    resultadoEfetivo,
    resultadoOcultoComDefault,
    saveMutation,
    savePartoMutation,
    semenPartidaId,
    temPartidasEstoque,
    showCoberturaAlvo,
    showDescricaoOutro,
    showDescricaoResultadoOutro,
    showPrevisaoParto,
    showReprodutorFemea,
    showReprodutorMacho,
    showCioResultado,
    showResultadoSelect,
    showResultadoToggle,
    centralOrigemSemen,
    tipoReprodutivo,
  ]);

  const handleResultadoToggle = useCallback((next: string) => {
    setResultado(next);
    if (next !== "Outro") setDescricaoResultadoOutro("");
    if (next !== "Normal" && next !== "Com assistência") {
      setCriaBrinco("");
      setCriaSexo("");
    }
  }, []);

  const isSaving = saveMutation.isPending || savePartoMutation.isPending;

  const alvoLotePreenchido =
    Boolean(loteCoberturaId) || matrizesLoteSelecionadas.length > 0;
  const formularioPreenchido = modoMultiRegistroCurral
    ? Boolean(matrizSel || alvoLotePreenchido || observacoes.trim())
    : Boolean(
        tipoReprodutivo ||
          resultado.trim() ||
          descricaoOutro.trim() ||
          descricaoResultadoOutro.trim() ||
          machoSel ||
          matrizSel ||
          reprodutorSemen.trim() ||
          reprodutorOrigem ||
          inseminador.trim() ||
          eccMatriz.trim() ||
          criaBrinco.trim() ||
          criaSexo ||
          observacoes.trim(),
      );

  const labelConcluirAnimal =
    animalSexo === "macho" ? "Concluir touro" : "Concluir animal";

  const rodapeReproCurral =
    estacaoMontaCurral || (modoMultiRegistroCurral && coberturaSelecaoModo === "lote")
      ? "Alocar touro ao lote registra exposição à monta nas matrizes. Conclua o touro ao terminar."
      : modoMultiRegistroCurral || qtdRegistradaAnimal > 0
        ? "Registre cada matriz coberta. Ao terminar, conclua o touro — ou conclua sem registrar se não houve cobertura nesta passagem."
        : "Registre o manejo reprodutivo. Ao terminar, conclua o animal — ou conclua sem registrar se não houve manejo nesta passagem.";

  const concluirAnimal = useCallback(() => {
    if (isSaving) return;
    if (formularioPreenchido) {
      toast.error(
        modoMultiRegistroCurral
          ? "Há dados não registrados. Registre a cobertura ou limpe o formulário."
          : "Há dados não registrados. Registre o manejo ou limpe o formulário.",
      );
      return;
    }
    onConcluir();
  }, [formularioPreenchido, isSaving, modoMultiRegistroCurral, onConcluir]);

  const podeSalvar =
    Boolean(tipoReprodutivo) &&
    (!exigeResultado || Boolean(resultadoEfetivo.trim())) &&
    (!showDescricaoOutro || Boolean(descricaoOutro.trim())) &&
    (!showDescricaoResultadoOutro || Boolean(descricaoResultadoOutro.trim())) &&
    (!showReprodutorFemea || !reprodutorModoInterno || Boolean(machoSel)) &&
    (!showReprodutorFemea || !reprodutorModoExterno || Boolean(reprodutorSemen.trim())) &&
    (!showReprodutorFemea ||
      !isDadosInseminacao ||
      Boolean(reprodutorOrigem)) &&
    (!partidaEstoqueObrigatoria || semenPartidaId != null) &&
    custoExternoCompleto &&
    (!showCoberturaAlvo ||
      (estacaoMontaCurral
        ? Boolean(loteCoberturaId) && matrizesLoteSelecionadas.length > 0
        : coberturaSelecaoModo === "lote"
          ? Boolean(loteCoberturaId) && matrizesLoteSelecionadas.length > 0
          : coberturaSelecaoModo === "individual"
            ? Boolean(matrizSel)
            : false)) &&
    (!isPartoComCria || (Boolean(criaBrinco.trim()) && Boolean(criaSexo)));

  return (
    <div className="mt-4 space-y-4">
      {qtdRegistradaAnimal > 0 ? (
        <p className="text-[11px] font-medium text-teal-700">
          {qtdRegistradaAnimal}{" "}
          {qtdRegistradaAnimal === 1
            ? "cobertura registrada"
            : "coberturas registradas"}{" "}
          neste touro.
        </p>
      ) : null}
      <div className="space-y-4">
        <div>
          <FormLabel required>Tipo de manejo reprodutivo</FormLabel>
          <FormSelect
            variant="light"
            value={tipoReprodutivo}
            onChange={onChangeTipo}
            placeholder="Selecione o tipo"
            required
          >
            {reproTipoOptions.map(t => (
              <SelectItem key={t} value={t} className="text-[12px]">
                {t}
              </SelectItem>
            ))}
          </FormSelect>
          {reproTipoOptions.length === 0 ? (
            <p className="text-[11px] text-amber-600 mt-1 leading-relaxed">
              Este animal não possui manejos reprodutivos compatíveis com a idade ou categoria.
            </p>
          ) : null}
          {categoriaIdadeMismatch && reproTipoOptions.length > 0 ? (
            <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
              Categoria pode estar desatualizada para a idade do animal.
            </p>
          ) : null}
        </div>

        {showPrevisaoParto && previsaoPartoEstimada ? (
          <p className="text-[11px] text-gray-500">
            Previsão de parto:{" "}
            <span className="font-semibold text-gray-700">
              {formatDateBR(previsaoPartoEstimada)}
            </span>
          </p>
        ) : null}

        {showReprodutorFemea ? (
          <div className="space-y-3">
            {isDadosInseminacao ? (
              <div>
                <FormLabel>Origem do reprodutor</FormLabel>
                <FormSelect
                  variant="light"
                  value={reprodutorOrigem}
                  onChange={v => {
                    setReprodutorOrigem(v as "" | "interno" | "externo");
                    setMachoSel(null);
                    setReprodutorSemen("");
                    setSemenPartidaId(null);
                    setPartidaSemen("");
                    setCentralOrigemSemen("");
                    setCustoDoseSemen("");
                  }}
                  placeholder="Selecione a origem"
                >
                  <SelectItem value="interno" className="text-[12px]">
                    Animal do rebanho
                  </SelectItem>
                  <SelectItem value="externo" className="text-[12px]">
                    Sêmen / reprodutor externo
                  </SelectItem>
                </FormSelect>
              </div>
            ) : null}

            {reprodutorModoInterno ? (
              <AnimalAutocomplete
                label={isDadosCobertura ? "Reprodutor / Touro" : "Macho do rebanho"}
                required
                selected={machoSel}
                onSelect={a => {
                  setMachoSel(a);
                  setSemenPartidaId(null);
                  setPartidaSemen("");
                }}
                animals={animaisFazenda as ManejoAnimalRow[]}
                loading={carregandoAnimais}
                disabled={!fazendaNum}
                inputClassName={fieldCls}
                placeholder="Busque pelo brinco ou nome do touro"
                emptyMessage="Nenhum reprodutor elegível encontrado."
                filterCandidate={filterMachoReprodutor}
                getOptionSubtitle={subtituloMachoReprodutor}
              />
            ) : null}

            {reprodutorModoExterno ? (
              <SemenReprodutorExternoField
                value={reprodutorSemen}
                onChange={texto => {
                  setReprodutorSemen(texto);
                  setSemenPartidaId(null);
                  setPartidaSemen("");
                  setCentralOrigemSemen("");
                  setCustoDoseSemen("");
                }}
                onSelect={item => {
                  setReprodutorSemen(item.reprodutorTexto);
                  setCentralOrigemSemen(item.centralPadrao ?? "");
                  setCustoDoseSemen("");
                }}
                showCadastrarNovo={false}
                options={reprodutoresExternosCatalogo}
                disabled={!fazendaNum}
                loading={carregandoExternos}
                inputClassName={fieldCls}
                labelClassName="text-[12px] font-medium text-gray-700 mb-1 block"
              />
            ) : null}

            {isDadosInseminacao && reprodutorOrigem ? (
              <div className="space-y-3">
                {partidasSemenQueryEnabled && (carregandoPartidas || temPartidasEstoque) ? (
                  <div>
                    <FormLabel required={partidaEstoqueObrigatoria}>Partida</FormLabel>
                    {carregandoPartidas ? (
                      <p className="text-[11px] text-gray-500">Consultando estoque…</p>
                    ) : (
                      <FormSelect
                        variant="light"
                        value={semenPartidaId != null ? String(semenPartidaId) : ""}
                        onChange={v => {
                          const id = v ? Number(v) : null;
                          setSemenPartidaId(id);
                          const sel = partidasSemenDisponiveis.find(p => p.id === id);
                          setPartidaSemen(sel?.partida ?? "");
                          setCentralOrigemSemen(sel?.centralOrigem ?? "");
                          setCustoDoseSemen(
                            sel && parseSemenCustoTotal(sel.custoUnitario) != null
                              ? formatSemenCustoTotalDisplay(sel.custoUnitario)
                              : "",
                          );
                        }}
                        placeholder="Selecione a partida do estoque"
                      >
                        {partidasSemenDisponiveis.map(p => (
                          <SelectItem key={p.id} value={String(p.id)} className="text-[12px]">
                            {formatSemenPartidaInseminacaoOptionLabel({
                              partida: p.partida,
                              saldoDoses: p.saldoDoses,
                              custoUnitario: p.custoUnitario,
                              centralOrigem: p.centralOrigem,
                            })}
                          </SelectItem>
                        ))}
                      </FormSelect>
                    )}
                    {custoAutoPartida && partidaSemenSelecionada ? (
                      <p className="text-[11px] text-gray-500 mt-1">
                        Custo da dose:{" "}
                        <span className="font-medium text-gray-700">
                          {formatSemenCustoTotalDisplay(partidaSemenSelecionada.custoUnitario)}
                        </span>{" "}
                        · estoque
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {showCustoManualCurral ? (
                  <div>
                    <FormLabel required>Custo da dose (R$)</FormLabel>
                    <FormInput
                      inputMode="decimal"
                      value={custoDoseSemen}
                      onChange={v => {
                        const digits = v.replace(/\D/g, "");
                        setCustoDoseSemen(digits ? formatCurrencyBrl(v) : "");
                      }}
                      placeholder="R$ 0,00"
                      variant="light"
                    />
                    {!temPartidasEstoque ? (
                      <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                        Sem partida no estoque. Cadastre em Reprodução → Controle de sêmen →
                        Estoque, ou informe o custo aqui.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {showCoberturaAlvo ? (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-gray-700">
              {estacaoMontaCurral ? "Lote em estação de monta" : "Matrizes atendidas"}
            </p>
            {coberturaPermiteIndividual ? (
              <div>
                <FormLabel required>Forma de seleção</FormLabel>
                <FormSelect
                  variant="light"
                  value={coberturaSelecaoModo}
                  onChange={v => onChangeCoberturaSelecaoModo(v as "" | "individual" | "lote")}
                  placeholder="Selecione a forma de seleção"
                  required
                >
                  <SelectItem value="individual" className="text-[12px]">
                    Matriz individual
                  </SelectItem>
                  <SelectItem value="lote" className="text-[12px]">
                    Por lote
                  </SelectItem>
                </FormSelect>
              </div>
            ) : null}

            {coberturaPermiteIndividual && coberturaSelecaoModo === "individual" ? (
              <AnimalAutocomplete
                key={`cobertura-matriz-${qtdRegistradaAnimal}`}
                label="Matriz atendida"
                required
                selected={matrizSel}
                onSelect={setMatrizSel}
                animals={animaisFazenda as ManejoAnimalRow[]}
                loading={carregandoAnimais}
                disabled={!fazendaNum}
                inputClassName={fieldCls}
                placeholder="Busque a matriz coberta"
                emptyMessage="Nenhuma matriz elegível encontrada."
                hintMessage={
                  matrizesRegistradasIds.length > 0
                    ? "Matrizes já cobertas neste touro não aparecem na busca."
                    : undefined
                }
                filterCandidate={filterMatrizCobertura}
              />
            ) : null}

            {(estacaoMontaCurral || coberturaSelecaoModo === "lote") ? (
              <div className="space-y-3">
                <div>
                  <FormLabel required>Lote</FormLabel>
                  <FormSelect
                    variant="light"
                    value={loteCoberturaId}
                    onChange={onChangeLoteCobertura}
                    placeholder="Selecione um lote"
                    required
                  >
                    {lotesCoberturaElegiveis.map(l => (
                      <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">
                        {`${l.nome} · ${matrizesElegiveisPorLote.get(l.id) ?? 0} matriz(es) elegível(eis)`}
                      </SelectItem>
                    ))}
                  </FormSelect>
                  {lotesCoberturaElegiveis.length === 0 ? (
                    <p className="text-[10px] text-amber-600 mt-1">
                      Nenhum lote com matrizes elegíveis nesta fazenda.
                    </p>
                  ) : null}
                </div>

                {loteCoberturaId ? (
                  <div className="space-y-2">
                    <FormLabel required>Matrizes elegíveis</FormLabel>
                    {matrizesDoLoteElegiveis.length === 0 ? (
                      <p className="text-[10px] text-amber-600">
                        Nenhuma matriz elegível neste lote.
                      </p>
                    ) : (
                      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                        <label className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={
                              matrizesLoteSelecionadas.length > 0 &&
                              matrizesLoteSelecionadas.length === matrizesDoLoteElegiveis.length
                            }
                            onChange={toggleSelecionarTodasMatrizesLote}
                            className={formCheckboxCls}
                          />
                          <span className="text-[12px] font-semibold text-gray-700">
                            Selecionar todas ({matrizesDoLoteElegiveis.length})
                          </span>
                        </label>
                        {matrizesDoLoteElegiveis.map(a => (
                          <label
                            key={a.id}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                              matrizesLoteSelecionadas.includes(a.id)
                                ? "bg-[#4ECDC4]/10"
                                : "hover:bg-[#4ECDC4]/[0.05]",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={matrizesLoteSelecionadas.includes(a.id)}
                              onChange={() => toggleMatrizLote(a.id)}
                              className={formCheckboxCls}
                            />
                            <span className="text-[12px] font-medium text-gray-800">
                              {labelAnimalCobertura(a)}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {estacaoMontaCurral ? (
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    Cria exposição à monta na ficha de cada matriz selecionada, vinculada a este
                    touro.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {isDgCurral ? (
          <div className="space-y-3">
            <div>
              <FormLabel required>Resultado do DG</FormLabel>
              <CurralResultadoToggleGroup
                options={DG_RESULTADOS_CURRAL}
                value={dgResultadoPrincipal ? resultado : ""}
                onChange={next => {
                  handleResultadoToggle(next);
                }}
              />
              {dgResultadoPrincipal ? (
                <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                  Clique de novo em {resultado} para limpar e escolher Inconclusivo, Repetir ou
                  Outro abaixo.
                </p>
              ) : null}
            </div>

            {showDgResultadoAvancado ? (
              <div>
                <FormLabel required>Resultado avançado</FormLabel>
                <CurralResultadoToggleGroup
                  options={getCurralResultadoToggleOptions("Diagnóstico de prenhez")}
                  value={isDgResultadoCurralAvancado(resultado) ? resultado : ""}
                  onChange={handleResultadoToggle}
                />
                <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                  Use quando não houver Prenha ou Vazia. Toque de novo para limpar.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {showCioResultado ? (
          <div>
            <FormLabel>Resultado (opcional)</FormLabel>
            <CurralResultadoToggleGroup
              options={getCurralResultadoToggleOptions("Cio")}
              value={resultado}
              onChange={handleResultadoToggle}
            />
            <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
              Atalho rápido. Pode registrar só o cio e detalhar depois em observações.
            </p>
          </div>
        ) : null}

        {isExameAndrologicoCurral ? (
          <div className="space-y-3">
            <div>
              <FormLabel required>Resultado do exame</FormLabel>
              <CurralResultadoToggleGroup
                options={EXAME_ANDROLOGICO_RESULTADOS_CURRAL}
                value={exameResultadoPrincipal ? resultado : ""}
                onChange={handleResultadoToggle}
              />
              {exameResultadoPrincipal ? (
                <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                  Clique de novo em {resultado} para limpar e escolher Inconclusivo, Repetir ou
                  Outro abaixo.
                </p>
              ) : null}
            </div>

            {showExameAndrologicoAvancado ? (
              <div>
                <FormLabel required>Resultado avançado</FormLabel>
                <CurralResultadoToggleGroup
                  options={getCurralResultadoToggleOptions("Exame andrológico")}
                  value={isExameAndrologicoResultadoAvancado(resultado) ? resultado : ""}
                  onChange={handleResultadoToggle}
                />
                <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                  Use quando não houver Apto ou Inapto. Toque de novo para limpar.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {isColetaSemenCurral ? (
          <div>
            <FormLabel required>Resultado da coleta</FormLabel>
            <CurralResultadoToggleGroup
              options={getCurralResultadoToggleOptions("Coleta de sêmen")}
              value={resultado}
              onChange={handleResultadoToggle}
            />
          </div>
        ) : null}

        {showResultadoToggle ? (
          <div>
            <FormLabel required={exigeResultado}>Resultado</FormLabel>
            <CurralResultadoToggleGroup
              options={getCurralResultadoToggleOptions(tipoReprodutivo)}
              value={resultado}
              onChange={handleResultadoToggle}
            />
          </div>
        ) : null}

        {showResultadoSelect ? (
          <div>
            <FormLabel required={exigeResultado}>Resultado</FormLabel>
            <FormSelect
              variant="light"
              value={resultado}
              onChange={v => {
                setResultado(v);
                if (v !== "Outro") setDescricaoResultadoOutro("");
                if (v !== "Normal" && v !== "Com assistência") {
                  setCriaBrinco("");
                  setCriaSexo("");
                }
              }}
              placeholder="Selecione o resultado"
            >
              {reproResultadoOptions.map(r => (
                <SelectItem key={r} value={r} className="text-[12px]">
                  {r}
                </SelectItem>
              ))}
            </FormSelect>
          </div>
        ) : null}

        {isPartoComCria ? (
          <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Cria do parto
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel required>Brinco da cria</FormLabel>
                <FormInput
                  value={criaBrinco}
                  onChange={setCriaBrinco}
                  placeholder="Ex.: 101"
                  variant="light"
                />
              </div>
              <div>
                <FormLabel required>Sexo</FormLabel>
                <FormSelect
                  variant="light"
                  value={criaSexo}
                  onChange={v => setCriaSexo(v as "" | "macho" | "femea")}
                  placeholder="Selecione"
                >
                  <SelectItem value="macho" className="text-[12px]">
                    Macho
                  </SelectItem>
                  <SelectItem value="femea" className="text-[12px]">
                    Fêmea
                  </SelectItem>
                </FormSelect>
              </div>
            </div>
          </div>
        ) : null}

        {showDescricaoOutro ? (
          <div>
            <FormLabel required>Descrição</FormLabel>
            <FormTextarea
              value={descricaoOutro}
              onChange={setDescricaoOutro}
              placeholder="Descreva o manejo reprodutivo realizado…"
              variant="light"
              rows={2}
            />
          </div>
        ) : null}

        {showDescricaoResultadoOutro ? (
          <div>
            <FormLabel required>Descrição do resultado</FormLabel>
            <FormTextarea
              value={descricaoResultadoOutro}
              onChange={setDescricaoResultadoOutro}
              placeholder="Descreva o resultado…"
              variant="light"
              rows={2}
            />
          </div>
        ) : null}

        {tipoReprodutivo ? (
          <Collapsible open={maisDetalhesAberto} onOpenChange={setMaisDetalhesAberto}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left hover:bg-gray-50"
              >
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-gray-600">
                    Mais detalhes (opcional)
                  </span>
                  <span className="block text-[10px] text-gray-400 truncate mt-0.5">
                    {maisDetalhesResumoCurral(tipoReprodutivo)}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-gray-400 transition-transform",
                    maisDetalhesAberto && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3 rounded-xl border border-gray-100 bg-gray-50/40 p-3">
              {isDadosInseminacao ? (
                <>
                  <div>
                    <FormLabel>Inseminador</FormLabel>
                    <FormInput
                      value={inseminador}
                      onChange={setInseminador}
                      placeholder="Ex.: João Silva"
                      variant="light"
                    />
                  </div>
                  <div>
                    <FormLabel>ECC da matriz</FormLabel>
                    <FormInput
                      value={eccMatriz}
                      onChange={v => setEccMatriz(sanitizeReproEccInputString(v))}
                      placeholder="1 a 5"
                      variant="light"
                    />
                  </div>
                </>
              ) : null}

              <div>
                <FormLabel>Observações</FormLabel>
                <FormTextarea
                  value={observacoes}
                  onChange={setObservacoes}
                  placeholder="Observações adicionais…"
                  variant="light"
                  rows={2}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={registrar}
          disabled={!podeSalvar || isSaving}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full text-gray-900 text-[13px] font-bold uppercase tracking-wide min-h-[52px] hover:opacity-95 disabled:opacity-40"
          style={{ backgroundColor: FD_PRIMARY }}
        >
          <HeartPulse className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
          {isSaving
            ? "Salvando…"
            : modoMultiRegistroCurral
              ? "Registrar cobertura"
              : "Registrar reprodutivo"}
        </button>

        <button
          type="button"
          onClick={concluirAnimal}
          disabled={isSaving || formularioPreenchido}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-gray-300 bg-white text-gray-800 text-[13px] font-bold uppercase tracking-wide min-h-[48px] hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {hasNextManejoNaFila ? "Concluir e próximo manejo" : labelConcluirAnimal}
        </button>
      </div>

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        {rodapeReproCurral}
      </p>
    </div>
  );
}
