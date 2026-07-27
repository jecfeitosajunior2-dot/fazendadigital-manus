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

const TOAST_ID_OBRIGATORIOS = "benfeitoria-campos-obrigatorios";

const CAMPOS_OBRIGATORIOS = ["nome", "fazendaId", "tipo", "estado", "anoConstrucao"] as const;
type CampoObrigatorio = (typeof CAMPOS_OBRIGATORIOS)[number];

const MSG_LOCAL: Record<CampoObrigatorio, string> = {
  nome: "Informe o nome da benfeitoria.",
  fazendaId: "Selecione a Fazenda.",
  tipo: "Selecione o tipo de Benfeitoria.",
  estado: "Selecione o estado de conservação.",
  anoConstrucao: "Selecione o ano de construção.",
};

const MSG_TOAST: Record<CampoObrigatorio, string> = {
  nome: "Nome da benfeitoria é obrigatório.",
  fazendaId: "Selecione uma fazenda.",
  tipo: "Tipo de Benfeitoria é obrigatório.",
  estado: "Estado de Conservação é obrigatório.",
  anoConstrucao: "Ano de construção é obrigatório.",
};

function fieldDomId(campo: CampoObrigatorio) {
  return `benfeitoria-field-${campo}`;
}

function FieldErrorMsg({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[11px] text-red-600" role="alert">
      {message}
    </p>
  );
}

function coletarErros(form: FormState): Partial<Record<CampoObrigatorio, string>> {
  const erros: Partial<Record<CampoObrigatorio, string>> = {};
  if (!form.nome.trim()) erros.nome = MSG_LOCAL.nome;
  if (!form.fazendaId) erros.fazendaId = MSG_LOCAL.fazendaId;
  if (!form.tipo.trim()) erros.tipo = MSG_LOCAL.tipo;
  if (!form.estado.trim()) erros.estado = MSG_LOCAL.estado;
  if (!form.anoConstrucao.trim()) erros.anoConstrucao = MSG_LOCAL.anoConstrucao;
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
  const [errosObrigatorios, setErrosObrigatorios] = useState<
    Partial<Record<CampoObrigatorio, string>>
  >({});
  const tentativaValidacao = Object.keys(errosObrigatorios).length > 0;

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
    if (CAMPOS_OBRIGATORIOS.includes(key as CampoObrigatorio)) {
      setErrosObrigatorios(prev => {
        if (!prev[key as CampoObrigatorio]) return prev;
        const next = { ...prev };
        delete next[key as CampoObrigatorio];
        return next;
      });
    }
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
    const erros = coletarErros(form);
    const primeiro = primeiroCampoInvalido(erros);

    if (primeiro) {
      setErrosObrigatorios(erros);
      toast.error(MSG_TOAST[primeiro], { id: TOAST_ID_OBRIGATORIOS });
      focarCampo(primeiro);
      return;
    }

    setErrosObrigatorios({});

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
      <button
        type="button"
        onClick={() => setLocation(listUrl)}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <form onSubmit={handleSubmit} noValidate>
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
            <div className="scroll-mt-24">
              <FormLabel required>Nome</FormLabel>
              <FormInput
                id={fieldDomId("nome")}
                value={form.nome}
                onChange={v => set("nome", v)}
                placeholder="Digite um nome para a benfeitoria"
                required
                invalid={!!errosObrigatorios.nome}
                aria-describedby={errosObrigatorios.nome ? "benfeitoria-err-nome" : undefined}
              />
              <FieldErrorMsg id="benfeitoria-err-nome" message={errosObrigatorios.nome} />
            </div>
            <div className="scroll-mt-24">
              <FormLabel required>Fazenda</FormLabel>
              <FormNativeSelect
                id={fieldDomId("fazendaId")}
                value={form.fazendaId}
                onChange={v => set("fazendaId", v)}
                placeholder="Selecione uma fazenda"
                required
                options={fazendas.map(f => ({ value: String(f.id), label: f.nome }))}
                invalid={!!errosObrigatorios.fazendaId}
                aria-describedby={errosObrigatorios.fazendaId ? "benfeitoria-err-fazendaId" : undefined}
              />
              <FieldErrorMsg id="benfeitoria-err-fazendaId" message={errosObrigatorios.fazendaId} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="scroll-mt-24">
              <FormLabel required>Tipo de Benfeitoria</FormLabel>
              <FormSelect
                id={fieldDomId("tipo")}
                value={form.tipo}
                onChange={v => set("tipo", v)}
                placeholder="Selecione o tipo"
                required
                displayValue={form.tipo}
                triggerClassName="h-[42px] py-0"
                invalid={!!errosObrigatorios.tipo}
                aria-describedby={errosObrigatorios.tipo ? "benfeitoria-err-tipo" : undefined}
              >
                {TIPOS_BENFEITORIA.map(tipo => (
                  <SelectItem key={tipo} value={tipo} className="text-[13px]">
                    {tipo}
                  </SelectItem>
                ))}
              </FormSelect>
              <FieldErrorMsg id="benfeitoria-err-tipo" message={errosObrigatorios.tipo} />
            </div>
            <div className="scroll-mt-24">
              <FormLabel required>Estado de Conservação</FormLabel>
              <FormSelect
                id={fieldDomId("estado")}
                value={form.estado}
                onChange={v => set("estado", v)}
                placeholder="Selecione o estado"
                required
                displayValue={form.estado}
                triggerClassName="h-[42px] py-0"
                invalid={!!errosObrigatorios.estado}
                aria-describedby={errosObrigatorios.estado ? "benfeitoria-err-estado" : undefined}
              >
                {ESTADOS_CONSERVACAO_BENFEITORIA.map(estado => (
                  <SelectItem key={estado} value={estado} className="text-[13px]">
                    {estado}
                  </SelectItem>
                ))}
              </FormSelect>
              <FieldErrorMsg id="benfeitoria-err-estado" message={errosObrigatorios.estado} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="scroll-mt-24">
              <FormLabel required>Ano de Construção</FormLabel>
              <FormYearPicker
                id={fieldDomId("anoConstrucao")}
                value={form.anoConstrucao}
                onChange={v => set("anoConstrucao", v)}
                placeholder="Selecione o ano de construção"
                required
                invalid={!!errosObrigatorios.anoConstrucao}
                aria-describedby={
                  errosObrigatorios.anoConstrucao ? "benfeitoria-err-anoConstrucao" : undefined
                }
              />
              <FieldErrorMsg
                id="benfeitoria-err-anoConstrucao"
                message={errosObrigatorios.anoConstrucao}
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

          <div className="pt-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
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
                onClick={() => setLocation(listUrl)}
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
                {isBusy ? "Salvando..." : isEdit ? "Salvar" : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { BenfeitoriaRegistrationPage };
