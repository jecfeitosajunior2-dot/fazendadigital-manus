import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SelectItem } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormSelect,
  FormTextarea,
  FormYearPicker,
  FormDatePicker,
  FieldBox,
} from "@/components/FormFields";
import { TIPOS_MAQUINA, MARCAS_MAQUINA } from "@/lib/maquina-types";

type ImageSlot =
  | { kind: "empty" }
  | { kind: "preview"; url: string; existingPath?: string }
  | { kind: "file"; file: File; previewUrl: string };

type FormState = {
  tipo: string;
  fazendaId: string;
  apelido: string;
  valor: string;
  marca: string;
  modelo: string;
  placa: string;
  anoFabricacao: string;
  anoAquisicao: string;
  vidaUtil: string;
  dataDesativacao: string;
  estado: "novo" | "usado";
  observacoes: string;
};

const emptyForm = (): FormState => ({
  tipo: "",
  fazendaId: "",
  apelido: "",
  valor: "",
  marca: "",
  modelo: "",
  placa: "",
  anoFabricacao: "",
  anoAquisicao: "",
  vidaUtil: "",
  dataDesativacao: "",
  estado: "novo",
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
          hasImage ? "border-gray-300 bg-gray-50" : "border-gray-300 hover:border-[#4ECDC4] hover:bg-gray-50/50"
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
              <span className="text-white text-[10px] font-medium bg-black/50 px-2 py-1 rounded">Alterar</span>
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
        >
          <span className="material-icons text-[12px]">close</span>
        </button>
      )}
    </div>
  );
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
      <RadioGroup value={value} onValueChange={onChange} className="flex flex-wrap gap-4 px-3 py-2.5 min-h-[42px] items-center">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer">
            <RadioGroupItem value={opt.value} className="border-gray-400 text-[#4ECDC4]" />
            {opt.label}
          </label>
        ))}
      </RadioGroup>
    </FieldBox>
  );
}

function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
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
    { enabled: isEdit }
  );

  // Mapa id → nome para exibir o nome da fazenda no Select (não o ID bruto)
  const fazendaMap = useMemo(
    () => new Map(fazendas.map(f => [f.id, f.nome])),
    [fazendas]
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
  ]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isEdit && maquina && !initialized) {
      // Converte valor decimal do banco → string de centavos para formatCurrencyBrl
      const valorCents = maquina.valor
        ? Math.round(parseFloat(parseFloat(String(maquina.valor)).toFixed(2)) * 100)
        : 0;

      setForm({
        tipo: maquina.tipo || "",
        fazendaId: maquina.fazendaId != null ? String(maquina.fazendaId) : "",
        apelido: maquina.nome || "",
        valor: valorCents > 0 ? formatCurrencyBrl(String(valorCents)) : "",
        marca: maquina.marca || "",
        modelo: maquina.modelo || "",
        placa: maquina.placa || "",
        anoFabricacao: maquina.ano ? String(maquina.ano) : "",
        anoAquisicao: maquina.anoAquisicao ? String(maquina.anoAquisicao) : "",
        vidaUtil: maquina.vidaUtil || "",
        dataDesativacao: toDateInput(maquina.dataDesativacao),
        estado: maquina.estado === "usado" ? "usado" : "novo",
        observacoes: maquina.observacoes || "",
      });
      setImageSlots(
        [maquina.imagem1, maquina.imagem2, maquina.imagem3].map(path =>
          path
            ? { kind: "preview" as const, url: path, existingPath: path }
            : { kind: "empty" as const }
        )
      );
      setInitialized(true);
    }
  }, [isEdit, maquina, initialized]);

  const createMutation = trpc.maquinas.create.useMutation({
    onSuccess: () => {
      utils.maquinas.list.invalidate();
      toast.success("Maquinário cadastrado!");
      setLocation("/maquinas/lista-maquinas");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.maquinas.update.useMutation({
    onSuccess: () => {
      utils.maquinas.list.invalidate();
      toast.success("Maquinário atualizado!");
      setLocation("/maquinas/lista-maquinas");
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

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
      else if (slot.kind === "preview" && slot.existingPath) payload.push({ type: "keep", path: slot.existingPath });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tipo.trim()) { toast.error("Selecione o tipo de máquina"); return; }
    const fazendaIdNum = form.fazendaId ? parseInt(form.fazendaId, 10) : NaN;
    if (!form.fazendaId || isNaN(fazendaIdNum)) { toast.error("Selecione uma fazenda"); return; }
    if (!form.marca.trim()) { toast.error("Selecione a marca"); return; }

    const payload = {
      fazendaId: fazendaIdNum,
      nome: form.apelido.trim() || undefined,
      tipo: form.tipo.trim(),
      marca: form.marca.trim(),
      modelo: form.modelo.trim() || undefined,
      placa: form.placa.trim() || undefined,
      ano: form.anoFabricacao.trim() ? parseInt(form.anoFabricacao, 10) : undefined,
      anoAquisicao: form.anoAquisicao.trim() ? parseInt(form.anoAquisicao, 10) : undefined,
      valor: parseCurrencyBrl(form.valor) || undefined,
      vidaUtil: form.vidaUtil.trim() || undefined,
      dataDesativacao: form.dataDesativacao || undefined,
      estado: form.estado,
      observacoes: form.observacoes.trim() || undefined,
      imageSlots: await buildImageSlotsPayload(),
    };

    if (isEdit && maquinaId) updateMutation.mutate({ id: maquinaId, ...payload });
    else createMutation.mutate(payload);
  };

  if (isEdit && loadingMaquina) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <h1
            className="text-[16px] font-semibold text-gray-800 mb-5 pb-4 border-b border-gray-100"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {isEdit ? "Editar maquinário" : "Cadastro de maquinário"}
          </h1>

          <div className="mb-6">
            <p className="text-[11px] text-gray-600 mb-3">
              Selecione até três fotos para seu maquinário
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

          {/* Linha 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel required>Tipo</FormLabel>
              <FormSelect
                value={form.tipo}
                onChange={v => set("tipo", v)}
                placeholder="Selecione um tipo de máquina"
                required
              >
                {TIPOS_MAQUINA.map(t => (
                  <SelectItem key={t} value={t} className="text-[12px]">{t}</SelectItem>
                ))}
              </FormSelect>
            </div>
            <div>
              <FormLabel required>Fazenda</FormLabel>
              <FormSelect
                value={form.fazendaId}
                displayValue={
                  form.fazendaId
                    ? fazendaMap.get(parseInt(form.fazendaId)) ?? form.fazendaId
                    : undefined
                }
                onChange={v => set("fazendaId", v)}
                placeholder="Selecione uma fazenda"
                required
              >
                {fazendas.length === 0 ? (
                  <SelectItem value="__none__" disabled className="text-[12px] text-gray-400">
                    Nenhuma fazenda cadastrada
                  </SelectItem>
                ) : (
                  fazendas.map(f => (
                    <SelectItem key={f.id} value={String(f.id)} className="text-[12px]">
                      {f.nome}
                    </SelectItem>
                  ))
                )}
              </FormSelect>
            </div>
            <div>
              <FormLabel>Apelido</FormLabel>
              <FormInput
                value={form.apelido}
                onChange={v => set("apelido", v)}
                placeholder="Digite um nome para a máquina"
              />
            </div>
          </div>

          {/* Linha 2 — Valor (sem combustível / unidade de medição) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel>Valor</FormLabel>
              <FormInput
                value={form.valor}
                onChange={v => set("valor", formatCurrencyBrl(v))}
                placeholder="R$ 0,00"
              />
            </div>
          </div>

          {/* Linha 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel required>Marca</FormLabel>
              <FormSelect
                value={form.marca}
                onChange={v => set("marca", v)}
                placeholder="Selecione a marca da máquina"
                required
              >
                {MARCAS_MAQUINA.map(m => (
                  <SelectItem key={m} value={m} className="text-[12px]">{m}</SelectItem>
                ))}
              </FormSelect>
            </div>
            <div>
              <FormLabel>Modelo</FormLabel>
              <FormInput
                value={form.modelo}
                onChange={v => set("modelo", v)}
                placeholder="Digite o modelo da máquina"
              />
            </div>
            <div>
              <FormLabel>Placa ou nº de série</FormLabel>
              <FormInput
                value={form.placa}
                onChange={v => set("placa", v)}
                placeholder="Placa do veículo ou nº de série da máquina"
              />
            </div>
          </div>

          {/* Linha 4 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel>Ano de Fabricação</FormLabel>
              <FormYearPicker
                value={form.anoFabricacao}
                onChange={v => set("anoFabricacao", v)}
                placeholder="Selecione o ano de fabricação"
              />
            </div>
            <div>
              <FormLabel>Ano de Aquisição</FormLabel>
              <FormYearPicker
                value={form.anoAquisicao}
                onChange={v => set("anoAquisicao", v)}
                placeholder="Selecione o ano de aquisição"
              />
            </div>
            <div>
              <FormLabel>Vida útil</FormLabel>
              <FormInput
                value={form.vidaUtil}
                onChange={v => set("vidaUtil", v)}
                placeholder="Ex: 10 anos"
              />
            </div>
          </div>

          {/* Linha 5 — sem porcentagem utilizada na atividade */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel>Data de Desativação</FormLabel>
              <FormDatePicker
                value={form.dataDesativacao}
                onChange={v => set("dataDesativacao", v)}
                placeholder="Selecione a data de desativação"
              />
            </div>
            <div>
              <FormLabel>Estado</FormLabel>
              <FormRadioGroup
                value={form.estado}
                onChange={v => set("estado", v as "novo" | "usado")}
                options={[
                  { value: "novo", label: "Novo" },
                  { value: "usado", label: "Usado" },
                ]}
              />
            </div>
          </div>

          <div className="mb-6">
            <FormLabel>Observações</FormLabel>
            <FormTextarea
              value={form.observacoes}
              onChange={v => set("observacoes", v)}
              placeholder="Descreva seu maquinário"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/maquinas/lista-maquinas")}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : "Salvar maquinário"}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { MaquinaRegistrationPage };
