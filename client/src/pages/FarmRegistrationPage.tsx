import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ESTADOS_BR, fetchCidadesPorEstado } from "@/lib/brazil-locations";
import { SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatCpfCnpj, formatCurrencyBrl } from "@/lib/utils";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  conferirPastagem,
  documentoBrConsistente,
  exibirAreaSalva,
  interpretarArea,
  formatarAreaPtBr,
  ufDoBrasil,
} from "@shared/fazendaCadastro";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormSelect,
  FormNativeSelect,
} from "@/components/FormFields";

/** Ordem visual dos campos obrigatórios no cadastro simples. */
const CAMPOS_OBRIGATORIOS = [
  "nome",
  "estado",
  "cidade",
  "area",
  "atividadePrincipal",
] as const;

type CampoObrigatorio = (typeof CAMPOS_OBRIGATORIOS)[number];

const MSG_LOCAL_OBRIGATORIO: Record<CampoObrigatorio, string> = {
  nome: "Informe o nome da Fazenda.",
  estado: "Selecione o Estado.",
  cidade: "Selecione o Município.",
  area: "Informe a área total da Fazenda.",
  atividadePrincipal: "Selecione a atividade principal da Fazenda.",
};

const MSG_TOAST_OBRIGATORIO: Record<CampoObrigatorio, string> = {
  nome: "Nome da Fazenda é obrigatório.",
  estado: "Estado é obrigatório.",
  cidade: "Município é obrigatório.",
  area: "Área total é obrigatória.",
  atividadePrincipal: "Atividade principal da Fazenda é obrigatória.",
};

const TOAST_ID_OBRIGATORIOS = "fazenda-campos-obrigatorios";

function fieldDomId(campo: CampoObrigatorio): string {
  return `fazenda-field-${campo}`;
}

function FieldErrorMsg({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[11px] text-red-600" role="alert">
      {message}
    </p>
  );
}

function coletarErrosObrigatorios(form: {
  nome: string;
  estado: string;
  cidade: string;
  area: string;
  atividadePrincipal: string;
}): Partial<Record<CampoObrigatorio, string>> {
  const erros: Partial<Record<CampoObrigatorio, string>> = {};
  if (!form.nome.trim()) erros.nome = MSG_LOCAL_OBRIGATORIO.nome;
  if (!form.estado) erros.estado = MSG_LOCAL_OBRIGATORIO.estado;
  if (!form.cidade) erros.cidade = MSG_LOCAL_OBRIGATORIO.cidade;
  if (!form.area.trim()) erros.area = MSG_LOCAL_OBRIGATORIO.area;
  if (!form.atividadePrincipal) erros.atividadePrincipal = MSG_LOCAL_OBRIGATORIO.atividadePrincipal;
  return erros;
}

function primeiroCampoInvalido(
  erros: Partial<Record<CampoObrigatorio, string>>,
): CampoObrigatorio | null {
  return CAMPOS_OBRIGATORIOS.find(c => !!erros[c]) ?? null;
}

function focarCampo(campo: CampoObrigatorio) {
  const el = document.getElementById(fieldDomId(campo));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  }, 250);
}

type FormState = {
  nome: string;
  sigla: string;
  responsavel: string;
  pais: string;
  estado: string;
  cidade: string;
  unidadeArea: string;
  area: string;
  areaPastagem: string;
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
  codigoSisbov: string;
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

const LISTA_FAZENDAS = "/fazendas/lista-fazendas";

const emptyForm = (): FormState => ({
  nome: "",
  sigla: "",
  responsavel: "",
  pais: "Brasil",
  estado: "",
  cidade: "",
  unidadeArea: "Hectare",
  area: "",
  areaPastagem: "",
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
  codigoSisbov: "",
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
    pais: "Brasil",
    estado: estadoUf,
    cidade: cidadeSalva,
    unidadeArea: String(fazenda.unidadeArea ?? "Hectare"),
    area: exibirAreaSalva(fazenda.area),
    areaPastagem: exibirAreaSalva(fazenda.areaPastagem),
    areaReserva: exibirAreaSalva(fazenda.areaReserva),
    areaLiquida: exibirAreaSalva(fazenda.areaLiquida),
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
    codigoSisbov: String(fazenda.codigoSisbov ?? ""),
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
    <section className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-[#4ECDC4]" style={{ fontFamily: "Inter, sans-serif", fontSize: "16px", fontWeight: 600 }}>{title}</h2>
        {description && <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
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

function parseFazendaId(search: string): number | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const idParam = new URLSearchParams(query).get("id");
  if (!idParam) return null;
  const parsed = parseInt(idParam, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function possuiComplemento(formulario: FormState): boolean {
  return Boolean(
    formulario.razaoSocial.trim()
    || formulario.cpfCnpj.trim()
    || formulario.inscricaoEstadual.trim()
    || formulario.registroIncra.trim()
    || formulario.nirf.trim()
    || formulario.numeroCar.trim()
    || formulario.matriculasImovel.some(item => item.trim())
    || formulario.tipoPosse.trim()
    || formulario.codigoSisbov.trim()
  );
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
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const fazendaId = parseFazendaId(searchString);
  const isEdit = fazendaId != null;

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
  const [errosObrigatorios, setErrosObrigatorios] = useState<
    Partial<Record<CampoObrigatorio, string>>
  >({});
  const [errosArea, setErrosArea] = useState<{ area?: string; areaPastagem?: string }>({});
  const [erroDocumento, setErroDocumento] = useState("");
  const baseRef = React.useRef("");
  const tentativaValidacao = Object.keys(errosObrigatorios).length > 0;

  const hydrationKey = isEdit ? fazendaHydrationKey(fazenda as Record<string, unknown> | undefined) : "new";

  useEffect(() => {
    setHydratedKey("");
  }, [fazendaId]);

  const lembrarBase = (proximo: FormState) => {
    baseRef.current = JSON.stringify(proximo);
  };

  useEffect(() => {
    if (isEdit) return;
    const inicial = emptyForm();
    setForm(inicial);
    lembrarBase(inicial);
    setCadastroAvancado(false);
    setCidades([]);
    setHydratedKey("new");
  }, [fazendaId, isEdit]);

  useEffect(() => {
    if (!isEdit || !fazenda || !hydrationKey) return;
    if (hydratedKey === hydrationKey) return;

    const proximo = mapFazendaToForm(fazenda as Record<string, unknown>);
    setForm(proximo);
    lembrarBase(proximo);
    setCadastroAvancado(possuiComplemento(proximo));
    setHydratedKey(hydrationKey);
  }, [isEdit, fazenda, hydrationKey, hydratedKey]);

  useEffect(() => {
    if (isEdit && !fazenda) return;
    if (!form.estado || !ufDoBrasil(form.estado)) {
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
  }, [form.pais, form.estado, form.cidade, isEdit, fazenda, hydrationKey]);

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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    if (CAMPOS_OBRIGATORIOS.includes(key as CampoObrigatorio)) {
      setErrosObrigatorios(prev => {
        if (!prev[key as CampoObrigatorio]) return prev;
        const next = { ...prev };
        delete next[key as CampoObrigatorio];
        return next;
      });
    }
  };

  const formatarAreaDigitada = (campo: "area" | "areaPastagem", valor: string) => {
    const lida = interpretarArea(valor);
    if (lida.ok && !lida.vazia) set(campo, formatarAreaPtBr(lida.centavos));
    const areas = conferirPastagem(
      campo === "area" ? valor : form.area,
      campo === "areaPastagem" ? valor : form.areaPastagem,
    );
    setErrosArea(areas.erros);
  };

  const setEstado = (v: string) => {
    setForm(f => ({ ...f, estado: v, cidade: "" }));
    setErrosObrigatorios(prev => {
      const next = { ...prev };
      delete next.estado;
      // cidade foi limpa — se já havia tentativa, marca cidade se ainda inválida
      if (prev.cidade || prev.estado) {
        // remove cidade error until next submit if cleared; keep if still invalid after change
        delete next.cidade;
      }
      return next;
    });
  };

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
    responsavel: form.responsavel || undefined,
    pais: "Brasil",
    estado: form.estado || undefined,
    cidade: form.cidade || undefined,
    unidadeArea: form.unidadeArea || "Hectare",
    area: form.area || undefined,
    areaPastagem: form.areaPastagem,
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
    codigoSisbov: form.codigoSisbov,
    razaoSocial: form.razaoSocial || undefined,
  });

  const createMutation = trpc.fazendas.create.useMutation({
    onSuccess: () => {
      utils.fazendas.list.invalidate();
      toast.success("Fazenda cadastrada com sucesso!");
      setLocation(LISTA_FAZENDAS);
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.fazendas.update.useMutation({
    onSuccess: () => {
      utils.fazendas.list.invalidate();
      if (fazendaId) utils.fazendas.get.invalidate({ id: fazendaId });
      toast.success("Fazenda atualizada!");
      setLocation(LISTA_FAZENDAS);
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const erros = coletarErrosObrigatorios(form);
    const primeiro = primeiroCampoInvalido(erros);

    if (primeiro) {
      setErrosObrigatorios(erros);
      toast.error(MSG_TOAST_OBRIGATORIO[primeiro], { id: TOAST_ID_OBRIGATORIOS });
      focarCampo(primeiro);
      return;
    }

    const areas = conferirPastagem(form.area, form.areaPastagem);
    if (areas.erros.area || areas.erros.areaPastagem) {
      setErrosArea(areas.erros);
      toast.error(areas.erros.area || areas.erros.areaPastagem || "Revise as áreas.");
      return;
    }
    const documento = documentoBrConsistente(form.cpfCnpj);
    if (documento !== true) {
      setErroDocumento(documento);
      setCadastroAvancado(true);
      toast.error(documento);
      return;
    }
    setErrosObrigatorios({});
    setErrosArea({});
    setErroDocumento("");
    if (isEdit && fazendaId) {
      updateMutation.mutate({ id: fazendaId, ...payload() });
    } else {
      createMutation.mutate(payload());
    }
  };

  const formSyncedForEdit = !isEdit || (hydratedKey === hydrationKey && hydrationKey !== "");
  const sair = async () => {
    if (JSON.stringify(form) !== baseRef.current) {
      const ok = await confirm({
        title: "Descartar alterações?",
        description: "Os dados preenchidos ainda não foram salvos.",
        confirmText: "Descartar",
        cancelText: "Continuar editando",
        variant: "warning",
      });
      if (ok !== true) return;
    }
    setLocation(LISTA_FAZENDAS);
  };

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
            onClick={() => setLocation(LISTA_FAZENDAS)}
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
      <div className="fazenda-formulario">
      <style>{`
        .fazenda-formulario, .fazenda-formulario label, .fazenda-formulario input,
        .fazenda-formulario textarea, .fazenda-formulario h1, .fazenda-formulario h2,
        .fazenda-formulario [data-slot="select-trigger"],
        .fazenda-formulario [data-slot="select-trigger"] span {
          font-family: Inter, sans-serif;
        }
        .fazenda-formulario label { font-size: 13px; font-weight: 500; }
        .fazenda-formulario input,
        .fazenda-formulario textarea,
        .fazenda-formulario [data-slot="select-trigger"],
        .fazenda-formulario [data-slot="select-trigger"] span {
          font-size: 14px;
          font-weight: 400;
        }
        .fazenda-formulario .fazenda-acao { font-size: 14px; font-weight: 600; }
        .fazenda-formulario .material-icons { font-family: "Material Icons"; }
      `}</style>
      <button
        type="button"
        onClick={() => { void sair(); }}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-gray-900" style={{ fontFamily: "Inter, sans-serif", fontSize: "24px", fontWeight: 600 }}>
              {isEdit ? "Editar Fazenda" : "Cadastrar Fazenda"}
            </h1>
            <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-2">
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
        </div>

        <div className="space-y-5">
            <FormSection
              title="Cadastro Simples"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="scroll-mt-24">
                  <FormLabel required>Nome da Fazenda</FormLabel>
                  <FormInput variant="light"
                    id={fieldDomId("nome")}
                    value={form.nome}
                    onChange={v => set("nome", v)}
                    placeholder=""
                    required
                    invalid={!!errosObrigatorios.nome}
                    aria-describedby={errosObrigatorios.nome ? "fazenda-err-nome" : undefined}
                  />
                  <FieldErrorMsg id="fazenda-err-nome" message={errosObrigatorios.nome} />
                </div>
                <div>
                  <FormLabel>Nome do Proprietário</FormLabel>
                  <FormInput variant="light" value={form.responsavel} onChange={v => set("responsavel", v)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 items-start">
                <div className="scroll-mt-24">
                  <FormLabel required>Estado</FormLabel>
                  <FormSelect variant="light"
                    id={fieldDomId("estado")}
                    value={form.estado}
                    onChange={setEstado}
                    placeholder="Selecione"
                    required
                    displayValue={estadoDisplayName}
                    invalid={!!errosObrigatorios.estado}
                    aria-describedby={errosObrigatorios.estado ? "fazenda-err-estado" : undefined}
                  >
                    {estadoOptions.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[13px]">
                        {o.label}
                      </SelectItem>
                    ))}
                  </FormSelect>
                  <FieldErrorMsg id="fazenda-err-estado" message={errosObrigatorios.estado} />
                </div>
                <div className="scroll-mt-24">
                  <FormLabel required>Município</FormLabel>
                  <FormSelect variant="light"
                    id={fieldDomId("cidade")}
                    value={form.cidade}
                    onChange={v => set("cidade", v)}
                    placeholder={municipioPlaceholder}
                    disabled={!form.estado || loadingCidades}
                    required
                    displayValue={form.cidade}
                    invalid={!!errosObrigatorios.cidade}
                    aria-describedby={errosObrigatorios.cidade ? "fazenda-err-cidade" : undefined}
                  >
                    {municipioOptions.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[13px]">
                        {o.label}
                      </SelectItem>
                    ))}
                  </FormSelect>
                  <FieldErrorMsg id="fazenda-err-cidade" message={errosObrigatorios.cidade} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="scroll-mt-24">
                  <FormLabel required>Área Total da Fazenda (ha)</FormLabel>
                  <FormInput variant="light"
                    id={fieldDomId("area")}
                    value={form.area}
                    onChange={v => {
                      set("area", v);
                      if (errosArea.area) setErrosArea(prev => ({ ...prev, area: undefined }));
                    }}
                    onBlur={v => formatarAreaDigitada("area", v)}
                    placeholder=""
                    inputMode="decimal"
                    required
                    invalid={!!errosObrigatorios.area || !!errosArea.area}
                    aria-describedby={errosObrigatorios.area || errosArea.area ? "fazenda-err-area" : undefined}
                  />
                  <FieldErrorMsg id="fazenda-err-area" message={errosObrigatorios.area || errosArea.area} />
                </div>
                <div>
                  <FormLabel>Área de Pastagem (ha)</FormLabel>
                  <FormInput variant="light"
                    value={form.areaPastagem}
                    onChange={v => {
                      set("areaPastagem", v);
                      if (errosArea.areaPastagem) setErrosArea(prev => ({ ...prev, areaPastagem: undefined }));
                    }}
                    onBlur={v => formatarAreaDigitada("areaPastagem", v)}
                    placeholder=""
                    inputMode="decimal"
                    invalid={!!errosArea.areaPastagem}
                    aria-describedby={errosArea.areaPastagem ? "fazenda-err-pastagem" : undefined}
                  />
                  <FieldErrorMsg id="fazenda-err-pastagem" message={errosArea.areaPastagem} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4 items-start">
                <div className="lg:col-span-4 scroll-mt-24">
                  <FormLabel required>Atividade Principal da Fazenda</FormLabel>
                  <FormNativeSelect variant="light"
                    id={fieldDomId("atividadePrincipal")}
                    value={form.atividadePrincipal}
                    onChange={v => set("atividadePrincipal", v)}
                    placeholder="Selecione"
                    displayValue={form.atividadePrincipal}
                    required
                    options={ATIVIDADE_PRINCIPAL_OPTIONS}
                    invalid={!!errosObrigatorios.atividadePrincipal}
                    aria-describedby={
                      errosObrigatorios.atividadePrincipal ? "fazenda-err-atividadePrincipal" : undefined
                    }
                  />
                  <FieldErrorMsg
                    id="fazenda-err-atividadePrincipal"
                    message={errosObrigatorios.atividadePrincipal}
                  />
                </div>
                <div className="lg:col-span-8">
                  <FormLabel>Endereço da Fazenda</FormLabel>
                  <FormInput variant="light" value={form.endereco} onChange={v => set("endereco", v)} />
                </div>
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
                      <FormInput variant="light" value={form.razaoSocial} onChange={v => set("razaoSocial", v)} />
                    </div>
                    <div>
                      <FormLabel>CPF/CNPJ</FormLabel>
                      <FormInput variant="light"
                        value={form.cpfCnpj}
                        onChange={v => {
                          set("cpfCnpj", formatCpfCnpj(v));
                          if (erroDocumento) setErroDocumento("");
                        }}
                        placeholder=""
                        invalid={!!erroDocumento}
                      />
                      <FieldErrorMsg id="fazenda-err-documento" message={erroDocumento} />
                    </div>
                    <div>
                      <FormLabel>Inscrição Estadual</FormLabel>
                      <FormInput variant="light" value={form.inscricaoEstadual} onChange={v => set("inscricaoEstadual", v)} placeholder="" />
                    </div>
                  </div>
                </FormSection>

                <FormSection
                  title="Documentação Rural"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div>
                      <FormLabel>Registro INCRA</FormLabel>
                      <FormInput variant="light" value={form.registroIncra} onChange={v => set("registroIncra", v)} placeholder="" />
                    </div>
                    <div>
                      <FormLabel>NIRF</FormLabel>
                      <FormInput variant="light" value={form.nirf} onChange={v => set("nirf", v)} placeholder="" />
                    </div>
                    <div>
                      <FormLabel>Número do CAR</FormLabel>
                      <FormInput variant="light" value={form.numeroCar} onChange={v => set("numeroCar", v)} placeholder="" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FormLabel>Matrícula do Imóvel</FormLabel>
                      <FormInput variant="light"
                        value={form.matriculasImovel[0] || ""}
                        onChange={v => {
                          setForm(f => ({ ...f, matriculasImovel: [v] }));
                        }}
                        placeholder=""
                      />
                    </div>
                    <div>
                      <FormLabel>Tipo de Posse</FormLabel>
                      <FormSelect variant="light" value={form.tipoPosse} onChange={v => set("tipoPosse", v)} placeholder="Selecione" displayValue={form.tipoPosse}>
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <FormLabel>Código da fazenda</FormLabel>
                      <FormInput variant="light" value={form.codigoSisbov} onChange={v => set("codigoSisbov", v)} />
                    </div>
                  </div>
                </FormSection>

                <div className="hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FormLabel>Fonte de Energia</FormLabel>
                      <FormSelect variant="light" value={form.fonteEnergia} onChange={v => set("fonteEnergia", v)} placeholder="Selecione" displayValue={form.fonteEnergia}>
                        <SelectItem value="Rede elétrica" className="text-[13px]">Rede elétrica</SelectItem>
                        <SelectItem value="Solar" className="text-[13px]">Solar</SelectItem>
                        <SelectItem value="Gerador" className="text-[13px]">Gerador</SelectItem>
                        <SelectItem value="Mista" className="text-[13px]">Mista</SelectItem>
                        <SelectItem value="Não possui" className="text-[13px]">Não possui</SelectItem>
                      </FormSelect>
                    </div>
                    <div>
                      <FormLabel>Fonte de Água</FormLabel>
                      <FormSelect variant="light" value={form.fonteAgua} onChange={v => set("fonteAgua", v)} placeholder="Selecione" displayValue={form.fonteAgua}>
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

              </div>
            )}
          </div>

          <div className="pt-1 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-h-[18px]">
              {tentativaValidacao && (
                <p className="text-[12px] text-red-600">
                  Preencha os campos obrigatórios destacados.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { void sair(); }}
                className="fazenda-acao px-6 py-2 rounded-full uppercase tracking-wide bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="fazenda-acao px-6 py-2 rounded-full uppercase tracking-wide text-gray-800 hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {isBusy ? "Salvando..." : isEdit ? "Salvar" : "Cadastrar"}
              </button>
            </div>
          </div>
      </form>
      </div>
    </AppLayout>
  );
}

export default FarmRegistrationPage;
