import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormSelect,
  FormTextarea,
  FormYearPicker,
} from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import {
  ESTADOS_CONSERVACAO_BENFEITORIA,
  TIPOS_BENFEITORIA,
} from "@shared/benfeitoria-types";

type ImageSlot =
  | { kind: "empty" }
  | { kind: "preview"; url: string; existingPath?: string }
  | { kind: "file"; file: File; previewUrl: string };

type FormState = {
  fazendaId: string;
  nome: string;
  tipo: string;
  estado: string;
  anoConstrucao: string;
  valor: string;
  vidaUtil: string;
  observacoes: string;
};

type DirtyFields = Partial<Record<keyof FormState, true>>;

const emptyForm = (): FormState => ({
  fazendaId: "",
  nome: "",
  tipo: "",
  estado: "",
  anoConstrucao: "",
  valor: "",
  vidaUtil: "",
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

export default function BenfeitoriaRegistrationPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const searchParams = new URLSearchParams(window.location.search);
  const benfeitoriaId = searchParams.get("id") ? parseInt(searchParams.get("id")!) : null;
  const fazendaIdFromUrl = searchParams.get("fazendaId") || "";
  const isEdit = benfeitoriaId != null && !isNaN(benfeitoriaId);

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: benfeitoria, isLoading: loadingBenfeitoria, isFetching: fetchingBenfeitoria } = trpc.benfeitorias.get.useQuery(
    { id: benfeitoriaId! },
    { enabled: isEdit, staleTime: 0, refetchOnMount: "always" }
  );

  const listUrl = useMemo(() => {
    if (fazendaIdFromUrl) {
      return `/fazendas/benfeitorias?fazendaId=${encodeURIComponent(fazendaIdFromUrl)}`;
    }
    if (isEdit && benfeitoria?.fazendaId) {
      return `/fazendas/benfeitorias?fazendaId=${benfeitoria.fazendaId}`;
    }
    return "/fazendas/benfeitorias";
  }, [fazendaIdFromUrl, isEdit, benfeitoria?.fazendaId]);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
  ]);
  const [initialized, setInitialized] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<DirtyFields>({});
  const [imageSlotsDirty, setImageSlotsDirty] = useState(false);

  useEffect(() => {
    if (!isEdit && fazendaIdFromUrl && !initialized) {
      setForm(f => ({ ...f, fazendaId: fazendaIdFromUrl }));
      setInitialized(true);
    }
  }, [isEdit, fazendaIdFromUrl, initialized]);

  useEffect(() => {
    if (!isEdit || !benfeitoria || fetchingBenfeitoria) return;

    if (!initialized) {
      setForm({
        fazendaId: benfeitoria.fazendaId ? String(benfeitoria.fazendaId) : "",
        nome: benfeitoria.nome || "",
        tipo: benfeitoria.tipo || "",
        estado: benfeitoria.estado || "",
        anoConstrucao: benfeitoria.anoConstrucao ? String(benfeitoria.anoConstrucao) : "",
        valor: benfeitoria.valorEstimado
          ? formatCurrencyBrl(String(Math.round(parseFloat(String(benfeitoria.valorEstimado)) * 100)))
          : "",
        vidaUtil: benfeitoria.vidaUtil ? String(benfeitoria.vidaUtil) : "",
        observacoes: benfeitoria.observacoes || "",
      });
      setDirtyFields({});
      setImageSlotsDirty(false);
      setImageSlots(
        [benfeitoria.imagem1, benfeitoria.imagem2, benfeitoria.imagem3].map(path =>
          path
            ? { kind: "preview" as const, url: path, existingPath: path }
            : { kind: "empty" as const }
        )
      );
      setInitialized(true);
      return;
    }

    setForm(f => ({
      fazendaId: dirtyFields.fazendaId ? f.fazendaId : (benfeitoria.fazendaId ? String(benfeitoria.fazendaId) : ""),
      nome: dirtyFields.nome ? f.nome : (benfeitoria.nome || ""),
      tipo: dirtyFields.tipo ? f.tipo : (benfeitoria.tipo || ""),
      estado: dirtyFields.estado ? f.estado : (benfeitoria.estado || ""),
      anoConstrucao: dirtyFields.anoConstrucao ? f.anoConstrucao : (benfeitoria.anoConstrucao ? String(benfeitoria.anoConstrucao) : ""),
      valor: dirtyFields.valor
        ? f.valor
        : (benfeitoria.valorEstimado
            ? formatCurrencyBrl(String(Math.round(parseFloat(String(benfeitoria.valorEstimado)) * 100)))
            : ""),
      vidaUtil: dirtyFields.vidaUtil ? f.vidaUtil : (benfeitoria.vidaUtil ? String(benfeitoria.vidaUtil) : ""),
      observacoes: dirtyFields.observacoes ? f.observacoes : (benfeitoria.observacoes || ""),
    }));
  }, [isEdit, benfeitoria, initialized, fetchingBenfeitoria, dirtyFields]);

  const createMutation = trpc.benfeitorias.create.useMutation({
    onSuccess: () => {
      utils.benfeitorias.list.invalidate();
      toast.success("Benfeitoria cadastrada!");
      setLocation(listUrl);
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.benfeitorias.update.useMutation({
    onSuccess: () => {
      utils.benfeitorias.list.invalidate();
      toast.success("Benfeitoria atualizada!");
      setLocation(listUrl);
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirtyFields(f => ({ ...f, [key]: true }));
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
    setImageSlotsDirty(true);
  };

  const removeImageAt = (index: number) => {
    setImageSlots(slots => {
      const next = [...slots];
      const prev = next[index];
      if (prev.kind === "file") URL.revokeObjectURL(prev.previewUrl);
      next[index] = { kind: "empty" };
      return next;
    });
    setImageSlotsDirty(true);
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
    if (!form.fazendaId) { toast.error("Selecione uma fazenda"); return; }
    if (!form.nome.trim()) { toast.error("Nome da benfeitoria é obrigatório"); return; }
    if (!form.tipo.trim()) { toast.error("Tipo de Benfeitoria é obrigatório"); return; }
    if (!form.estado.trim()) { toast.error("Estado de Conservação é obrigatório"); return; }
    if (!form.anoConstrucao.trim()) { toast.error("Ano de construção é obrigatório"); return; }

    const payload = {
      fazendaId: parseInt(form.fazendaId),
      nome: form.nome.trim(),
      tipo: form.tipo.trim(),
      estado: form.estado.trim(),
      anoConstrucao: parseInt(form.anoConstrucao),
      vidaUtil: form.vidaUtil.trim() || undefined,
      valorEstimado: parseCurrencyBrl(form.valor) || undefined,
      observacoes: form.observacoes.trim() || undefined,
      imageSlots: await buildImageSlotsPayload(),
    };

    if (isEdit && benfeitoriaId) {
      const updatePayload: { id: number } & Partial<typeof payload> = { id: benfeitoriaId };

      if (dirtyFields.fazendaId) updatePayload.fazendaId = payload.fazendaId;
      if (dirtyFields.nome) updatePayload.nome = payload.nome;
      if (dirtyFields.tipo) updatePayload.tipo = payload.tipo;
      if (dirtyFields.estado) updatePayload.estado = payload.estado;
      if (dirtyFields.anoConstrucao) updatePayload.anoConstrucao = payload.anoConstrucao;
      if (dirtyFields.vidaUtil) updatePayload.vidaUtil = payload.vidaUtil;
      if (dirtyFields.valor) updatePayload.valorEstimado = payload.valorEstimado;
      if (dirtyFields.observacoes) updatePayload.observacoes = payload.observacoes;
      if (imageSlotsDirty) updatePayload.imageSlots = payload.imageSlots;

      if (Object.keys(updatePayload).length === 1) {
        toast.info("Nenhuma alteração para salvar.");
        return;
      }

      updateMutation.mutate(updatePayload);
    } else {
      createMutation.mutate(payload);
    }
  };

  if (isEdit && (loadingBenfeitoria || fetchingBenfeitoria || !initialized)) {
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
            {isEdit ? "Editar Benfeitoria" : "Cadastro de Benfeitoria"}
          </h1>

          <div className="mb-6">
            <p className="text-[11px] text-gray-600 mb-3">
              Selecione até três fotos para sua Benfeitoria
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
              <FormLabel required>Nome</FormLabel>
              <FormInput
                value={form.nome}
                onChange={v => set("nome", v)}
                placeholder="Digite um nome para a benfeitoria"
                required
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <FormLabel required>Tipo de Benfeitoria</FormLabel>
              <FormSelect
                value={form.tipo}
                onChange={v => set("tipo", v)}
                placeholder="Selecione o tipo"
                required
                displayValue={form.tipo}
                triggerClassName="h-[42px] py-0"
              >
                {TIPOS_BENFEITORIA.map(tipo => (
                  <SelectItem key={tipo} value={tipo} className="text-[13px]">
                    {tipo}
                  </SelectItem>
                ))}
              </FormSelect>
            </div>
            <div>
              <FormLabel required>Estado de Conservação</FormLabel>
              <FormSelect
                value={form.estado}
                onChange={v => set("estado", v)}
                placeholder="Selecione o estado"
                required
                displayValue={form.estado}
                triggerClassName="h-[42px] py-0"
              >
                {ESTADOS_CONSERVACAO_BENFEITORIA.map(estado => (
                  <SelectItem key={estado} value={estado} className="text-[13px]">
                    {estado}
                  </SelectItem>
                ))}
              </FormSelect>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel required>Ano de Construção</FormLabel>
              <FormYearPicker
                value={form.anoConstrucao}
                onChange={v => set("anoConstrucao", v)}
                placeholder="Selecione o ano de construção"
                required
              />
            </div>
            <div>
              <FormLabel>Vida Útil</FormLabel>
              <FormInput
                value={form.vidaUtil}
                onChange={v => set("vidaUtil", v)}
                placeholder="Ex: 10 anos"
              />
            </div>
            <div>
              <FormLabel>Valor</FormLabel>
              <FormInput
                value={form.valor}
                onChange={v => set("valor", formatCurrencyBrl(v))}
                placeholder="R$ 0,00"
              />
            </div>
          </div>

          <div className="mb-6">
            <FormLabel>Observações</FormLabel>
            <FormTextarea
              value={form.observacoes}
              onChange={v => set("observacoes", v)}
              placeholder="Descreva sua benfeitoria"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation(listUrl)}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
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

export { BenfeitoriaRegistrationPage };
