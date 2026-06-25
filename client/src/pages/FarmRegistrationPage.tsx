import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ESTADOS_BR, fetchCidadesPorEstado } from "@/lib/brazil-locations";
import { SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn, formatCpfCnpj } from "@/lib/utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormSelect,
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
  responsavelOperacionalFuncao: string;
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
  responsavelOperacionalFuncao: "",
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

function parseMoneyValue(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[R$\s]/g, "").replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma > -1 && lastDot > -1) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = cleaned.replace(new RegExp(`\\${thousandSep}`, "g"), "").replace(decimalSep, ".");
  } else if (lastComma > -1) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1) {
    const pieces = cleaned.split(".");
    if (pieces.length > 2) {
      normalized = pieces.join("");
    } else if (pieces[1]?.length !== 2) {
      normalized = cleaned.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoneyBRL(value: string) {
  const numeric = parseMoneyValue(value);
  if (numeric == null) return "";

  return `R$ ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)}`;
}

function moneyToPayload(value: string) {
  const amount = parseMoneyValue(value);
  if (amount == null) return undefined;
  return amount.toFixed(2);
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

function estadoNome(uf: string) {
  return ESTADOS_BR.find(e => e.uf === uf)?.nome ?? uf;
}

export function FarmRegistrationPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const searchParams = new URLSearchParams(window.location.search);
  const fazendaId = searchParams.get("id") ? parseInt(searchParams.get("id")!) : null;
  const isEdit = fazendaId != null && !isNaN(fazendaId);

  const { data: user } = trpc.auth.me.useQuery();
  const { data: fazenda, isLoading: loadingFazenda } = trpc.fazendas.get.useQuery(
    { id: fazendaId! },
    { enabled: isEdit }
  );

  const [cadastroAvancado, setCadastroAvancado] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [cidades, setCidades] = useState<string[]>([]);
  const [loadingCidades, setLoadingCidades] = useState(false);
  const loadedFazendaIdRef = useRef<number | null>(null);

  useEffect(() => {
    loadedFazendaIdRef.current = null;
    setCidades([]);
    setForm(emptyForm(user?.name || ""));
  }, [fazendaId]);

  useEffect(() => {
    if (!isEdit && user?.name) {
      setForm(f => ({ ...f, responsavel: user.name || "" }));
    }
  }, [user?.name, isEdit]);

  useEffect(() => {
    if (isEdit && fazenda && loadedFazendaIdRef.current !== fazendaId) {
      const fazendaExtra = fazenda as any;
      setForm({
        nome: fazenda.nome || "",
        sigla: fazenda.sigla || "",
        responsavel: fazenda.responsavel || "",
        pais: fazenda.pais || "Brasil",
        estado: fazenda.estado || "",
        cidade: fazenda.cidade || "",
        unidadeArea: fazenda.unidadeArea || "Hectare",
        area: str(fazenda.area),
        areaReserva: str(fazenda.areaReserva),
        areaLiquida: str(fazenda.areaLiquida),
        endereco: fazenda.endereco || "",
        atividadePrincipal: fazendaExtra.atividadePrincipal || "",
        atividadeCria: bool(fazenda.atividadeCria),
        atividadeRecria: bool(fazenda.atividadeRecria),
        atividadeEngorda: bool(fazenda.atividadeEngorda),
        atividadeConfinamento: bool(fazenda.atividadeConfinamento),
        atividadeLeite: bool(fazendaExtra.atividadeLeite),
        atividadeAgricultura: bool(fazendaExtra.atividadeAgricultura),
        atividadeOutros: bool(fazendaExtra.atividadeOutros),
        quantidadeAnimais: str(fazendaExtra.quantidadeAnimais),
        cpfCnpj: formatCpfCnpj(fazenda.cpfCnpj || ""),
        inscricaoEstadual: fazenda.inscricaoEstadual || "",
        registroIncra: fazenda.registroIncra || "",
        nirf: fazenda.nirf || "",
        numeroCar: fazendaExtra.numeroCar || "",
        matriculasImovel: parseMatriculasImovel(
          fazendaExtra.matriculasImovel,
          fazendaExtra.matriculaImovel || ""
        ).length ? parseMatriculasImovel(
          fazendaExtra.matriculasImovel,
          fazendaExtra.matriculaImovel || ""
        ) : [fazendaExtra.matriculaImovel || ""].filter(Boolean),
        tipoPosse: fazendaExtra.tipoPosse || "",
        possuiSisbov: fazenda.possuiSisbov === true ? "sim" : fazenda.possuiSisbov === false ? "nao" : "nao",
        razaoSocial: fazenda.razaoSocial || "",
        latitude: fazenda.latitude || "",
        longitude: fazenda.longitude || "",
        distanciaMunicipio: str(fazenda.distanciaMunicipio),
        valorHectare: formatMoneyBRL(str(fazenda.valorHectare)),
        fonteEnergia: "",
        fonteAgua: "",
        responsavelOperacionalNome: fazendaExtra.responsavelOperacionalNome || "",
        responsavelOperacionalTelefone: formatPhoneBR(fazendaExtra.responsavelOperacionalTelefone || ""),
        responsavelOperacionalFuncao: fazendaExtra.responsavelOperacionalFuncao || "",
        observacoes: fazenda.observacoes || "",
      });
      loadedFazendaIdRef.current = fazendaId;
    }
  }, [isEdit, fazenda, fazendaId]);

  useEffect(() => {
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
  }, [form.area, form.areaReserva, form.areaLiquida]);

  useEffect(() => {
    if (!form.estado) {
      setCidades([]);
      return;
    }
    setLoadingCidades(true);
    fetchCidadesPorEstado(form.estado)
      .then(setCidades)
      .catch(() => {
        setCidades([]);
        toast.error("Não foi possível carregar os municípios");
      })
      .finally(() => setLoadingCidades(false));
  }, [form.estado]);

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
    valorHectare: moneyToPayload(form.valorHectare),
    responsavelOperacionalNome: form.responsavelOperacionalNome || undefined,
    responsavelOperacionalTelefone: form.responsavelOperacionalTelefone || undefined,
    responsavelOperacionalFuncao: form.responsavelOperacionalFuncao || undefined,
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

  if (isEdit && loadingFazenda) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
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
                  {cadastroAvancado ? "Dados complementares visíveis" : "Dados complementares ocultos"}
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <FormLabel required>País</FormLabel>
                  <FormSelect value={form.pais} onChange={v => set("pais", v)} placeholder="Selecione" required displayValue={form.pais}>
                    <SelectItem value="Brasil" className="text-[13px]">Brasil</SelectItem>
                    <SelectItem value="Argentina" className="text-[13px]">Argentina</SelectItem>
                    <SelectItem value="Paraguai" className="text-[13px]">Paraguai</SelectItem>
                    <SelectItem value="Uruguai" className="text-[13px]">Uruguai</SelectItem>
                  </FormSelect>
                </div>
                <div>
                  <FormLabel required>Estado</FormLabel>
                  <FormSelect
                    value={form.estado}
                    onChange={v => setForm(f => ({ ...f, estado: v, cidade: "" }))}
                    placeholder="Selecione"
                    required
                    displayValue={form.estado ? estadoNome(form.estado) : ""}
                  >
                    {ESTADOS_BR.map(e => (
                      <SelectItem key={e.uf} value={e.uf} className="text-[13px]">{e.nome}</SelectItem>
                    ))}
                  </FormSelect>
                </div>
                <div>
                  <FormLabel required>Município</FormLabel>
                  <FormSelect
                    value={form.cidade}
                    onChange={v => set("cidade", v)}
                    placeholder={loadingCidades ? "Carregando..." : form.estado ? "Selecione o município" : "Selecione o estado primeiro"}
                    disabled={!form.estado || loadingCidades}
                    required
                    displayValue={form.cidade}
                  >
                    {cidades.map(c => (
                      <SelectItem key={c} value={c} className="text-[13px]">{c}</SelectItem>
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

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
                <div className="lg:col-span-4">
                  <FormLabel required>Atividade Principal da Fazenda</FormLabel>
                  <FormSelect value={form.atividadePrincipal} onChange={v => set("atividadePrincipal", v)} placeholder="Selecione" required displayValue={form.atividadePrincipal}>
                    <SelectItem value="Cria" className="text-[13px]">Cria</SelectItem>
                    <SelectItem value="Recria" className="text-[13px]">Recria</SelectItem>
                    <SelectItem value="Engorda" className="text-[13px]">Engorda</SelectItem>
                    <SelectItem value="Ciclo completo" className="text-[13px]">Ciclo completo</SelectItem>
                    <SelectItem value="Confinamento" className="text-[13px]">Confinamento</SelectItem>
                    <SelectItem value="Leite" className="text-[13px]">Leite</SelectItem>
                  </FormSelect>
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
                        onChange={v => set("valorHectare", v)}
                        placeholder="R$ 0,00"
                        type="text"
                        inputMode="decimal"
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
                      <FormInput value={form.responsavelOperacionalFuncao} onChange={v => set("responsavelOperacionalFuncao", v)} placeholder="Ex. gerente, vaqueiro, administrador" />
                    </div>
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
