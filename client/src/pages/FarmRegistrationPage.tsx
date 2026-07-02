import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ESTADOS_BR, fetchCidadesPorEstado } from "@/lib/brazil-locations";
import { SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn, formatCpfCnpj, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormSelect,
  FormNativeSelect,
  FieldBox,
  inputClass,
} from "@/components/FormFields";

type FormState = {
  nome: string;
  sigla: string;
  responsavel: string;
  pais: string;
  estado: string;
  cidade: string;
  unidadeArea: string;
  area: string;
  areaReserva: string;
  areaLiquida: string;
  endereco: string;
  atividadePrincipal: string;
  atividadeCria: boolean;
  atividadeRecria: boolean;
  atividadeEngorda: boolean;
  atividadeConfinamento: boolean;
  atividadeLeite: boolean;
  atividadeAgricultura: boolean;
  atividadeOutros: boolean;
  quantidadeAnimais: string;
  cpfCnpj: string;
  inscricaoEstadual: string;
  registroIncra: string;
  nirf: string;
  numeroCar: string;
  matriculasImovel: string[];
  tipoPosse: string;
  possuiSisbov: string;
  razaoSocial: string;
  latitude: string;
  longitude: string;
  distanciaMunicipio: string;
  valorHectare: string;
  fonteEnergia: string;
  fonteAgua: string;
  responsavelOperacionalNome: string;
  responsavelOperacionalTelefone: string;
  responsavelOperacionalFuncaoSelect: string;
  responsavelOperacionalFuncaoOutro: string;
  observacoes: string;
};

const emptyForm = (responsavel = ""): FormState => ({
  nome: "",
  sigla: "",
  responsavel,
  pais: "Brasil",
  estado: "",
  cidade: "",
  unidadeArea: "Hectare",
  area: "",
  areaReserva: "",
  areaLiquida: "",
  endereco: "",
  atividadePrincipal: "",
  atividadeCria: false,
  atividadeRecria: false,
  atividadeEngorda: false,
  atividadeConfinamento: false,
  atividadeLeite: false,
  atividadeAgricultura: false,
  atividadeOutros: false,
  quantidadeAnimais: "",
  cpfCnpj: "",
  inscricaoEstadual: "",
  registroIncra: "",
  nirf: "",
  numeroCar: "",
  matriculasImovel: [""],
  tipoPosse: "",
  possuiSisbov: "nao",
  razaoSocial: "",
  latitude: "",
  longitude: "",
  distanciaMunicipio: "",
  valorHectare: "",
  fonteEnergia: "",
  fonteAgua: "",
  responsavelOperacionalNome: "",
  responsavelOperacionalTelefone: "",
  responsavelOperacionalFuncaoSelect: "",
  responsavelOperacionalFuncaoOutro: "",
  observacoes: "",
});

function str(v: unknown) {
  return v != null && v !== "" ? String(v) : "";
}

function bool(v: unknown) {
  return v === true || v === 1;
}

function parseDecimal(value: string) {
  if (!value?.trim()) return null;
  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimal(value: number) {
  const fixed = value.toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed.replace(/0$/, "");
}

function formatPhoneBR(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function parseMatriculasImovel(value: unknown, fallback?: string) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item).trim()).filter(Boolean);
      }
    } catch {
      return value
        .split(/\n|;/)
        .map(item => item.trim())
        .filter(Boolean);
    }
  }

  return fallback?.trim() ? [fallback.trim()] : [];
}

function mapFazendaToForm(fazenda: Record<string, unknown>): FormState {
  const estadoUf = normalizeEstadoUf(String(fazenda.estado ?? ""));
  const cidadeSalva = String(fazenda.cidade ?? "");
  const matriculas = parseMatriculasImovel(
    fazenda.matriculasImovel,
    String(fazenda.matriculaImovel ?? "")
  );

  return {
    nome: String(fazenda.nome ?? ""),
    sigla: String(fazenda.sigla ?? ""),
    responsavel: String(fazenda.responsavel ?? ""),
    pais: String(fazenda.pais ?? "Brasil"),
    estado: estadoUf,
    cidade: cidadeSalva,
    unidadeArea: String(fazenda.unidadeArea ?? "Hectare"),
    area: str(fazenda.area),
    areaReserva: str(fazenda.areaReserva),
    areaLiquida: str(fazenda.areaLiquida),
    endereco: String(fazenda.endereco ?? ""),
    atividadePrincipal: String(fazenda.atividadePrincipal ?? ""),
    atividadeCria: bool(fazenda.atividadeCria),
    atividadeRecria: bool(fazenda.atividadeRecria),
    atividadeEngorda: bool(fazenda.atividadeEngorda),
    atividadeConfinamento: bool(fazenda.atividadeConfinamento),
    atividadeLeite: bool(fazenda.atividadeLeite),
    atividadeAgricultura: bool(fazenda.atividadeAgricultura),
    atividadeOutros: bool(fazenda.atividadeOutros),
    quantidadeAnimais: str(fazenda.quantidadeAnimais),
    cpfCnpj: formatCpfCnpj(String(fazenda.cpfCnpj ?? "")),
    inscricaoEstadual: String(fazenda.inscricaoEstadual ?? ""),
    registroIncra: String(fazenda.registroIncra ?? ""),
    nirf: String(fazenda.nirf ?? ""),
    numeroCar: String(fazenda.numeroCar ?? ""),
    matriculasImovel: matriculas.length
      ? matriculas
      : [String(fazenda.matriculaImovel ?? "")].filter(Boolean),
    tipoPosse: String(fazenda.tipoPosse ?? ""),
    possuiSisbov: fazenda.possuiSisbov === true ? "sim" : fazenda.possuiSisbov === false ? "nao" : "nao",
    razaoSocial: String(fazenda.razaoSocial ?? ""),
    latitude: String(fazenda.latitude ?? ""),
    longitude: String(fazenda.longitude ?? ""),
    distanciaMunicipio: str(fazenda.distanciaMunicipio),
    valorHectare: fazenda.valorHectare
      ? formatCurrencyBrl(String(Math.round(parseFloat(String(fazenda.valorHectare)) * 100)))
      : "",
    fonteEnergia: String(fazenda.fonteEnergia ?? ""),
    fonteAgua: String(fazenda.fonteAgua ?? ""),
    responsavelOperacionalNome: String(fazenda.responsavelOperacionalNome ?? ""),
    responsavelOperacionalTelefone: formatPhoneBR(String(fazenda.responsavelOperacionalTelefone ?? "")),
    ...parseResponsavelOperacionalFuncao(String(fazenda.responsavelOperacionalFuncao ?? "")),
    observacoes: String(fazenda.observacoes ?? ""),
  };
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-100 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <div className="mb-4">
        <h2 className="text-[13px] font-semibold text-gray-800">{title}</h2>
        {description && <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function normalizeEstadoUf(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const found = ESTADOS_BR.find(
    e => e.nome.toLowerCase() === trimmed.toLowerCase() || e.uf.toLowerCase() === trimmed.toLowerCase()
  );
  return found?.uf ?? trimmed;
}

const ATIVIDADE_PRINCIPAL_OPTIONS = [
  { value: "Cria", label: "Cria" },
  { value: "Recria", label: "Recria" },
  { value: "Engorda", label: "Engorda" },
  { value: "Ciclo completo", label: "Ciclo completo" },
  { value: "Confinamento", label: "Confinamento" },
  { value: "Leite", label: "Leite" },
] as const;

const RESPONSAVEL_FUNCAO_OPTIONS = [
  { value: "Proprietário", label: "Proprietário" },
  { value: "Administrador", label: "Administrador" },
  { value: "Gerente", label: "Gerente" },
  { value: "Capataz", label: "Capataz" },
  { value: "Vaqueiro", label: "Vaqueiro" },
  { value: "Consultor", label: "Consultor" },
  { value: "Outro", label: "Outro" },
] as const;

const RESPONSAVEL_FUNCAO_PADRAO = new Set(
  RESPONSAVEL_FUNCAO_OPTIONS.map(o => o.value).filter(v => v !== "Outro"),
);

function parseResponsavelOperacionalFuncao(stored: string) {
  const funcao = stored.trim();
  if (!funcao) {
    return { responsavelOperacionalFuncaoSelect: "", responsavelOperacionalFuncaoOutro: "" };
  }
  if (RESPONSAVEL_FUNCAO_PADRAO.has(funcao)) {
    return { responsavelOperacionalFuncaoSelect: funcao, responsavelOperacionalFuncaoOutro: "" };
  }
  return { responsavelOperacionalFuncaoSelect: "Outro", responsavelOperacionalFuncaoOutro: funcao };
}

function buildResponsavelOperacionalFuncao(select: string, outro: string) {
  if (!select) return undefined;
  if (select === "Outro") {
    const descricao = outro.trim();
    return descricao || undefined;
  }
  return select;
}

const PAIS_OPTIONS = [
  { value: "Brasil", label: "Brasil" },
  { value: "Argentina", label: "Argentina" },
  { value: "Paraguai", label: "Paraguai" },
  { value: "Uruguai", label: "Uruguai" },
] as const;

function parseFazendaId(search: string): number | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const idParam = new URLSearchParams(query).get("id");
  if (!idParam) return null;
  const parsed = parseInt(idParam, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function fazendaHydrationKey(fazenda: Record<string, unknown> | null | undefined) {
  if (!fazenda) return "";
  return [
    fazenda.id,
    fazenda.updatedAt,
    fazenda.createdAt,
    fazenda.nome,
    fazenda.estado,
    fazenda.cidade,
    fazenda.atividadePrincipal,
    fazenda.area,
  ]
    .map(v => String(v ?? ""))
    .join("|");
}

export function FarmRegistrationPage() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const fazendaId = parseFazendaId(searchString);
  const isEdit = fazendaId != null;

  const { data: user } = trpc.auth.me.useQuery();
  const {
    data: fazenda,
    isLoading: loadingFazenda,
    isFetching: fetchingFazenda,
  } = trpc.fazendas.get.useQuery(
    { id: fazendaId! },
    {
      enabled: isEdit,
      refetchOnMount: "always",
      staleTime: 0,
      gcTime: 0,
    }
  );

  const [cadastroAvancado, setCadastroAvancado] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [cidades, setCidades] = useState<string[]>([]);
  const [loadingCidades, setLoadingCidades] = useState(false);
  const [hydratedKey, setHydratedKey] = useState("");

  const hydrationKey = isEdit ? fazendaHydrationKey(fazenda as Record<string, unknown> | undefined) : "new";

  useEffect(() => {
    setHydratedKey("");
  }, [fazendaId]);

  useEffect(() => {
    if (isEdit) return;
    setForm(emptyForm(user?.name || ""));
    setCidades([]);
    setHydratedKey("new");
  }, [fazendaId, isEdit, user?.name]);

  useEffect(() => {
    if (!isEdit && user?.name) {
      setForm(f => ({ ...f, responsavel: user.name || "" }));
    }
  }, [user?.name, isEdit]);

  useEffect(() => {
    if (!isEdit || !fazenda || !hydrationKey) return;
    if (hydratedKey === hydrationKey) return;

    setForm(mapFazendaToForm(fazenda as Record<string, unknown>));
    setHydratedKey(hydrationKey);
  }, [isEdit, fazenda, hydrationKey, hydratedKey]);

  useEffect(() => {
    if (isEdit && !fazenda) return;
    if (!form.estado) {
      setCidades([]);
      return;
    }

    let cancelled = false;
    const savedCidade = form.cidade.trim();
    setLoadingCidades(true);
    fetchCidadesPorEstado(form.estado)
      .then(list => {
        if (cancelled) return;
        if (savedCidade && !list.includes(savedCidade)) {
          setCidades([savedCidade, ...list]);
        } else {
          setCidades(list);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCidades(savedCidade ? [savedCidade] : []);
        toast.error("Não foi possível carregar os municípios");
      })
      .finally(() => {
        if (!cancelled) setLoadingCidades(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.estado, form.cidade, isEdit, fazenda, hydrationKey]);

  useEffect(() => {
    if (!isEdit || !fazenda) return;

    const areaTotal = parseDecimal(form.area);
    if (areaTotal == null) {
      if (form.areaLiquida) setForm(f => ({ ...f, areaLiquida: "" }));
      return;
    }

    const areaReserva = parseDecimal(form.areaReserva) ?? 0;
    const areaLiquida = Math.max(areaTotal - areaReserva, 0);
    const areaLiquidaFormatada = formatDecimal(areaLiquida);

    if (form.areaLiquida !== areaLiquidaFormatada) {
      setForm(f => ({ ...f, areaLiquida: areaLiquidaFormatada }));
    }
  }, [form.area, form.areaReserva, form.areaLiquida, isEdit, fazenda]);

  const estadoOptions = useMemo(
    () => ESTADOS_BR.map(e => ({ value: e.uf, label: e.nome })),
    [],
  );

  const estadoDisplayName = useMemo(() => {
    const found = ESTADOS_BR.find(e => e.uf === form.estado);
    return found?.nome ?? form.estado;
  }, [form.estado]);

  const municipioPlaceholder = loadingCidades
    ? "Carregando..."
    : form.estado
      ? "Selecione o município"
      : "Selecione o estado primeiro";

  const municipioOptions = useMemo(() => {
    const base = cidades.map(c => ({ value: c, label: c }));
    if (form.cidade && !base.some(o => o.value === form.cidade)) {
      return [{ value: form.cidade, label: form.cidade }, ...base];
    }
    return base;
  }, [cidades, form.cidade]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const setMatricula = (index: number, value: string) => {
    setForm(f => {
      const next = [...f.matriculasImovel];
      next[index] = value;
      return { ...f, matriculasImovel: next };
    });
  };

  const addMatricula = () => {
    setForm(f => ({ ...f, matriculasImovel: [...f.matriculasImovel, ""] }));
  };

  const removeMatricula = (index: number) => {
    setForm(f => {
      const next = f.matriculasImovel.filter((_, i) => i !== index);
      return { ...f, matriculasImovel: next.length ? next : [""] };
    });
  };

  const payload = () => ({
    nome: form.nome.trim(),
    sigla: form.sigla || undefined,
    responsavel: form.responsavel || undefined,
    pais: form.pais || undefined,
    estado: form.estado || undefined,
    cidade: form.cidade || undefined,
    unidadeArea: form.unidadeArea || undefined,
    area: form.area || undefined,
    areaReserva: form.areaReserva || undefined,
    areaLiquida: form.areaLiquida || undefined,
    endereco: form.endereco || undefined,
    atividadePrincipal: form.atividadePrincipal || undefined,
    atividadeCria: form.atividadeCria,
    atividadeRecria: form.atividadeRecria,
    atividadeEngorda: form.atividadeEngorda,
    atividadeConfinamento: form.atividadeConfinamento,
    atividadeLeite: form.atividadeLeite,
    atividadeAgricultura: form.atividadeAgricultura,
    atividadeOutros: form.atividadeOutros,
    quantidadeAnimais: form.quantidadeAnimais ? Number(form.quantidadeAnimais) : undefined,
    cpfCnpj: form.cpfCnpj || undefined,
    inscricaoEstadual: form.inscricaoEstadual || undefined,
    registroIncra: form.registroIncra || undefined,
    nirf: form.nirf || undefined,
    numeroCar: form.numeroCar || undefined,
    matriculaImovel: form.matriculasImovel[0]?.trim() || undefined,
    matriculasImovel: (() => {
      const matriculas = form.matriculasImovel.map(item => item.trim()).filter(Boolean);
      return matriculas.length ? JSON.stringify(matriculas) : undefined;
    })(),
    tipoPosse: form.tipoPosse || undefined,
    possuiSisbov: form.possuiSisbov === "sim",
    razaoSocial: form.razaoSocial || undefined,
    latitude: form.latitude || undefined,
    longitude: form.longitude || undefined,
    distanciaMunicipio: form.distanciaMunicipio || undefined,
    valorHectare: parseCurrencyBrl(form.valorHectare) || undefined,
    responsavelOperacionalNome: form.responsavelOperacionalNome || undefined,
    responsavelOperacionalTelefone: form.responsavelOperacionalTelefone || undefined,
    responsavelOperacionalFuncao: buildResponsavelOperacionalFuncao(
      form.responsavelOperacionalFuncaoSelect,
      form.responsavelOperacionalFuncaoOutro,
    ),
    observacoes: form.observacoes || undefined,
  });

  const createMutation = trpc.fazendas.create.useMutation({
    onSuccess: () => {
      utils.fazendas.list.invalidate();
      toast.success("Fazenda cadastrada com sucesso!");
      setLocation("/fazendas/visao-geral");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.fazendas.update.useMutation({
    onSuccess: () => {
      utils.fazendas.list.invalidate();
      if (fazendaId) utils.fazendas.get.invalidate({ id: fazendaId });
      toast.success("Fazenda atualizada!");
      setLocation("/fazendas/visao-geral");
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome da fazenda é obrigatório"); return; }
    if (!form.pais) { toast.error("País é obrigatório"); return; }
    if (!form.estado) { toast.error("Estado é obrigatório"); return; }
    if (!form.cidade) { toast.error("Município é obrigatório"); return; }
    if (!form.unidadeArea) { toast.error("Unidade de medida da área é obrigatória"); return; }
    if (!form.area.trim()) { toast.error("Área total é obrigatória"); return; }
    if (!form.atividadePrincipal) { toast.error("Atividade principal da fazenda é obrigatória"); return; }
    if (isEdit && fazendaId) {
      updateMutation.mutate({ id: fazendaId, ...payload() });
    } else {
      createMutation.mutate(payload());
    }
  };

  const formSyncedForEdit = !isEdit || (hydratedKey === hydrationKey && hydrationKey !== "");

  if (isEdit && (loadingFazenda || fetchingFazenda) && !fazenda) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando fazenda...</div>
      </AppLayout>
    );
  }

  if (isEdit && !loadingFazenda && !fetchingFazenda && !fazenda) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-3">
          <span>Fazenda não encontrada.</span>
          <button
            type="button"
            onClick={() => setLocation("/fazendas/visao-geral")}
            className="px-4 py-2 rounded-full text-[11px] font-semibold uppercase bg-[#EEEEEE] text-gray-700"
          >
            Voltar
          </button>
        </div>
      </AppLayout>
    );
  }

  if (isEdit && fazenda && !formSyncedForEdit) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Preparando formulário...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-md shadow-sm border border-gray-100 p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
            <h1 className="text-[15px] font-semibold text-gray-800">
              {isEdit ? "Editar Fazenda" : "Cadastrar Fazenda"}
            </h1>
            <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-right leading-tight">
                <div className="text-[11px] font-semibold text-gray-800">Cadastro Avançado</div>
                <div className="text-[10px] text-gray-500">
                  Dados complementares opcionais
                </div>
              </div>
              <Switch
                checked={cadastroAvancado}
                onCheckedChange={setCadastroAvancado}
                className="data-[state=checked]:bg-[#4ECDC4] data-[state=unchecked]:bg-gray-300"
              />
            </div>
          </div>

          <div className="space-y-5">
            <FormSection
              title="Cadastro Simples"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <FormLabel required>Nome da Fazenda</FormLabel>
                  <FormInput value={form.nome} onChange={v => set("nome", v)} placeholder="Ex. Fazenda Santa Maria" required />
                </div>
                <div>
                  <FormLabel>Sigla da Fazenda</FormLabel>
                  <FormInput value={form.sigla} onChange={v => set("sigla", v)} placeholder="Ex. FSM" />
                </div>
                <div>
                  <FormLabel>Nome do Proprietário</FormLabel>
                  <FormInput value={form.responsavel} onChange={v => set("responsavel", v)} placeholder="Opcional" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 items-start">
                <div>
                  <FormLabel required>País</FormLabel>
                  <FormNativeSelect
                    value={form.pais}
                    onChange={v => set("pais", v)}
                    placeholder="Selecione"
                    required
                    options={PAIS_OPTIONS}
                  />
                </div>
                <div>
                  <FormLabel required>Estado</FormLabel>
                  <FormSelect
                    value={form.estado}
                    onChange={v => setForm(f => ({ ...f, estado: v, cidade: "" }))}
                    placeholder="Selecione"
                    required
                    displayValue={estadoDisplayName}
                  >
                    {estadoOptions.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[13px]">
                        {o.label}
                      </SelectItem>
                    ))}
                  </FormSelect>
                </div>
                <div>
                  <FormLabel required>Município</FormLabel>
                  <FormSelect
                    value={form.cidade}
                    onChange={v => set("cidade", v)}
                    placeholder={municipioPlaceholder}
                    disabled={!form.estado || loadingCidades}
                    required
                    displayValue={form.cidade}
                  >
                    {municipioOptions.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[13px]">
                        {o.label}
                      </SelectItem>
                    ))}
                  </FormSelect>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <FormLabel required>Unidade de Medida da Área</FormLabel>
                  <FormSelect value={form.unidadeArea} onChange={v => set("unidadeArea", v)} placeholder="Selecione" required displayValue={form.unidadeArea}>
                    <SelectItem value="Hectare" className="text-[13px]">Hectare</SelectItem>
                    <SelectItem value="Alqueire" className="text-[13px]">Alqueire</SelectItem>
                    <SelectItem value="Metro²" className="text-[13px]">Metro²</SelectItem>
                  </FormSelect>
                </div>
                <div>
                  <FormLabel required>Área Total da Fazenda</FormLabel>
                  <FormInput value={form.area} onChange={v => set("area", v)} placeholder="0" type="number" required />
                </div>
                <div>
                  <FormLabel>Área de Reserva</FormLabel>
                  <FormInput value={form.areaReserva} onChange={v => set("areaReserva", v)} placeholder="0" type="number" />
                </div>
                <div>
                  <FormLabel>Área Líquida da Fazenda</FormLabel>
                  <FieldBox className="bg-gray-50">
                    <input
                      type="number"
                      value={form.areaLiquida}
                      readOnly
                      placeholder="0"
                      className={cn(inputClass, "text-gray-600")}
                    />
                  </FieldBox>
                  <p className="mt-1 text-[10px] text-gray-400">Calculada automaticamente: área total menos área de reserva.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4 items-start">
                <div className="lg:col-span-4">
                  <FormLabel required>Atividade Principal da Fazenda</FormLabel>
                  <FormNativeSelect
                    value={form.atividadePrincipal}
                    onChange={v => set("atividadePrincipal", v)}
                    placeholder="Selecione"
                    required
                    options={ATIVIDADE_PRINCIPAL_OPTIONS}
                  />
                </div>
                <div className="lg:col-span-8">
                  <FormLabel>Endereço da Fazenda</FormLabel>
                  <FormInput value={form.endereco} onChange={v => set("endereco", v)} placeholder="Rodovia, km, referência..." />
                </div>
              </div>

              <div>
                <FormLabel>Observação</FormLabel>
                <FieldBox>
                  <textarea
                    value={form.observacoes}
                    onChange={e => set("observacoes", e.target.value)}
                    placeholder="Informações adicionais sobre a fazenda..."
                    className={cn(inputClass, "resize-y min-h-[110px]")}
                    rows={4}
                  />
                </FieldBox>
              </div>
            </FormSection>

            {cadastroAvancado && (
              <div className="space-y-5">
                <FormSection
                  title="Dados Fiscais"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <FormLabel>Razão Social</FormLabel>
                      <FormInput value={form.razaoSocial} onChange={v => set("razaoSocial", v)} placeholder="Nome empresarial, se houver" />
                    </div>
                    <div>
                      <FormLabel>CPF/CNPJ</FormLabel>
                      <FormInput
                        value={form.cpfCnpj}
                        onChange={v => set("cpfCnpj", formatCpfCnpj(v))}
                        placeholder={form.cpfCnpj.replace(/\D/g, "").length > 11 ? "00.000.000/0000-00" : "000.000.000-00"}
                      />
                    </div>
                    <div>
                      <FormLabel>Inscrição Estadual</FormLabel>
                      <FormInput value={form.inscricaoEstadual} onChange={v => set("inscricaoEstadual", v)} placeholder="Opcional" />
                    </div>
                  </div>
                </FormSection>

                <FormSection
                  title="Documentação Rural"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <FormLabel>Registro INCRA</FormLabel>
                      <FormInput value={form.registroIncra} onChange={v => set("registroIncra", v)} placeholder="Opcional" />
                    </div>
                    <div>
                      <FormLabel>NIRF</FormLabel>
                      <FormInput value={form.nirf} onChange={v => set("nirf", v)} placeholder="Opcional" />
                    </div>
                    <div>
                      <FormLabel>Número do CAR</FormLabel>
                      <FormInput value={form.numeroCar} onChange={v => set("numeroCar", v)} placeholder="Opcional" />
                    </div>
                    <div className="lg:col-span-2">
                      <FormLabel>Matrícula do Imóvel</FormLabel>
                      <FormInput
                        value={form.matriculasImovel[0] || ""}
                        onChange={v => {
                          setForm(f => ({ ...f, matriculasImovel: [v] }));
                        }}
                        placeholder="Opcional"
                      />
                    </div>
                    <div>
                      <FormLabel>Tipo de Posse</FormLabel>
                      <FormSelect value={form.tipoPosse} onChange={v => set("tipoPosse", v)} placeholder="Selecione" displayValue={form.tipoPosse}>
                        <SelectItem value="Própria" className="text-[13px]">Própria</SelectItem>
                        <SelectItem value="Arrendada" className="text-[13px]">Arrendada</SelectItem>
                        <SelectItem value="Parceria" className="text-[13px]">Parceria</SelectItem>
                        <SelectItem value="Comodato" className="text-[13px]">Comodato</SelectItem>
                        <SelectItem value="Posse" className="text-[13px]">Posse</SelectItem>
                        <SelectItem value="Outra" className="text-[13px]">Outra</SelectItem>
                      </FormSelect>
                    </div>
                  </div>
                </FormSection>

                <FormSection
                  title="SISBOV"
                >
                  <div className="bg-[#EEEEEE] border border-gray-200 rounded-sm px-3 py-2.5">
                    <RadioGroup
                      value={form.possuiSisbov}
                      onValueChange={v => set("possuiSisbov", v)}
                      className="flex gap-6"
                    >
                      <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
                        <RadioGroupItem value="sim" className="border-gray-400 text-[#4ECDC4]" />
                        Sim
                      </label>
                      <label className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
                        <RadioGroupItem value="nao" className="border-gray-400 text-[#4ECDC4]" />
                        Não
                      </label>
                    </RadioGroup>
                  </div>
                </FormSection>

                <FormSection
                  title="Localização"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <FormLabel>Latitude</FormLabel>
                      <FormInput value={form.latitude} onChange={v => set("latitude", v)} placeholder="-16.6869" />
                    </div>
                    <div>
                      <FormLabel>Longitude</FormLabel>
                      <FormInput value={form.longitude} onChange={v => set("longitude", v)} placeholder="-49.2648" />
                    </div>
                    <div>
                      <FormLabel>Distância da sede do município (Km)</FormLabel>
                      <FormInput value={form.distanciaMunicipio} onChange={v => set("distanciaMunicipio", v)} placeholder="0" type="number" />
                    </div>
                  </div>
                </FormSection>

                <FormSection title="Avaliação Patrimonial">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <FormLabel>Valor estimado do hectare</FormLabel>
                      <FormInput
                        value={form.valorHectare}
                        onChange={v => set("valorHectare", formatCurrencyBrl(v))}
                        placeholder="R$ 0,00"
                      />
                    </div>
                  </div>
                </FormSection>

                <div className="hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FormLabel>Fonte de Energia</FormLabel>
                      <FormSelect value={form.fonteEnergia} onChange={v => set("fonteEnergia", v)} placeholder="Selecione" displayValue={form.fonteEnergia}>
                        <SelectItem value="Rede elétrica" className="text-[13px]">Rede elétrica</SelectItem>
                        <SelectItem value="Solar" className="text-[13px]">Solar</SelectItem>
                        <SelectItem value="Gerador" className="text-[13px]">Gerador</SelectItem>
                        <SelectItem value="Mista" className="text-[13px]">Mista</SelectItem>
                        <SelectItem value="Não possui" className="text-[13px]">Não possui</SelectItem>
                      </FormSelect>
                    </div>
                    <div>
                      <FormLabel>Fonte de Água</FormLabel>
                      <FormSelect value={form.fonteAgua} onChange={v => set("fonteAgua", v)} placeholder="Selecione" displayValue={form.fonteAgua}>
                        <SelectItem value="Poço" className="text-[13px]">Poço</SelectItem>
                        <SelectItem value="Rio" className="text-[13px]">Rio</SelectItem>
                        <SelectItem value="Represa" className="text-[13px]">Represa</SelectItem>
                        <SelectItem value="Nascente" className="text-[13px]">Nascente</SelectItem>
                        <SelectItem value="Rede pública" className="text-[13px]">Rede pública</SelectItem>
                        <SelectItem value="Mista" className="text-[13px]">Mista</SelectItem>
                      </FormSelect>
                    </div>
                  </div>
                </div>

                <FormSection title="Responsável operacional">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <FormLabel>Nome</FormLabel>
                      <FormInput value={form.responsavelOperacionalNome} onChange={v => set("responsavelOperacionalNome", v)} placeholder="Opcional" />
                    </div>
                    <div>
                      <FormLabel>Telefone / WhatsApp</FormLabel>
                      <FormInput
                        value={form.responsavelOperacionalTelefone}
                        onChange={v => set("responsavelOperacionalTelefone", formatPhoneBR(v))}
                        placeholder="(00) 00000-0000"
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <FormLabel>Função</FormLabel>
                      <FormSelect
                        value={form.responsavelOperacionalFuncaoSelect}
                        onChange={v => set("responsavelOperacionalFuncaoSelect", v)}
                        placeholder="Selecione a função"
                        displayValue={form.responsavelOperacionalFuncaoSelect}
                      >
                        {RESPONSAVEL_FUNCAO_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value} className="text-[13px]">
                            {o.label}
                          </SelectItem>
                        ))}
                      </FormSelect>
                    </div>
                    {form.responsavelOperacionalFuncaoSelect === "Outro" && (
                      <div className="sm:col-span-3">
                        <FormLabel>Especificar função</FormLabel>
                        <FormInput
                          value={form.responsavelOperacionalFuncaoOutro}
                          onChange={v => set("responsavelOperacionalFuncaoOutro", v)}
                          placeholder="Descreva a função"
                        />
                      </div>
                    )}
                  </div>
                </FormSection>
              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/fazendas/visao-geral")}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : isEdit ? "Salvar" : "Cadastrar"}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export default FarmRegistrationPage;
