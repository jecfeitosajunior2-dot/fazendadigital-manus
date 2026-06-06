import React, { useEffect, useRef, useState } from "react";
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
import { TIPOS_MAQUINA, getMarcasPorTipo } from "@/lib/maquina-types";

// Marcas extras aceitas livremente (para tipos sem mapeamento ou marcas não listadas)
const MARCAS_EXTRAS_LIVRES = [
  'JCB', 'Caterpillar', 'Komatsu', 'Jacto', 'Stara',
  'Agrale', 'Santal', 'Lely', 'CLAAS', 'Challenger', 'CNH',
];

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

  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
  ]);

  // Ref que rastreia qual maquina.id foi inicializado por último — corrige o caso
  // em que Wouter reutiliza o componente ao navegar entre ?id= diferentes.
  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (!isEdit || !maquina) return;
    if (initializedForId.current === maquina.id) return;

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
    initializedForId.current = maquina.id;
  }, [isEdit, maquina]);

  const createMutation = trpc.maquinas.create.useMutation({
    onSuccess: () => {
      utils.maquinas.list.invalidate();
      toast.success("Maquinário cadastrado!");
      setLocation("/maquinas/visao-geral");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.maquinas.update.useMutation({
    onSuccess: () => {
      utils.maquinas.list.invalidate();
      toast.success("Maquinário atualizado!");
      setLocation("/maquinas/visao-geral");
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  // Marcas disponíveis para o tipo atualmente selecionado.
  // Se o tipo tiver mapeamento, usa EXCLUSIVAMENTE as marcas daquele tipo.
  // Se não tiver mapeamento (tipo vazio ou legado), exibe marcas extras livres.
  const marcasDoTipo = form.tipo
    ? getMarcasPorTipo(form.tipo)
    : MARCAS_EXTRAS_LIVRES;

  // Ao trocar o tipo, limpa a marca se o valor atual não for válido para o novo tipo
  const handleTipoChange = (novoTipo: string) => {
    const marcasNovoTipo = getMarcasPorTipo(novoTipo);
    setForm(f => ({
      ...f,
      tipo: novoTipo,
      // Limpa a marca apenas se o tipo tiver marcas mapeadas E a marca atual não estiver na lista
      marca: marcasNovoTipo.length > 0 && !marcasNovoTipo.includes(f.marca) ? "" : f.marca,
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

    const fazendaIdNum = form.fazendaId ? parseInt(form.fazendaId, 10) : NaN;

    // Para cadastro (novo), tipo/fazenda/marca são obrigatórios
    if (!isEdit) {
      if (!form.tipo.trim()) { toast.error("Selecione o tipo de máquina"); return; }
      if (!form.fazendaId || isNaN(fazendaIdNum)) { toast.error("Selecione uma fazenda"); return; }
      if (!form.marca.trim()) { toast.error("Selecione a marca"); return; }
    }

    const basePayload = {
      nome: form.apelido.trim() || undefined,
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
      // tipo/fazendaId/marca: apenas envia se preenchidos (evita sobrescrever existentes com vazio)
      ...(form.tipo.trim() ? { tipo: form.tipo.trim() } : {}),
      ...(form.marca.trim() ? { marca: form.marca.trim() } : {}),
      ...(!isNaN(fazendaIdNum) && fazendaIdNum > 0 ? { fazendaId: fazendaIdNum } : {}),
    };

    if (isEdit && maquinaId) {
      updateMutation.mutate({ id: maquinaId, ...basePayload });
    } else {
      // Para criar: tipo/fazendaId/marca já foram validados acima
      createMutation.mutate({
        ...basePayload,
        fazendaId: fazendaIdNum,
        tipo: form.tipo.trim(),
        marca: form.marca.trim(),
      });
    }
  };

  // Campos obrigatórios que estão vazios neste maquinário (edit mode)
  const camposVazios = isEdit && maquina
    ? [!form.tipo && "Tipo", !form.fazendaId && "Fazenda", !form.marca && "Marca"].filter(Boolean)
    : [];

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

          {camposVazios.length > 0 && (
            <div className="mb-5 flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded text-[12px] text-amber-800">
              <span className="material-icons text-[16px] text-amber-500 mt-0.5 shrink-0">info</span>
              <span>
                Este maquinário não possui <strong>{camposVazios.join(", ")}</strong> registrado{camposVazios.length > 1 ? "s" : ""}.
                Selecione os campos destacados com <span style={{ color: "#4ECDC4" }}>■</span> e salve para completar o cadastro.
              </span>
            </div>
          )}

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
              <FormNativeSelect
                value={form.tipo}
                onChange={handleTipoChange}
                placeholder="Selecione um tipo de máquina"
                required
                options={TIPOS_MAQUINA.map(t => ({ value: t, label: t }))}
              />
            </div>
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
              {/* Marcas filtradas pelo tipo selecionado via datalist */}
              <FieldBox required>
                <input
                  list="marcas-por-tipo-list"
                  value={form.marca}
                  onChange={e => set("marca", e.target.value)}
                  placeholder={form.tipo ? `Selecione a marca para ${form.tipo}` : "Selecione primeiro o tipo"}
                  required
                  className="w-full min-h-[42px] px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <datalist id="marcas-por-tipo-list">
                  {(marcasDoTipo as readonly string[]).map((m: string) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </FieldBox>
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

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/maquinas/visao-geral")}
              className="w-full sm:w-auto px-6 rounded-full text-[12px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 active:scale-[0.97] transition-colors flex items-center justify-center"
              style={{ minHeight: 48 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="w-full sm:w-auto px-6 rounded-full text-[12px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 active:scale-[0.97] transition-all hover:opacity-90 flex items-center justify-center gap-2"
              style={{ backgroundColor: FD_PRIMARY, minHeight: 48 }}
            >
              {isBusy ? (
                <><span className="material-icons text-[16px] animate-spin">refresh</span> Salvando...</>
              ) : (
                <><span className="material-icons text-[16px]">save</span> Salvar maquinário</>
              )}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { MaquinaRegistrationPage };
