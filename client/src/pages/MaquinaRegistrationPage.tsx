import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormTextarea,
  FormYearPicker,
  FormDatePicker,
  FieldBox,
} from "@/components/FormFields";
import {
  TIPOS_MAQUINA,
  getMarcasPorTipo,
  TIPOS_MEDIDOR,
  TIPOS_MEDIDOR_LABEL,
  sugerirTipoMedidor,
  labelIdentificadorMaquina,
  type TipoMedidor,
} from "@/lib/maquina-types";

type ImageSlot =
  | { kind: "empty" }
  | { kind: "preview"; url: string; existingPath?: string }
  | { kind: "file"; file: File; previewUrl: string };

type FormState = {
  tipo: string;
  fazendaId: string;
  nome: string;
  valor: string;
  marca: string;
  modelo: string;
  placa: string;
  anoFabricacao: string;
  dataAquisicao: string;
  vidaUtil: string;
  estado: "novo" | "usado";
  tipoMedidor: TipoMedidor | "";
  leituraInicial: string;
  observacoes: string;
};

const emptyForm = (): FormState => ({
  tipo: "",
  fazendaId: "",
  nome: "",
  valor: "",
  marca: "",
  modelo: "",
  placa: "",
  anoFabricacao: "",
  dataAquisicao: "",
  vidaUtil: "",
  estado: "novo",
  tipoMedidor: "",
  leituraInicial: "",
  observacoes: "",
});

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toDateInput(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function FormRadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <FieldBox variant="light">
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="flex flex-wrap gap-4 px-3 py-2.5 min-h-[42px] items-center"
      >
        {options.map(opt => (
          <label
            key={opt.value}
            className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer"
          >
            <RadioGroupItem value={opt.value} className="border-gray-400 text-[#4ECDC4]" />
            {opt.label}
          </label>
        ))}
      </RadioGroup>
    </FieldBox>
  );
}

function ImageUploadSlot({
  slot,
  onSelect,
  onRemove,
}: {
  slot: ImageSlot;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const hasImage = slot.kind !== "empty";

  return (
    <div className="relative flex-1 min-w-0">
      <label
        className={cn(
          "flex flex-col items-center justify-center h-[120px] border border-dashed rounded cursor-pointer transition-colors",
          hasImage
            ? "border-gray-300 bg-gray-50"
            : "border-gray-300 hover:border-[#4ECDC4] hover:bg-gray-50/50",
        )}
      >
        {hasImage ? (
          <>
            <img
              src={slot.kind === "file" ? slot.previewUrl : slot.url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover rounded"
            />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/30 rounded transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
              <span className="text-white text-[10px] font-medium bg-black/50 px-2 py-1 rounded">
                Alterar
              </span>
            </div>
          </>
        ) : (
          <>
            <span className="material-icons text-[28px] text-gray-400 mb-1">file_upload</span>
            <span className="text-[10px] text-gray-500 text-center px-2">Selecione uma imagem</span>
          </>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) {
              if (!file.type.startsWith("image/")) {
                toast.error("Selecione um arquivo de imagem válido.");
                return;
              }
              if (file.size > 5 * 1024 * 1024) {
                toast.error("Imagem deve ter no máximo 5 MB");
                return;
              }
              onSelect(file);
            }
            e.target.value = "";
          }}
        />
      </label>
      {hasImage && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm hover:bg-red-600 z-10"
          aria-label="Remover foto"
        >
          <span className="material-icons text-[12px]">close</span>
        </button>
      )}
    </div>
  );
}

export default function MaquinaRegistrationPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const searchParams = new URLSearchParams(window.location.search);
  const maquinaId = searchParams.get("id") ? parseInt(searchParams.get("id")!) : null;
  const isEdit = maquinaId != null && !isNaN(maquinaId);

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: maquina, isLoading: loadingMaquina } = trpc.maquinas.get.useQuery(
    { id: maquinaId! },
    { enabled: isEdit },
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
  ]);
  const initializedForId = useRef<number | null>(null);
  const hojeISO = new Date().toISOString().slice(0, 10);
  const anoAtual = new Date().getFullYear();

  useEffect(() => {
    if (!isEdit || !maquina) return;
    if (initializedForId.current === maquina.id) return;

    const valorCents = maquina.valor
      ? Math.round(parseFloat(parseFloat(String(maquina.valor)).toFixed(2)) * 100)
      : 0;

    const tipoMedidorRaw = String(maquina.tipoMedidor || "");
    const tipoMedidor: TipoMedidor | "" = TIPOS_MEDIDOR.includes(tipoMedidorRaw as TipoMedidor)
      ? (tipoMedidorRaw as TipoMedidor)
      : maquina.tipo
        ? sugerirTipoMedidor(maquina.tipo)
        : "";

    let dataAquisicao = toDateInput(maquina.dataAquisicao);
    if (!dataAquisicao && maquina.anoAquisicao) {
      dataAquisicao = `${maquina.anoAquisicao}-01-01`;
    }

    setForm({
      tipo: maquina.tipo || "",
      fazendaId: maquina.fazendaId != null ? String(maquina.fazendaId) : "",
      nome: maquina.nome || "",
      valor: valorCents > 0 ? formatCurrencyBrl(String(valorCents)) : "",
      marca: maquina.marca || "",
      modelo: maquina.modelo || "",
      placa: maquina.placa || "",
      anoFabricacao: maquina.ano ? String(maquina.ano) : "",
      dataAquisicao,
      vidaUtil: maquina.vidaUtil ? String(maquina.vidaUtil).replace(/[^\d]/g, "") : "",
      estado: maquina.estado === "usado" ? "usado" : "novo",
      tipoMedidor,
      leituraInicial: maquina.horimetro ? String(maquina.horimetro) : "",
      observacoes: maquina.observacoes || "",
    });
    setImageSlots(
      [maquina.imagem1, maquina.imagem2, maquina.imagem3].map(path =>
        path
          ? { kind: "preview" as const, url: path, existingPath: path }
          : { kind: "empty" as const },
      ),
    );
    initializedForId.current = maquina.id;
  }, [isEdit, maquina]);

  const createMutation = trpc.maquinas.create.useMutation({
    onSuccess: () => {
      utils.maquinas.list.invalidate();
      toast.success("Máquina cadastrada com sucesso.");
      setLocation("/maquinas/visao-geral");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.maquinas.update.useMutation({
    onSuccess: () => {
      utils.maquinas.list.invalidate();
      toast.success("Máquina atualizada com sucesso.");
      setLocation("/maquinas/visao-geral");
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const marcasDoTipo = form.tipo ? getMarcasPorTipo(form.tipo) : [];
  const marcasOptions = useMemo(() => {
    const base = [...marcasDoTipo];
    if (!base.includes("Outra marca") && !base.includes("Outra")) {
      base.push("Outra marca");
    }
    if (form.marca && !base.includes(form.marca)) {
      base.unshift(form.marca);
    }
    return base;
  }, [marcasDoTipo, form.marca]);

  const handleTipoChange = (novoTipo: string) => {
    const sugerido = sugerirTipoMedidor(novoTipo);
    setForm(f => ({
      ...f,
      tipo: novoTipo,
      marca: "",
      tipoMedidor: sugerido,
      leituraInicial: sugerido === "sem_medidor" ? "" : f.leituraInicial,
    }));
  };

  const handleMedidorChange = (v: string) => {
    const medidor = v as TipoMedidor;
    setForm(f => ({
      ...f,
      tipoMedidor: medidor,
      leituraInicial: "",
    }));
  };

  const setImageAt = (index: number, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setImageSlots(slots => {
      const next = [...slots];
      const prev = next[index];
      if (prev.kind === "file") URL.revokeObjectURL(prev.previewUrl);
      next[index] = { kind: "file", file, previewUrl };
      return next;
    });
  };

  const removeImageAt = (index: number) => {
    setImageSlots(slots => {
      const next = [...slots];
      const prev = next[index];
      if (prev.kind === "file") URL.revokeObjectURL(prev.previewUrl);
      next[index] = { kind: "empty" };
      return next;
    });
  };

  const buildImageSlotsPayload = async () => {
    const payload: (
      | { type: "empty" }
      | { type: "keep"; path: string }
      | { type: "new"; data: string; mimeType: string }
    )[] = [];

    for (const slot of imageSlots) {
      if (slot.kind === "empty") payload.push({ type: "empty" });
      else if (slot.kind === "preview" && slot.existingPath)
        payload.push({ type: "keep", path: slot.existingPath });
      else if (slot.kind === "file") {
        payload.push({
          type: "new",
          data: await readFileAsBase64(slot.file),
          mimeType: slot.file.type,
        });
      } else payload.push({ type: "empty" });
    }

    return payload as [
      { type: "empty" } | { type: "keep"; path: string } | { type: "new"; data: string; mimeType: string },
      { type: "empty" } | { type: "keep"; path: string } | { type: "new"; data: string; mimeType: string },
      { type: "empty" } | { type: "keep"; path: string } | { type: "new"; data: string; mimeType: string },
    ];
  };

  const precisaLeitura =
    form.tipoMedidor === "horimetro" || form.tipoMedidor === "quilometragem";

  const leituraNum = form.leituraInicial.trim()
    ? parseFloat(form.leituraInicial.replace(",", "."))
    : null;
  const leituraInvalida =
    precisaLeitura &&
    (form.leituraInicial.trim() === "" ||
      leituraNum == null ||
      Number.isNaN(leituraNum) ||
      leituraNum < 0);

  const valorNum = form.valor.trim() ? parseCurrencyBrl(form.valor) : null;
  const valorInvalido = form.valor.trim() !== "" && (valorNum == null || valorNum < 0);

  const vidaNum = form.vidaUtil.trim() ? parseInt(form.vidaUtil.replace(/[^\d]/g, ""), 10) : null;
  const vidaInvalida =
    form.vidaUtil.trim() !== "" && (vidaNum == null || Number.isNaN(vidaNum) || vidaNum <= 0);

  const anoFab = form.anoFabricacao.trim() ? parseInt(form.anoFabricacao, 10) : null;
  const anoFabInvalido =
    form.anoFabricacao.trim() !== "" &&
    (anoFab == null || Number.isNaN(anoFab) || anoFab > anoAtual || anoFab < 1900);

  const dataAqFutura = !!form.dataAquisicao && form.dataAquisicao > hojeISO;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;

    const fazendaIdNum = parseInt(form.fazendaId, 10);
    if (!form.nome.trim()) {
      toast.error("Informe o nome de identificação");
      return;
    }
    if (!form.tipo.trim()) {
      toast.error("Selecione o tipo de máquina");
      return;
    }
    if (!form.fazendaId || isNaN(fazendaIdNum)) {
      toast.error("Selecione uma fazenda");
      return;
    }
    if (!form.marca.trim()) {
      toast.error("Selecione a marca");
      return;
    }
    if (!form.tipoMedidor) {
      toast.error("Selecione o tipo de medidor");
      return;
    }
    if (leituraInvalida) {
      toast.error(
        form.tipoMedidor === "quilometragem"
          ? "Informe a quilometragem inicial"
          : "Informe o horímetro inicial",
      );
      return;
    }
    if (valorInvalido) {
      toast.error("Valor de aquisição não pode ser negativo");
      return;
    }
    if (vidaInvalida) {
      toast.error("Vida útil estimada deve ser um número positivo");
      return;
    }
    if (anoFabInvalido) {
      toast.error("Ano de fabricação inválido");
      return;
    }
    if (dataAqFutura) {
      toast.error("Data de aquisição não pode ser futura");
      return;
    }

    if (form.dataAquisicao && anoFab && parseInt(form.dataAquisicao.slice(0, 4), 10) < anoFab) {
      toast.warning("A data de aquisição é anterior ao ano de fabricação. Confira se está correto.");
    }

    const placaNorm = form.placa.trim().replace(/\s+/g, "").toUpperCase();

    const basePayload = {
      nome: form.nome.trim(),
      modelo: form.modelo.trim() || undefined,
      placa: placaNorm || undefined,
      ano: form.anoFabricacao.trim() ? parseInt(form.anoFabricacao, 10) : undefined,
      dataAquisicao: form.dataAquisicao || undefined,
      valor: valorNum != null && valorNum >= 0 ? String(valorNum) : undefined,
      vidaUtil: form.vidaUtil.trim() || undefined,
      estado: form.estado,
      tipoMedidor: form.tipoMedidor as TipoMedidor,
      horimetro:
        form.tipoMedidor === "sem_medidor"
          ? undefined
          : form.leituraInicial.trim().replace(",", ".") || undefined,
      observacoes: form.observacoes.trim() || undefined,
      imageSlots: await buildImageSlotsPayload(),
      tipo: form.tipo.trim(),
      marca: form.marca.trim(),
      fazendaId: fazendaIdNum,
    };

    if (isEdit && maquinaId) {
      updateMutation.mutate({ id: maquinaId, ...basePayload });
    } else {
      createMutation.mutate(basePayload);
    }
  };

  const camposVazios =
    isEdit && maquina
      ? [
          !form.tipo && "Tipo",
          !form.fazendaId && "Fazenda",
          !form.marca && "Marca",
          !form.nome.trim() && "Nome de identificação",
          !form.tipoMedidor && "Tipo de medidor",
        ].filter(Boolean)
      : [];

  const labelIdent = labelIdentificadorMaquina(form.tipo);
  const medidorComLeitura = precisaLeitura;

  if (isEdit && loadingMaquina) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          Carregando...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation("/maquinas/visao-geral")}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <h1
            className="text-[16px] font-semibold text-gray-800 mb-5 pb-4 border-b border-gray-100"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {isEdit ? "Editar máquina" : "Cadastrar máquina"}
          </h1>

          {camposVazios.length > 0 && (
            <div className="mb-5 flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded text-[12px] text-amber-800">
              <span className="material-icons text-[16px] text-amber-500 mt-0.5 shrink-0">info</span>
              <span>
                Esta máquina não possui <strong>{camposVazios.join(", ")}</strong> registrado
                {camposVazios.length > 1 ? "s" : ""}. Complete os campos e salve para atualizar o
                cadastro.
              </span>
            </div>
          )}

          <div className="mb-6">
            <p className="text-[11px] text-gray-600 mb-3">
              Selecione até três fotos para sua máquina
            </p>
            <div className="flex gap-3">
              {imageSlots.map((slot, i) => (
                <ImageUploadSlot
                  key={i}
                  slot={slot}
                  onSelect={file => setImageAt(i, file)}
                  onRemove={() => removeImageAt(i)}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <FormLabel required>Nome de identificação</FormLabel>
              <FormInput
                value={form.nome}
                onChange={v => set("nome", v)}
                placeholder="Ex.: Trator 01, S10 Fazenda, Gerador Galpão"
                required
              />
            </div>
            <div>
              <FormLabel required>Tipo</FormLabel>
              <FormNativeSelect
                value={form.tipo}
                onChange={handleTipoChange}
                placeholder="Selecione um tipo de máquina"
                required
                options={TIPOS_MAQUINA.map(t => ({ value: t, label: t }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <FormLabel required>Fazenda</FormLabel>
              <FormNativeSelect
                value={form.fazendaId}
                onChange={v => set("fazendaId", v)}
                placeholder="Selecione uma fazenda"
                required
                options={fazendas.map(f => ({ value: String(f.id), label: f.nome }))}
              />
            </div>
            <div>
              <FormLabel required>Marca</FormLabel>
              <FormNativeSelect
                value={form.marca}
                onChange={v => set("marca", v)}
                placeholder={form.tipo ? "Selecione a marca" : "Selecione primeiro o tipo"}
                required
                disabled={!form.tipo}
                options={marcasOptions.map(m => ({ value: m, label: m }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <FormLabel>Modelo</FormLabel>
              <FormInput
                value={form.modelo}
                onChange={v => set("modelo", v)}
                placeholder="Digite o modelo da máquina"
              />
            </div>
            <div>
              <FormLabel>{labelIdent}</FormLabel>
              <FormInput
                value={form.placa}
                onChange={v => set("placa", v)}
                placeholder={labelIdent}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <FormLabel>Ano de fabricação</FormLabel>
              <FormYearPicker
                value={form.anoFabricacao}
                onChange={v => set("anoFabricacao", v)}
                placeholder="Selecione o ano de fabricação"
              />
            </div>
            <div>
              <FormLabel>Data de aquisição</FormLabel>
              <FormDatePicker
                value={form.dataAquisicao}
                onChange={v => set("dataAquisicao", v)}
                placeholder="DD/MM/AAAA"
                max={hojeISO}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <FormLabel>Condição de aquisição</FormLabel>
              <FormRadioGroup
                value={form.estado}
                onChange={v => set("estado", v as "novo" | "usado")}
                options={[
                  { value: "novo", label: "Nova" },
                  { value: "usado", label: "Usada" },
                ]}
              />
            </div>
            <div>
              <FormLabel>Valor de aquisição (R$)</FormLabel>
              <FormInput
                value={form.valor}
                onChange={v => set("valor", formatCurrencyBrl(v))}
                placeholder="R$ 150.000,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <FormLabel>Vida útil estimada (anos)</FormLabel>
              <FormInput
                value={form.vidaUtil}
                onChange={v => set("vidaUtil", v.replace(/[^\d]/g, "").slice(0, 3))}
                placeholder="Ex.: 10"
                inputMode="numeric"
              />
            </div>
            <div>
              <FormLabel required>Tipo de medidor</FormLabel>
              <FormNativeSelect
                value={form.tipoMedidor}
                onChange={handleMedidorChange}
                placeholder="Selecione o tipo de medidor"
                required
                options={TIPOS_MEDIDOR.map(t => ({
                  value: t,
                  label: TIPOS_MEDIDOR_LABEL[t],
                }))}
              />
            </div>
          </div>

          {medidorComLeitura && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <FormLabel required>
                  {form.tipoMedidor === "quilometragem"
                    ? "Quilometragem inicial"
                    : "Horímetro inicial"}
                </FormLabel>
                <div className="relative">
                  <FormInput
                    value={form.leituraInicial}
                    onChange={v => set("leituraInicial", v.replace(/[^\d.,]/g, ""))}
                    placeholder={
                      form.tipoMedidor === "quilometragem" ? "Ex.: 82.450" : "Ex.: 1.250,5"
                    }
                    className="pr-10"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-500 pointer-events-none">
                    {form.tipoMedidor === "quilometragem" ? "km" : "h"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {!isEdit && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-[11px] font-semibold text-gray-700">Status</span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                Ativa
              </span>
            </div>
          )}

          <div className="mb-6">
            <FormLabel>Observações</FormLabel>
            <FormTextarea
              value={form.observacoes}
              onChange={v => set("observacoes", v)}
              placeholder="Informações adicionais sobre esta máquina"
              rows={3}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/maquinas/visao-geral")}
              disabled={isBusy}
              className="w-full sm:w-auto px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="w-full sm:w-auto px-8 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { MaquinaRegistrationPage };
