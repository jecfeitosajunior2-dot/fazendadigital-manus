import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import { getSaldoLitros, getValorLitroEstoque } from "@/lib/combustivel-estoque";
import { formatDateBR, parseLocalDate } from "@/lib/date-utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormTextarea,
  FormDatePicker,
} from "@/components/FormFields";

const COMBUSTIVEIS = [
  { value: "diesel", label: "Diesel" },
  { value: "gasolina", label: "Gasolina" },
  { value: "etanol", label: "Etanol" },
  { value: "arla", label: "Arla" },
] as const;

type Combustivel = (typeof COMBUSTIVEIS)[number]["value"];
type OrigemCombustivel = "estoque" | "externo";
type MedidorTipo = "horimetro" | "quilometragem";

type FormState = {
  data: string;
  maquinaId: string;
  combustivel: Combustivel | "";
  litros: string;
  horimetro: string;
  origem: OrigemCombustivel;
  fazendaId: string;
  valorLitro: string;
  responsavel: string;
  observacoes: string;
};

const emptyForm = (): FormState => ({
  data: new Date().toISOString().slice(0, 10),
  maquinaId: "",
  combustivel: "",
  litros: "",
  horimetro: "",
  origem: "estoque",
  fazendaId: "",
  valorLitro: "",
  responsavel: "",
  observacoes: "",
});

function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function getSearchParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** Medidor da máquina: usa tipoMedidor cadastrado; fallback por Tipo (legado). */
function inferMedidorPorTipo(tipo: string | null | undefined): MedidorTipo | null {
  if (!tipo?.trim()) return null;
  const t = tipo.trim();
  const veiculos = new Set(["Veículos", "Caminhão", "Carreta", "Carro", "Moto"]);
  const horas = new Set([
    "Máquinas",
    "Equipamentos com Motor",
    "Trator",
    "Colheitadeira",
    "Plantadeira",
    "Pulverizador",
  ]);
  if (veiculos.has(t)) return "quilometragem";
  if (horas.has(t)) return "horimetro";
  return null;
}

function getMedidorTipo(maquina?: {
  tipo?: string | null;
  tipoMedidor?: string | null;
} | null): MedidorTipo | null {
  const tm = maquina?.tipoMedidor?.trim();
  if (tm === "horimetro") return "horimetro";
  if (tm === "quilometragem") return "quilometragem";
  if (tm === "sem_medidor") return null;
  return inferMedidorPorTipo(maquina?.tipo);
}

function formatLeitura(valor: number, medidor: MedidorTipo | null): string {
  const num = valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (medidor === "quilometragem") return `${num} km`;
  if (medidor === "horimetro") return `${num} h`;
  return num;
}

function formatLitros(valor: number): string {
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} L`;
}

type CampoObrigatorioAbastecimento =
  | "data"
  | "maquinaId"
  | "combustivel"
  | "litros"
  | "horimetro"
  | "fazendaId"
  | "valorLitro";

const TOAST_ID_OBRIGATORIOS = "abastecimento-obrigatorios";

function FieldErrorMsg({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[11px] text-red-600" role="alert">
      {message}
    </p>
  );
}

export default function AbastecimentoFormPage() {
  const [, setLocation] = useLocation();
  const editId = Number(getSearchParam("id") || 0);
  const isEdit = editId > 0;
  const initializedForId = useRef<number | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [erros, setErros] = useState<Partial<Record<CampoObrigatorioAbastecimento, string>>>({});

  const limparErro = (campo: CampoObrigatorioAbastecimento) => {
    setErros(prev => {
      if (!prev[campo]) return prev;
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    if (key === "data") limparErro("data");
    if (key === "maquinaId") limparErro("maquinaId");
    if (key === "combustivel") limparErro("combustivel");
    if (key === "litros") limparErro("litros");
    if (key === "horimetro") limparErro("horimetro");
    if (key === "fazendaId") limparErro("fazendaId");
    if (key === "valorLitro") limparErro("valorLitro");
  };

  const { data: registro, isLoading } = trpc.abastecimentos.get.useQuery(
    { id: editId },
    { enabled: isEdit }
  );

  const maquinaIdNum = Number(form.maquinaId) || undefined;

  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const maquinasOperacionais = useMemo(() => {
    const ativas = maquinas.filter(m => {
      if ((m as { dataDesativacao?: unknown }).dataDesativacao) return false;
      if (String(m.status || "").toLowerCase() === "inativo") return false;
      return true;
    });
    // Em edição, mantém a máquina do registro mesmo se estiver Inativa (histórico).
    if (isEdit && form.maquinaId) {
      const atual = maquinas.find(m => String(m.id) === form.maquinaId);
      if (atual && !ativas.some(a => a.id === atual.id)) {
        return [...ativas, atual].sort((a, b) =>
          String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
        );
      }
    }
    return [...ativas].sort((a, b) =>
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
    );
  }, [maquinas, isEdit, form.maquinaId]);
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: estoque = [] } = trpc.estoque.list.useQuery();
  const { data: movimentacoes = [] } = trpc.estoque.listMovimentacoes.useQuery();
  const { data: user } = trpc.auth.me.useQuery();
  const { data: historicoMaquina = [] } = trpc.abastecimentos.list.useQuery(
    { maquinaId: maquinaIdNum },
    { enabled: !!maquinaIdNum }
  );
  const utils = trpc.useUtils();

  const createMutation = trpc.abastecimentos.create.useMutation({
    onSuccess: () => {
      utils.abastecimentos.list.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.listMovimentacoes.invalidate();
      toast.success("Abastecimento registrado!");
      setLocation("/maquinas/abastecimento");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.abastecimentos.update.useMutation({
    onSuccess: () => {
      utils.abastecimentos.list.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.listMovimentacoes.invalidate();
      toast.success("Abastecimento atualizado!");
      setLocation("/maquinas/abastecimento");
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    if (!isEdit || !registro) return;
    if (initializedForId.current === registro.id) return;
    setForm({
      data: toDateInput(registro.data),
      maquinaId: String(registro.maquinaId),
      combustivel: (registro.combustivel as Combustivel) ?? "",
      litros: registro.litros ? String(registro.litros) : "",
      horimetro: registro.horimetro ?? "",
      origem: registro.abastecidoNaFazenda ? "estoque" : "externo",
      fazendaId: registro.fazendaId ? String(registro.fazendaId) : "",
      valorLitro: registro.valorLitro
        ? formatCurrencyBrl(String(Math.round(parseFloat(String(registro.valorLitro)) * 100)))
        : "",
      responsavel: registro.responsavel ?? "",
      observacoes: registro.observacoes ?? "",
    });
    initializedForId.current = registro.id;
  }, [isEdit, registro]);

  useEffect(() => {
    if (isEdit || form.responsavel || !user?.name) return;
    set("responsavel", user.name);
  }, [isEdit, user?.name, form.responsavel]);

  const maquinaSelecionada = useMemo(
    () => maquinas.find(m => String(m.id) === form.maquinaId) ?? null,
    [maquinas, form.maquinaId],
  );

  const medidorTipo = getMedidorTipo(maquinaSelecionada);
  const origemEstoque = form.origem === "estoque";

  const statsHistorico = useMemo(() => {
    const registros = historicoMaquina
      .filter(r => !isEdit || r.id !== editId)
      .sort((a, b) => {
        const da = a.data ? (parseLocalDate(a.data)?.getTime() ?? 0) : 0;
        const db = b.data ? (parseLocalDate(b.data)?.getTime() ?? 0) : 0;
        return db - da;
      });

    const ultimo = registros[0] ?? null;
    const leituraAbastecimento = ultimo?.horimetro ? parseFloat(String(ultimo.horimetro)) : null;
    const leituraCadastro = maquinaSelecionada?.horimetro
      ? parseFloat(String(maquinaSelecionada.horimetro))
      : null;
    const leituraAnteriorNum =
      leituraAbastecimento != null && !Number.isNaN(leituraAbastecimento)
        ? leituraAbastecimento
        : leituraCadastro != null && !Number.isNaN(leituraCadastro)
          ? leituraCadastro
          : null;
    const leituraAnteriorFmt =
      leituraAnteriorNum != null && !Number.isNaN(leituraAnteriorNum)
        ? formatLeitura(leituraAnteriorNum, medidorTipo)
        : "—";

    const leituraAtual = form.horimetro ? parseFloat(form.horimetro.replace(",", ".")) : null;
    const leituraInvalida =
      leituraAtual !== null &&
      leituraAnteriorNum !== null &&
      !Number.isNaN(leituraAtual) &&
      !Number.isNaN(leituraAnteriorNum) &&
      leituraAtual < leituraAnteriorNum;

    const dataUltimo = ultimo?.data ? formatDateBR(ultimo.data) : "—";

    let consumoMedio = "—";
    const comLeitura = registros.filter(r => r.horimetro && r.litros);
    if (comLeitura.length >= 1 && medidorTipo === "horimetro") {
      const totalLitros = comLeitura.reduce((s, r) => s + parseFloat(String(r.litros || 0)), 0);
      const totalHoras = comLeitura.reduce((s, r) => s + parseFloat(String(r.horimetro || 0)), 0);
      if (totalHoras > 0) {
        consumoMedio =
          (totalLitros / totalHoras).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) +
          " L/hora";
      }
    } else if (comLeitura.length >= 2 && medidorTipo === "quilometragem") {
      const ordenados = [...comLeitura].sort(
        (a, b) => parseFloat(String(a.horimetro || 0)) - parseFloat(String(b.horimetro || 0)),
      );
      const primeiro = ordenados[0];
      const ultimoKm = ordenados[ordenados.length - 1];
      const km =
        parseFloat(String(ultimoKm.horimetro || 0)) - parseFloat(String(primeiro.horimetro || 0));
      const litros = ordenados.reduce((s, r) => s + parseFloat(String(r.litros || 0)), 0);
      if (km > 0) {
        consumoMedio =
          (litros / km).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " L/km";
      }
    }

    return {
      leituraAnteriorFmt,
      leituraAnteriorNum,
      dataUltimo,
      consumoMedio,
      leituraInvalida,
      ultimo,
    };
  }, [historicoMaquina, isEdit, editId, form.horimetro, medidorTipo, maquinaSelecionada]);

  const { leituraInvalida, leituraAnteriorFmt, leituraAnteriorNum } = statsHistorico;

  /** Fazendas com saldo positivo do combustível selecionado (não lista saldo zero). */
  const fazendasComEstoque = useMemo(() => {
    if (!form.combustivel) return [];
    return fazendas
      .filter(f => getSaldoLitros(estoque, f.id, form.combustivel) > 0)
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  }, [fazendas, estoque, form.combustivel]);

  const nenhumaFazendaDisponivel =
    origemEstoque && !!form.combustivel && fazendasComEstoque.length === 0;

  const fazendaSelectDisabled = origemEstoque && !form.combustivel;

  /** Se a fazenda selecionada deixar de ter saldo, limpa a seleção. */
  useEffect(() => {
    if (!origemEstoque || !form.fazendaId || !form.combustivel) return;
    if (!estoque.length) return; // aguarda carga do estoque
    const aindaValida = fazendasComEstoque.some(f => String(f.id) === form.fazendaId);
    if (!aindaValida) set("fazendaId", "");
  }, [origemEstoque, form.fazendaId, form.combustivel, fazendasComEstoque, estoque.length]);

  const estoqueAtualLitros = useMemo(() => {
    if (!origemEstoque || !form.fazendaId || !form.combustivel) return null;
    return getSaldoLitros(estoque, Number(form.fazendaId), form.combustivel);
  }, [estoque, origemEstoque, form.fazendaId, form.combustivel]);

  const valorLitroEstoque = useMemo(() => {
    if (!origemEstoque || !form.fazendaId || !form.combustivel) return null;
    return getValorLitroEstoque(
      estoque,
      Number(form.fazendaId),
      form.combustivel,
      movimentacoes,
    );
  }, [estoque, movimentacoes, origemEstoque, form.fazendaId, form.combustivel]);

  const custoMedioIndisponivel =
    origemEstoque &&
    !!form.fazendaId &&
    !!form.combustivel &&
    (valorLitroEstoque == null || valorLitroEstoque <= 0);

  const valorLitroNumero = useMemo(() => {
    if (origemEstoque) return valorLitroEstoque != null && valorLitroEstoque > 0 ? valorLitroEstoque : null;
    const parsed = parseFloat(parseCurrencyBrl(form.valorLitro) || "");
    return Number.isNaN(parsed) || !form.valorLitro ? null : parsed;
  }, [origemEstoque, valorLitroEstoque, form.valorLitro]);

  const valorTotalPreview = useMemo(() => {
    const litros = parseFloat(form.litros.replace(",", "."));
    if (Number.isNaN(litros) || litros <= 0 || valorLitroNumero == null) return "";
    return (litros * valorLitroNumero).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [form.litros, valorLitroNumero]);

  const pending = createMutation.isPending || updateMutation.isPending;

  const hojeISO = new Date().toISOString().slice(0, 10);
  const litrosNumForm = parseFloat(form.litros.replace(",", "."));
  const litrosValidos =
    form.litros.trim() !== "" && !Number.isNaN(litrosNumForm) && litrosNumForm > 0;
  const quantidadeAcimaSaldo =
    origemEstoque &&
    estoqueAtualLitros != null &&
    litrosValidos &&
    litrosNumForm > estoqueAtualLitros;

  const handleOrigemChange = (v: OrigemCombustivel) => {
    setForm(f => ({
      ...f,
      origem: v,
      ...(v === "estoque" ? { valorLitro: "", fazendaId: "" } : { fazendaId: "" }),
    }));
    limparErro("fazendaId");
    limparErro("valorLitro");
  };

  const handleMaquinaChange = (maquinaId: string) => {
    setForm(f => ({ ...f, maquinaId, horimetro: "" }));
    limparErro("maquinaId");
    limparErro("horimetro");
  };

  const handleCombustivelChange = (combustivel: Combustivel | "") => {
    setForm(f => ({
      ...f,
      combustivel,
      // Troca de combustível limpa fazenda, saldo e custo derivados
      ...(f.origem === "estoque" ? { fazendaId: "", valorLitro: "" } : {}),
    }));
    limparErro("combustivel");
    limparErro("fazendaId");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;

    const next: Partial<Record<CampoObrigatorioAbastecimento, string>> = {};
    if (!form.data.trim()) next.data = "Informe a data do abastecimento.";
    if (!form.maquinaId) next.maquinaId = "Selecione a máquina.";
    if (!form.combustivel) next.combustivel = "Selecione o combustível.";
    if (!form.litros.trim()) next.litros = "Informe a quantidade abastecida.";
    if (medidorTipo != null && !form.horimetro.trim()) {
      next.horimetro =
        medidorTipo === "quilometragem"
          ? "Informe a quilometragem atual."
          : "Informe o horímetro atual.";
    }
    if (origemEstoque && !nenhumaFazendaDisponivel && !form.fazendaId) {
      next.fazendaId = "Selecione a Fazenda do estoque.";
    }
    if (!origemEstoque && !form.valorLitro.trim()) {
      next.valorLitro = "Informe o valor por litro.";
    }

    if (Object.keys(next).length > 0) {
      setErros(next);
      toast.error("Preencha os campos obrigatórios destacados.", { id: TOAST_ID_OBRIGATORIOS });
      const ordem: CampoObrigatorioAbastecimento[] = [
        "data",
        "maquinaId",
        "combustivel",
        "litros",
        "horimetro",
        "fazendaId",
        "valorLitro",
      ];
      const primeiro = ordem.find(c => next[c]);
      if (primeiro) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`abast-field-${primeiro}`);
          if (el instanceof HTMLElement) {
            el.focus({ preventScroll: true });
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });
      }
      return;
    }

    setErros({});

    if (form.data > hojeISO) return toast.error("A data do abastecimento não pode ser futura.");
    if (origemEstoque && nenhumaFazendaDisponivel) {
      return toast.error("Nenhuma Fazenda possui estoque deste combustível.");
    }
    if (leituraInvalida && leituraAnteriorNum != null) {
      return toast.error(
        `A leitura informada não pode ser menor que a última leitura registrada: ${formatLeitura(leituraAnteriorNum, medidorTipo)}.`,
      );
    }

    const litrosNum = parseFloat(form.litros.replace(",", "."));
    if (Number.isNaN(litrosNum) || litrosNum <= 0) {
      setErros({ litros: "Informe uma quantidade abastecida válida." });
      toast.error("Preencha os campos obrigatórios destacados.", { id: TOAST_ID_OBRIGATORIOS });
      return;
    }

    if (origemEstoque) {
      const saldo =
        form.fazendaId && form.combustivel
          ? getSaldoLitros(estoque, Number(form.fazendaId), form.combustivel)
          : 0;
      if (saldo <= 0) {
        return toast.error("Não há estoque disponível deste combustível na Fazenda selecionada.");
      }
      if (litrosNum > saldo) {
        return toast.error(
          `O estoque disponível é de ${saldo.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} L. Informe uma quantidade igual ou inferior ao saldo.`,
        );
      }
      if (valorLitroEstoque == null || valorLitroEstoque <= 0) {
        return toast.error("Custo médio não disponível para este combustível na Fazenda selecionada.");
      }
    }

    if (!origemEstoque) {
      if (valorLitroNumero == null || valorLitroNumero <= 0) {
        setErros({ valorLitro: "Informe um valor por litro válido." });
        toast.error("Preencha os campos obrigatórios destacados.", { id: TOAST_ID_OBRIGATORIOS });
        return;
      }
    }

    const valorLitroFinal = origemEstoque
      ? valorLitroEstoque != null
        ? valorLitroEstoque.toFixed(3)
        : undefined
      : form.valorLitro
        ? parseCurrencyBrl(form.valorLitro)
        : undefined;

    const valorTotalFinal =
      valorLitroFinal && !Number.isNaN(litrosNum)
        ? (litrosNum * parseFloat(valorLitroFinal)).toFixed(2)
        : undefined;

    const payload = {
      maquinaId: Number(form.maquinaId),
      data: form.data,
      combustivel: form.combustivel as Combustivel,
      litros: form.litros.replace(",", "."),
      horimetro: medidorTipo && form.horimetro.trim() ? form.horimetro.trim() : undefined,
      abastecidoNaFazenda: origemEstoque,
      fazendaId: origemEstoque && form.fazendaId ? Number(form.fazendaId) : null,
      valorLitro: valorLitroFinal,
      valorTotal: valorTotalFinal,
      responsavel: form.responsavel.trim() || undefined,
      observacoes: form.observacoes.trim() || undefined,
    };

    if (isEdit) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const medidorLabel =
    medidorTipo === "quilometragem" ? "Quilometragem atual" : "Horímetro atual";
  const medidorSufixo = medidorTipo === "quilometragem" ? "km" : "h";
  const leituraAnteriorCardLabel =
    medidorTipo === "quilometragem"
      ? "Leitura anterior (km)"
      : medidorTipo === "horimetro"
        ? "Leitura anterior (h)"
        : "Leitura anterior";

  if (isEdit && isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation("/maquinas/abastecimento")}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-6">
          <h1
            className="text-[16px] font-semibold text-gray-800 mb-5 pb-4 border-b border-gray-100 text-left"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {isEdit ? "Editar abastecimento" : "Novo abastecimento"}
          </h1>

          {/* Grade 2 colunas — campos em pares por linha */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Linha 1 */}
            <div className="min-w-0">
              <FormLabel required>Data do abastecimento</FormLabel>
              <FormDatePicker
                id="abast-field-data"
                value={form.data}
                onChange={v => set("data", v)}
                placeholder="Selecione a data"
                required
                max={hojeISO}
                invalid={!!erros.data}
                aria-describedby={erros.data ? "abast-err-data" : undefined}
              />
              <FieldErrorMsg id="abast-err-data" message={erros.data} />
            </div>
            <div className="min-w-0">
              <FormLabel required>Máquina</FormLabel>
              <FormNativeSelect
                id="abast-field-maquinaId"
                value={form.maquinaId}
                onChange={handleMaquinaChange}
                placeholder="Selecione a máquina"
                required
                options={maquinasOperacionais.map(m => ({ value: String(m.id), label: m.nome }))}
                invalid={!!erros.maquinaId}
                aria-describedby={erros.maquinaId ? "abast-err-maquinaId" : undefined}
              />
              <FieldErrorMsg id="abast-err-maquinaId" message={erros.maquinaId} />
            </div>

            {/* Linha 2 */}
            <div className="min-w-0">
              <FormLabel required>Combustível</FormLabel>
              <FormNativeSelect
                id="abast-field-combustivel"
                value={form.combustivel}
                onChange={v => handleCombustivelChange(v as Combustivel | "")}
                placeholder="Selecione o combustível"
                required
                options={COMBUSTIVEIS.map(c => ({
                  value: c.value,
                  label: c.label,
                }))}
                invalid={!!erros.combustivel}
                aria-describedby={erros.combustivel ? "abast-err-combustivel" : undefined}
              />
              <FieldErrorMsg id="abast-err-combustivel" message={erros.combustivel} />
            </div>
            <div className="min-w-0">
              <FormLabel required>Quantidade abastecida (L)</FormLabel>
              <FormInput
                id="abast-field-litros"
                value={form.litros}
                onChange={v => set("litros", v.replace(/[^\d.,]/g, ""))}
                placeholder="Ex.: 100"
                required
                invalid={!!erros.litros || quantidadeAcimaSaldo}
                aria-describedby={
                  erros.litros || quantidadeAcimaSaldo ? "abast-err-litros" : undefined
                }
              />
              {erros.litros ? (
                <FieldErrorMsg id="abast-err-litros" message={erros.litros} />
              ) : (
                quantidadeAcimaSaldo &&
                estoqueAtualLitros != null && (
                  <p id="abast-err-litros" className="text-red-500 text-[12px] mt-1" role="alert">
                    O estoque disponível é de{" "}
                    {estoqueAtualLitros.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    L. Informe uma quantidade igual ou inferior ao saldo.
                  </p>
                )
              )}
            </div>

            {/* Linha 3 */}
            <div className="min-w-0">
              <FormLabel required>Origem do combustível</FormLabel>
              <div className="flex items-center min-h-[42px] px-1">
                <RadioGroup
                  value={form.origem}
                  onValueChange={v => handleOrigemChange(v as OrigemCombustivel)}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2"
                >
                  <label className="flex items-center gap-2 cursor-pointer text-[13px] text-gray-700 whitespace-nowrap">
                    <RadioGroupItem value="estoque" />
                    Estoque da Fazenda
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[13px] text-gray-700 whitespace-nowrap">
                    <RadioGroupItem value="externo" />
                    Compra externa / Posto
                  </label>
                </RadioGroup>
              </div>
            </div>
            {medidorTipo ? (
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <FormLabel required className="mb-0">{medidorLabel}</FormLabel>
                  {statsHistorico.ultimo && (
                    <span className="text-gray-500 text-[11px]">
                      Últ.: {leituraAnteriorFmt}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <FormInput
                    id="abast-field-horimetro"
                    value={form.horimetro}
                    onChange={v => set("horimetro", v.replace(/[^\d.,]/g, ""))}
                    placeholder="Ex.: 1000"
                    className="pr-10"
                    invalid={!!erros.horimetro || leituraInvalida}
                    aria-describedby={
                      erros.horimetro || leituraInvalida ? "abast-err-horimetro" : undefined
                    }
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">
                    {medidorSufixo}
                  </span>
                </div>
                {erros.horimetro ? (
                  <FieldErrorMsg id="abast-err-horimetro" message={erros.horimetro} />
                ) : (
                  leituraInvalida &&
                  leituraAnteriorNum != null && (
                    <p id="abast-err-horimetro" className="text-red-500 text-[12px] mt-1" role="alert">
                      A leitura informada não pode ser menor que a última leitura registrada:{" "}
                      {formatLeitura(leituraAnteriorNum, medidorTipo)}.
                    </p>
                  )
                )}
              </div>
            ) : (
              <div className="hidden md:block" aria-hidden />
            )}

            {/* Linha 4 — somente Estoque da Fazenda */}
            {origemEstoque && (
              <>
                <div className="min-w-0">
                  <FormLabel required>Fazenda do estoque</FormLabel>
                  <FormNativeSelect
                    id="abast-field-fazendaId"
                    value={form.fazendaId}
                    onChange={v => set("fazendaId", v)}
                    placeholder={
                      fazendaSelectDisabled
                        ? "Selecione primeiro o combustível"
                        : "Selecione a Fazenda"
                    }
                    required={!fazendaSelectDisabled}
                    disabled={fazendaSelectDisabled}
                    options={fazendasComEstoque.map(f => ({
                      value: String(f.id),
                      label: f.nome,
                    }))}
                    invalid={!!erros.fazendaId}
                    aria-describedby={erros.fazendaId ? "abast-err-fazendaId" : undefined}
                  />
                  {erros.fazendaId ? (
                    <FieldErrorMsg id="abast-err-fazendaId" message={erros.fazendaId} />
                  ) : (
                    nenhumaFazendaDisponivel && (
                      <p className="text-amber-700 text-[12px] mt-1.5">
                        Não há estoque disponível deste combustível em nenhuma Fazenda.
                      </p>
                    )
                  )}
                </div>
                <div className="min-w-0">
                  <FormLabel>Estoque atual</FormLabel>
                  <FormInput
                    value={
                      estoqueAtualLitros != null
                        ? formatLitros(estoqueAtualLitros)
                        : form.fazendaId
                          ? "0,00 L"
                          : ""
                    }
                    onChange={() => {}}
                    placeholder="0,00 L"
                    className="cursor-default bg-gray-50 text-gray-800"
                  />
                </div>
              </>
            )}

            {/* Linha 5 — custos */}
            <div className="min-w-0">
              {origemEstoque ? (
                <>
                  <FormLabel>Valor por litro (R$)</FormLabel>
                  <FormInput
                    value={
                      !form.fazendaId || !form.combustivel
                        ? ""
                        : valorLitroEstoque != null
                          ? `R$ ${valorLitroEstoque.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 3,
                            })}`
                          : "Custo médio não disponível"
                    }
                    onChange={() => {}}
                    placeholder="Custo médio do estoque"
                    className={cn(
                      "cursor-default bg-gray-50",
                      custoMedioIndisponivel ? "text-amber-800" : "text-gray-800",
                    )}
                  />
                  {custoMedioIndisponivel && (
                    <p className="text-amber-700 text-[12px] mt-1.5">
                      Não é possível salvar sem o custo médio deste combustível no estoque.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <FormLabel required>Valor por litro (R$)</FormLabel>
                  <FormInput
                    id="abast-field-valorLitro"
                    value={form.valorLitro}
                    onChange={v => set("valorLitro", formatCurrencyBrl(v))}
                    placeholder="R$ 0,00"
                    required
                    invalid={!!erros.valorLitro}
                    aria-describedby={erros.valorLitro ? "abast-err-valorLitro" : undefined}
                  />
                  <FieldErrorMsg id="abast-err-valorLitro" message={erros.valorLitro} />
                </>
              )}
            </div>
            <div className="min-w-0">
              <FormLabel>Valor total (R$)</FormLabel>
              <FormInput
                value={valorTotalPreview ? `R$ ${valorTotalPreview}` : ""}
                onChange={() => {}}
                placeholder="Calculado automaticamente"
                className="cursor-default bg-gray-50 text-gray-800"
              />
            </div>

            {/* Linha 6 */}
            <div className="min-w-0">
              <FormLabel>Responsável pelo abastecimento</FormLabel>
              <FormNativeSelect
                value={form.responsavel}
                onChange={v => set("responsavel", v)}
                placeholder="Selecione o responsável"
                options={[
                  ...(user?.name ? [{ value: user.name, label: user.name }] : []),
                  ...fazendas
                    .map(f => f.responsavel)
                    .filter((n): n is string => !!n?.trim())
                    .filter((n, i, arr) => arr.indexOf(n) === i && n !== user?.name)
                    .map(n => ({ value: n, label: n })),
                ]}
              />
            </div>
            <div className="min-w-0">
              <FormLabel>Observações</FormLabel>
              <FormTextarea
                value={form.observacoes}
                onChange={v => set("observacoes", v)}
                placeholder="Informações adicionais sobre este abastecimento"
                rows={4}
                className="min-h-[88px] max-h-[100px]"
              />
            </div>
          </div>

          {maquinaIdNum && medidorTipo && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 mb-4 border border-gray-200 rounded-md overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-r border-gray-200">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                  {leituraAnteriorCardLabel}
                </p>
                <p className="text-[13px] font-medium text-gray-800">{leituraAnteriorFmt}</p>
              </div>
              <div className="px-4 py-3 bg-gray-50 border-r border-gray-200">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                  Data do último abastecimento
                </p>
                <p className="text-[13px] font-medium text-gray-800">{statsHistorico.dataUltimo}</p>
              </div>
              <div className="px-4 py-3 bg-gray-50">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                  Consumo médio de combustível
                </p>
                <p className="text-[13px] font-medium text-gray-800">{statsHistorico.consumoMedio}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/maquinas/abastecimento")}
              disabled={pending}
              className="w-full sm:w-auto px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="w-full sm:w-auto px-8 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { AbastecimentoFormPage };
