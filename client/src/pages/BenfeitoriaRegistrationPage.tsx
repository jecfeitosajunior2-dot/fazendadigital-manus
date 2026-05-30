import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrencyBrl, formatPercent, parseCurrencyBrl, parsePercent } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

type ImageSlot =
  | { kind: "empty" }
  | { kind: "preview"; url: string; existingPath?: string }
  | { kind: "file"; file: File; previewUrl: string };

type FormState = {
  fazendaId: string;
  nome: string;
  anoConstrucao: string;
  valor: string;
  vidaUtil: string;
  percentual: string;
  observacoes: string;
};

const emptyForm = (): FormState => ({
  fazendaId: "",
  nome: "",
  anoConstrucao: "",
  valor: "",
  vidaUtil: "",
  percentual: "",
  observacoes: "",
});

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

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
  const isEdit = benfeitoriaId != null && !isNaN(benfeitoriaId);

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: benfeitoria, isLoading: loadingBenfeitoria } = trpc.benfeitorias.get.useQuery(
    { id: benfeitoriaId! },
    { enabled: isEdit }
  );

  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([
    { kind: "empty" },
    { kind: "empty" },
    { kind: "empty" },
  ]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isEdit && benfeitoria && !initialized) {
      setForm({
        fazendaId: benfeitoria.fazendaId ? String(benfeitoria.fazendaId) : "",
        nome: benfeitoria.nome || "",
        anoConstrucao: benfeitoria.anoConstrucao ? String(benfeitoria.anoConstrucao) : "",
        valor: benfeitoria.valorEstimado
          ? formatCurrencyBrl(String(Math.round(parseFloat(String(benfeitoria.valorEstimado)) * 100)))
          : "",
        vidaUtil: benfeitoria.vidaUtil ? String(benfeitoria.vidaUtil) : "",
        percentual: benfeitoria.percentualAtividade
          ? formatPercent(String(Math.round(parseFloat(String(benfeitoria.percentualAtividade)))))
          : "",
        observacoes: benfeitoria.observacoes || "",
      });
      setImageSlots(
        [benfeitoria.imagem1, benfeitoria.imagem2, benfeitoria.imagem3].map(path =>
          path
            ? { kind: "preview" as const, url: path, existingPath: path }
            : { kind: "empty" as const }
        )
      );
      setInitialized(true);
    }
  }, [isEdit, benfeitoria, initialized]);

  const createMutation = trpc.benfeitorias.create.useMutation({
    onSuccess: () => {
      utils.benfeitorias.list.invalidate();
      toast.success("Benfeitoria cadastrada!");
      setLocation("/fazendas/benfeitorias");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.benfeitorias.update.useMutation({
    onSuccess: () => {
      utils.benfeitorias.list.invalidate();
      toast.success("Benfeitoria atualizada!");
      setLocation("/fazendas/benfeitorias");
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
    if (!form.fazendaId) { toast.error("Selecione uma fazenda"); return; }
    if (!form.nome.trim()) { toast.error("Nome da benfeitoria é obrigatório"); return; }
    if (!form.anoConstrucao.trim()) { toast.error("Ano de construção é obrigatório"); return; }
    const percentual = parsePercent(form.percentual);
    if (percentual == null) { toast.error("Porcentagem utilizada na atividade é obrigatória"); return; }

    const payload = {
      fazendaId: parseInt(form.fazendaId),
      nome: form.nome.trim(),
      anoConstrucao: parseInt(form.anoConstrucao),
      percentualAtividade: percentual,
      vidaUtil: form.vidaUtil.trim() || undefined,
      valorEstimado: parseCurrencyBrl(form.valor) || undefined,
      observacoes: form.observacoes.trim() || undefined,
      imageSlots: await buildImageSlotsPayload(),
    };

    if (isEdit && benfeitoriaId) updateMutation.mutate({ id: benfeitoriaId, ...payload });
    else createMutation.mutate(payload);
  };

  if (isEdit && loadingBenfeitoria) {
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
            {isEdit ? "Editar benfeitoria" : "Cadastro de benfeitoria"}
          </h1>

          {/* Fotos */}
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

          {/* Linha 1 — Fazenda + Nome */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <FormLabel required>Fazenda</FormLabel>
              <Select value={form.fazendaId || undefined} onValueChange={v => set("fazendaId", v)}>
                <SelectTrigger className="h-10 text-[12px] border-gray-200 bg-white">
                  <SelectValue placeholder="Selecione uma fazenda" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {fazendas.map(f => (
                    <SelectItem key={f.id} value={String(f.id)} className="text-[12px]">
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FormLabel required>Nome</FormLabel>
              <input
                value={form.nome}
                onChange={e => set("nome", e.target.value)}
                placeholder="Digite um nome para a benfeitoria"
                className="w-full h-10 px-3 text-[12px] border border-gray-200 rounded bg-white text-gray-800 placeholder:text-gray-400 outline-none focus:border-[#4ECDC4] focus:ring-1 focus:ring-[#4ECDC4]/30"
              />
            </div>
          </div>

          {/* Linha 2 — Ano + Valor + Vida útil */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <FormLabel required>Ano</FormLabel>
              <div className="relative">
                <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400 pointer-events-none">
                  calendar_today
                </span>
                <input
                  type="number"
                  min={1900}
                  max={2100}
                  value={form.anoConstrucao}
                  onChange={e => set("anoConstrucao", e.target.value)}
                  placeholder="Selecione o ano de construção"
                  className="w-full h-10 pl-9 pr-3 text-[12px] border border-gray-200 rounded bg-white text-gray-800 placeholder:text-gray-400 outline-none focus:border-[#4ECDC4] focus:ring-1 focus:ring-[#4ECDC4]/30"
                />
              </div>
            </div>
            <div>
              <FormLabel>Valor</FormLabel>
              <input
                value={form.valor}
                onChange={e => set("valor", formatCurrencyBrl(e.target.value))}
                placeholder="R$ 0,00"
                className="w-full h-10 px-3 text-[12px] border border-gray-200 rounded bg-white text-gray-800 placeholder:text-gray-400 outline-none focus:border-[#4ECDC4] focus:ring-1 focus:ring-[#4ECDC4]/30"
              />
            </div>
            <div>
              <FormLabel>Vida útil</FormLabel>
              <input
                value={form.vidaUtil}
                onChange={e => set("vidaUtil", e.target.value)}
                placeholder="Ex: 10 anos"
                className="w-full h-10 px-3 text-[12px] border border-gray-200 rounded bg-white text-gray-800 placeholder:text-gray-400 outline-none focus:border-[#4ECDC4] focus:ring-1 focus:ring-[#4ECDC4]/30"
              />
            </div>
          </div>

          {/* Linha 3 — Porcentagem + Observações */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <FormLabel required>Porcentagem utilizada na atividade</FormLabel>
              <input
                value={form.percentual}
                onChange={e => set("percentual", formatPercent(e.target.value))}
                placeholder="Ex: 90%"
                className="w-full h-10 px-3 text-[12px] border border-gray-200 rounded bg-white text-gray-800 placeholder:text-gray-400 outline-none focus:border-[#4ECDC4] focus:ring-1 focus:ring-[#4ECDC4]/30"
              />
            </div>
            <div className="sm:col-span-2">
              <FormLabel>Observações</FormLabel>
              <textarea
                value={form.observacoes}
                onChange={e => set("observacoes", e.target.value)}
                placeholder="Descreva sua benfeitoria"
                rows={3}
                className="w-full px-3 py-2.5 text-[12px] border border-gray-200 rounded bg-white text-gray-800 placeholder:text-gray-400 outline-none resize-y min-h-[80px] focus:border-[#4ECDC4] focus:ring-1 focus:ring-[#4ECDC4]/30"
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/fazendas/benfeitorias")}
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
