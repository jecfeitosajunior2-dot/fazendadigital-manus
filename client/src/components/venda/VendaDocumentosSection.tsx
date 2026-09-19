import { useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { VENDA_DOCUMENTO_MAX_BYTES } from "@shared/vendaDocumentos";

type TipoDocumento = "gta" | "nota_fiscal";

type DocumentoPublico = {
  id: number;
  tipo: TipoDocumento;
  nomeOriginal: string;
  uploadedAt?: Date | string | null;
  uploadedByNome?: string | null;
};

const SLOTS: { tipo: TipoDocumento; label: string }[] = [
  { tipo: "gta", label: "GTA" },
  { tipo: "nota_fiscal", label: "Nota Fiscal" },
];

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

function urlArquivo(documentoId: number, disposition: "inline" | "attachment") {
  return `/api/vendas/documentos/${documentoId}/arquivo?disposition=${disposition}`;
}

function DocumentoSlot({
  vendaId,
  tipo,
  label,
  documento,
  busy,
  onPick,
  onVisualizar,
  onBaixar,
  onSubstituir,
  onExcluir,
}: {
  vendaId: number;
  tipo: TipoDocumento;
  label: string;
  documento?: DocumentoPublico;
  busy: boolean;
  onPick: (tipo: TipoDocumento, file: File) => void;
  onVisualizar: (doc: DocumentoPublico) => void;
  onBaixar: (doc: DocumentoPublico) => void;
  onSubstituir: (tipo: TipoDocumento) => void;
  onExcluir: (doc: DocumentoPublico) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <p className="text-[10px] uppercase text-gray-400">{label}</p>
        <p className="text-[12px] font-medium text-gray-800 truncate max-w-[280px] sm:max-w-[420px]">
          {documento ? documento.nomeOriginal : "Nenhum arquivo anexado"}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {documento ? (
          <>
            <button
              type="button"
              onClick={() => onVisualizar(documento)}
              className="px-2.5 min-h-[32px] rounded-lg border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              Visualizar
            </button>
            <button
              type="button"
              onClick={() => onBaixar(documento)}
              className="px-2.5 min-h-[32px] rounded-lg border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              Baixar
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="grid place-items-center h-8 w-7 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:opacity-50"
                  aria-label={`Mais ações de ${label}`}
                  title="Mais ações"
                >
                  <span className="material-icons text-[18px]" aria-hidden>
                    more_vert
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px] z-[100]">
                <DropdownMenuItem
                  className="text-[12px] cursor-pointer"
                  onSelect={() => onSubstituir(tipo)}
                >
                  Substituir
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[12px] cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                  onSelect={() => onExcluir(documento)}
                >
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="px-3 min-h-[32px] rounded-lg border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Anexar PDF
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          data-tipo={tipo}
          data-venda={vendaId}
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onPick(tipo, file);
          }}
        />
      </div>
    </div>
  );
}

export default function VendaDocumentosSection({
  vendaId,
  documentos,
}: {
  vendaId: number;
  documentos: DocumentoPublico[];
}) {
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const anexarMut = trpc.vendas.documentosAnexar.useMutation();
  const excluirMut = trpc.vendas.documentosExcluir.useMutation();
  const [busyTipo, setBusyTipo] = useState<TipoDocumento | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [tipoSubstituicao, setTipoSubstituicao] = useState<TipoDocumento | null>(null);

  const porTipo = new Map(documentos.map(doc => [doc.tipo, doc]));
  const busy = anexarMut.isPending || excluirMut.isPending;

  const refresh = () => utils.vendas.get.invalidate({ id: vendaId });

  const enviar = async (tipo: TipoDocumento, file: File, substituir: boolean) => {
    if (file.size > VENDA_DOCUMENTO_MAX_BYTES) {
      toast.error("O PDF deve ter no máximo 10 MB.");
      return;
    }
    setBusyTipo(tipo);
    try {
      const data = await readFileAsBase64(file);
      await anexarMut.mutateAsync({
        vendaId,
        tipo,
        data,
        nomeOriginal: file.name,
        mimeType: file.type || undefined,
        substituir,
      });
      await refresh();
      toast.success(substituir ? "Arquivo substituído." : "PDF anexado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível anexar o PDF.");
    } finally {
      setBusyTipo(null);
    }
  };

  const handlePick = async (tipo: TipoDocumento, file: File) => {
    const existente = porTipo.get(tipo);
    if (existente) {
      const ok = await confirm({
        title: "Substituir arquivo",
        description: (
          <p>
            Já existe um PDF de {tipo === "gta" ? "GTA" : "Nota Fiscal"}. O arquivo atual será
            substituído por <span className="font-medium">{file.name}</span>.
          </p>
        ),
        confirmText: "Substituir",
        cancelText: "Voltar",
        variant: "warning",
      });
      if (!ok) return;
      await enviar(tipo, file, true);
      return;
    }
    await enviar(tipo, file, false);
  };

  const handleSubstituir = (tipo: TipoDocumento) => {
    setTipoSubstituicao(tipo);
    window.setTimeout(() => replaceInputRef.current?.click(), 0);
  };

  const handleExcluir = async (doc: DocumentoPublico) => {
    const label = doc.tipo === "gta" ? "GTA" : "Nota Fiscal";
    await confirm({
      title: "Excluir arquivo",
      description: (
        <>
          <p>Remover {doc.nomeOriginal} da {label}?</p>
          <p className="mt-3">A venda em si não será alterada.</p>
        </>
      ),
      confirmText: "Excluir arquivo",
      cancelText: "Voltar",
      variant: "danger",
      onConfirm: async () => {
        await excluirMut.mutateAsync({ vendaId, documentoId: doc.id });
        await refresh();
        toast.success("Arquivo excluído.");
      },
    });
  };

  return (
    <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100">
        <h2 className="text-[13px] font-medium text-gray-800">Documentos</h2>
      </div>
      <div className="px-3 divide-y divide-gray-100">
        {SLOTS.map(slot => (
          <DocumentoSlot
            key={slot.tipo}
            vendaId={vendaId}
            tipo={slot.tipo}
            label={slot.label}
            documento={porTipo.get(slot.tipo)}
            busy={busy || busyTipo === slot.tipo}
            onPick={handlePick}
            onVisualizar={doc => window.open(urlArquivo(doc.id, "inline"), "_blank", "noopener,noreferrer")}
            onBaixar={doc => {
              const a = document.createElement("a");
              a.href = urlArquivo(doc.id, "attachment");
              a.rel = "noopener";
              a.click();
            }}
            onSubstituir={handleSubstituir}
            onExcluir={handleExcluir}
          />
        ))}
      </div>
      <input
        ref={replaceInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={e => {
          const file = e.target.files?.[0];
          const tipo = tipoSubstituicao;
          e.target.value = "";
          setTipoSubstituicao(null);
          if (file && tipo) void handlePick(tipo, file);
        }}
      />
    </div>
  );
}
