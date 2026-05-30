import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ESTADOS_BR, fetchCidadesPorEstado } from "@/lib/brazil-locations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

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
  atividadeCria: boolean;
  atividadeRecria: boolean;
  atividadeEngorda: boolean;
  atividadeConfinamento: boolean;
  cpfCnpj: string;
  inscricaoEstadual: string;
  registroIncra: string;
  nirf: string;
  possuiSisbov: string;
  razaoSocial: string;
  latitude: string;
  longitude: string;
  distanciaMunicipio: string;
  valorHectare: string;
  melhoramentoGenetico: string;
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
  atividadeCria: false,
  atividadeRecria: false,
  atividadeEngorda: false,
  atividadeConfinamento: false,
  cpfCnpj: "",
  inscricaoEstadual: "",
  registroIncra: "",
  nirf: "",
  possuiSisbov: "nao",
  razaoSocial: "",
  latitude: "",
  longitude: "",
  distanciaMunicipio: "",
  valorHectare: "",
  melhoramentoGenetico: "",
});

function str(v: unknown) {
  return v != null && v !== "" ? String(v) : "";
}

function bool(v: unknown) {
  return v === true || v === 1;
}

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">
      {children}{required && <span className="text-red-500">*</span>}
    </label>
  );
}

function FieldBox({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn("bg-[#EEEEEE] border-b border-gray-300", accent && "border-l-[3px] border-l-[#4ECDC4]")}>
      {children}
    </div>
  );
}

const inputClass = "w-full bg-transparent px-3 py-2.5 text-[13px] text-gray-800 placeholder:text-gray-400 outline-none border-0 h-auto";

function FormInput({
  value,
  onChange,
  placeholder,
  type = "text",
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  accent?: boolean;
}) {
  return (
    <FieldBox accent={accent}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </FieldBox>
  );
}

function FormSelect({
  value,
  onChange,
  placeholder,
  disabled,
  accent,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FieldBox accent={accent}>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={cn(inputClass, "shadow-none rounded-none border-0 focus:ring-0 [&>svg]:opacity-60")}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {children}
        </SelectContent>
      </Select>
    </FieldBox>
  );
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

  const [cadastroAvancado, setCadastroAvancado] = useState(true);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [cidades, setCidades] = useState<string[]>([]);
  const [loadingCidades, setLoadingCidades] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isEdit && user?.name && !initialized) {
      setForm(f => ({ ...f, responsavel: user.name }));
      setInitialized(true);
    }
  }, [user, isEdit, initialized]);

  useEffect(() => {
    if (isEdit && fazenda && !initialized) {
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
        atividadeCria: bool(fazenda.atividadeCria),
        atividadeRecria: bool(fazenda.atividadeRecria),
        atividadeEngorda: bool(fazenda.atividadeEngorda),
        atividadeConfinamento: bool(fazenda.atividadeConfinamento),
        cpfCnpj: fazenda.cpfCnpj || "",
        inscricaoEstadual: fazenda.inscricaoEstadual || "",
        registroIncra: fazenda.registroIncra || "",
        nirf: fazenda.nirf || "",
        possuiSisbov: fazenda.possuiSisbov === true ? "sim" : fazenda.possuiSisbov === false ? "nao" : "nao",
        razaoSocial: fazenda.razaoSocial || "",
        latitude: fazenda.latitude || "",
        longitude: fazenda.longitude || "",
        distanciaMunicipio: str(fazenda.distanciaMunicipio),
        valorHectare: str(fazenda.valorHectare),
        melhoramentoGenetico: fazenda.melhoramentoGenetico || "",
      });
      setInitialized(true);
    }
  }, [isEdit, fazenda, initialized]);

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
    atividadeCria: form.atividadeCria,
    atividadeRecria: form.atividadeRecria,
    atividadeEngorda: form.atividadeEngorda,
    atividadeConfinamento: form.atividadeConfinamento,
    cpfCnpj: form.cpfCnpj || undefined,
    inscricaoEstadual: form.inscricaoEstadual || undefined,
    registroIncra: form.registroIncra || undefined,
    nirf: form.nirf || undefined,
    possuiSisbov: form.possuiSisbov === "sim",
    razaoSocial: form.razaoSocial || undefined,
    latitude: form.latitude || undefined,
    longitude: form.longitude || undefined,
    distanciaMunicipio: form.distanciaMunicipio || undefined,
    valorHectare: form.valorHectare || undefined,
    melhoramentoGenetico: form.melhoramentoGenetico || undefined,
  });

  const createMutation = trpc.fazendas.create.useMutation({
    onSuccess: () => {
      utils.fazendas.list.invalidate();
      toast.success("Fazenda cadastrada com sucesso!");
      setLocation("/fazendas/lista-fazendas");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.fazendas.update.useMutation({
    onSuccess: () => {
      utils.fazendas.list.invalidate();
      toast.success("Fazenda atualizada!");
      setLocation("/fazendas/lista-fazendas");
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome da fazenda é obrigatório"); return; }
    if (!form.estado) { toast.error("Estado é obrigatório"); return; }
    if (!form.cidade) { toast.error("Município é obrigatório"); return; }
    if (!form.area.trim()) { toast.error("Área total é obrigatória"); return; }
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
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-gray-600">Cadastro Avançado</span>
              <Switch
                checked={cadastroAvancado}
                onCheckedChange={setCadastroAvancado}
                className="data-[state=checked]:bg-[#4ECDC4]"
              />
            </div>
          </div>

          {/* Row 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel required>Nome da Fazenda</FormLabel>
              <FormInput value={form.nome} onChange={v => set("nome", v)} placeholder="Ex. Fazenda Santa Maria" />
            </div>
            <div>
              <FormLabel>Sigla da Fazenda</FormLabel>
              <FormInput value={form.sigla} onChange={v => set("sigla", v)} placeholder="Ex. FSM" />
            </div>
            <div>
              <FormLabel>Nome do Proprietário</FormLabel>
              <FormInput value={form.responsavel} onChange={v => set("responsavel", v)} placeholder="Nome completo" accent />
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel required>País</FormLabel>
              <FormSelect value={form.pais} onChange={v => set("pais", v)} placeholder="Selecione">
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
                placeholder={loadingCidades ? "Carregando..." : form.estado ? "Selecione um município" : "Selecione o estado"}
                disabled={!form.estado || loadingCidades}
              >
                {cidades.map(c => (
                  <SelectItem key={c} value={c} className="text-[13px]">{c}</SelectItem>
                ))}
              </FormSelect>
            </div>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <FormLabel required>Unidade de Medida da Área</FormLabel>
              <FormSelect value={form.unidadeArea} onChange={v => set("unidadeArea", v)} placeholder="Selecione">
                <SelectItem value="Hectare" className="text-[13px]">Hectare</SelectItem>
                <SelectItem value="Alqueire" className="text-[13px]">Alqueire</SelectItem>
                <SelectItem value="Metro²" className="text-[13px]">Metro²</SelectItem>
              </FormSelect>
            </div>
            <div>
              <FormLabel required>Área Total da Fazenda</FormLabel>
              <FormInput value={form.area} onChange={v => set("area", v)} placeholder="0" type="number" />
            </div>
            <div>
              <FormLabel required>Área de Reserva</FormLabel>
              <FormInput value={form.areaReserva} onChange={v => set("areaReserva", v)} placeholder="0" type="number" />
            </div>
            <div>
              <FormLabel>Área Líquida da Fazenda</FormLabel>
              <FormInput value={form.areaLiquida} onChange={v => set("areaLiquida", v)} placeholder="0" type="number" accent />
            </div>
          </div>

          {/* Row 4 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
            <div className="lg:col-span-8">
              <FormLabel>Endereço da Fazenda</FormLabel>
              <FormInput value={form.endereco} onChange={v => set("endereco", v)} placeholder="Rodovia, km, referência..." />
            </div>
            <div className="lg:col-span-4">
              <FormLabel>Atividades</FormLabel>
              <div className="bg-[#EEEEEE] border-b border-gray-300 px-3 py-2.5 flex flex-wrap gap-x-4 gap-y-2">
                {([
                  ["atividadeCria", "Cria"],
                  ["atividadeRecria", "Recria"],
                  ["atividadeEngorda", "Engorda"],
                  ["atividadeConfinamento", "Confinamento"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1.5 text-[12px] text-gray-700 cursor-pointer">
                    <Checkbox
                      checked={form[key]}
                      onCheckedChange={v => set(key, v === true)}
                      className="data-[state=checked]:bg-[#4ECDC4] data-[state=checked]:border-[#4ECDC4]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Advanced fields */}
          {cadastroAvancado && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <FormLabel>CPF/CNPJ</FormLabel>
                  <FormInput value={form.cpfCnpj} onChange={v => set("cpfCnpj", v)} placeholder="000.000.000-00" />
                </div>
                <div>
                  <FormLabel>Inscrição Estadual</FormLabel>
                  <FormInput value={form.inscricaoEstadual} onChange={v => set("inscricaoEstadual", v)} placeholder="" />
                </div>
                <div>
                  <FormLabel>Registro Incra</FormLabel>
                  <FormInput value={form.registroIncra} onChange={v => set("registroIncra", v)} placeholder="" />
                </div>
                <div>
                  <FormLabel>NIRF (Receita Federal)</FormLabel>
                  <FormInput value={form.nirf} onChange={v => set("nirf", v)} placeholder="" />
                </div>
              </div>

              <div className="mb-4">
                <FormLabel>Possui SISBOV</FormLabel>
                <div className="bg-[#EEEEEE] border-b border-gray-300 px-3 py-2.5">
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="sm:col-span-1">
                  <FormLabel>Razão Social</FormLabel>
                  <FormInput value={form.razaoSocial} onChange={v => set("razaoSocial", v)} placeholder="" />
                </div>
                <div>
                  <FormLabel>Latitude</FormLabel>
                  <FormInput value={form.latitude} onChange={v => set("latitude", v)} placeholder="-16.6869" />
                </div>
                <div>
                  <FormLabel>Longitude</FormLabel>
                  <FormInput value={form.longitude} onChange={v => set("longitude", v)} placeholder="-49.2648" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <FormLabel>Distância da sede do município (Km)</FormLabel>
                  <FormInput value={form.distanciaMunicipio} onChange={v => set("distanciaMunicipio", v)} placeholder="0" type="number" />
                </div>
                <div>
                  <FormLabel>Valor do hectare</FormLabel>
                  <FormInput value={form.valorHectare} onChange={v => set("valorHectare", v)} placeholder="0,00" type="number" />
                </div>
              </div>

              <div className="mb-4">
                <FormLabel>Melhoramento genético</FormLabel>
                <div className="border border-gray-200 rounded-sm bg-[#FAFAFA] p-3 min-h-[80px]">
                  <textarea
                    value={form.melhoramentoGenetico}
                    onChange={e => set("melhoramentoGenetico", e.target.value)}
                    placeholder="Informações sobre programas de melhoramento genético..."
                    className="w-full bg-transparent text-[13px] text-gray-800 placeholder:text-gray-400 outline-none resize-none min-h-[60px]"
                    rows={3}
                  />
                </div>
              </div>
            </>
          )}

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/fazendas/lista-fazendas")}
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
