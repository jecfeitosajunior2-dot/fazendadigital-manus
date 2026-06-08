import { useRef, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  downloadBenfeitoriasTemplate,
  parseBenfeitoriasFile,
  type BenfeitoriaImportRow,
} from "@/lib/benfeitoriasImport";

const FD_PRIMARY = "#4ECDC4";

export default function BenfeitoriasImportPage() {
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BenfeitoriaImportRow[]>([]);
  const [fileName, setFileName] = useState("");

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();

  const bulkImport = trpc.benfeitorias.bulkImport.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} benfeitoria(s) importada(s)!`);
      utils.benfeitorias.list.invalidate();
      setLocation("/fazendas/benfeitorias");
    },
    onError: e => toast.error(e.message),
  });

  const validRows = rows.filter(r => r.valid);
  const invalidRows = rows.filter(r => !r.valid);

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
      toast.error("Use arquivo .xlsx ou .csv");
      return;
    }
    const buffer = await file.arrayBuffer();
    const parsed = parseBenfeitoriasFile(buffer, fazendas, ext === "csv");
    if (parsed.length === 0) {
      toast.error("Nenhuma linha válida encontrada. Verifique o modelo da planilha.");
      setRows([]);
      setFileName("");
      return;
    }
    setRows(parsed);
    setFileName(file.name);
    if (parsed.every(r => !r.valid)) {
      toast.error("Planilha com erros. Corrija antes de importar.");
    } else if (parsed.some(r => !r.valid)) {
      toast.warning(`${parsed.filter(r => !r.valid).length} linha(s) com erro serão ignoradas.`);
    }
  };

  const handleImport = () => {
    if (validRows.length === 0) {
      toast.error("Nenhuma linha válida para importar.");
      return;
    }
    if (!confirm(`Importar ${validRows.length} benfeitoria(s)?`)) return;
    bulkImport.mutate({
      items: validRows.map(r => ({
        fazendaId: r.fazendaId!,
        nome: r.nome,
        anoConstrucao: r.anoConstrucao!,
        vidaUtil: r.vidaUtil || undefined,
        valorEstimado: r.valorEstimado || undefined,
      })),
    });
  };

  return (
    <AppLayout>
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setLocation("/fazendas/benfeitorias")}
          className="flex items-center gap-1 text-[12px] text-gray-600 hover:text-gray-900"
        >
          <span className="material-icons text-[18px]">arrow_back</span>
          Voltar
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-[16px] font-semibold text-gray-800" style={{ fontFamily: "Fraunces, serif" }}>
            Importar Benfeitorias
          </h1>
          <p className="text-[11px] text-gray-500 mt-1">
            Use o modelo padrão com as colunas: Benfeitoria, Fazenda, Ano de Construção, Vida Útil e Valor(R$).
          </p>
        </div>

        <div className="px-5 py-4 flex flex-wrap items-center gap-2 border-b border-gray-100">
          <button
            type="button"
            onClick={downloadBenfeitoriasTemplate}
            className="px-4 py-2 rounded text-[10px] font-semibold uppercase border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
          >
            <span className="material-icons text-[16px]">download</span>
            Baixar Modelo
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 rounded text-[10px] font-semibold uppercase text-white flex items-center gap-1.5"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <span className="material-icons text-[16px]">upload_file</span>
            Selecionar Planilha
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          {fileName && (
            <span className="text-[11px] text-gray-500 ml-2">{fileName}</span>
          )}
        </div>

        {rows.length > 0 && (
          <>
            <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex gap-4">
                <span className="text-green-700 font-medium">{validRows.length} válida(s)</span>
                {invalidRows.length > 0 && (
                  <span className="text-red-600 font-medium">{invalidRows.length} com erro</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleImport}
                disabled={validRows.length === 0 || bulkImport.isPending}
                className="px-5 py-2 rounded text-[10px] font-semibold uppercase text-white disabled:opacity-50"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {bulkImport.isPending ? "Importando..." : `Importar ${validRows.length} item(ns)`}
              </button>
            </div>

            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    {["Linha", "Benfeitoria", "Fazenda", "Ano", "Vida Útil", "Valor", "Status"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.line} className={`border-t border-gray-50 ${r.valid ? "" : "bg-red-50/40"}`}>
                      <td className="px-3 py-2 text-gray-500">{r.line}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{r.nome || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{r.fazendaNome || "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{r.anoConstrucao ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{r.vidaUtil || "—"}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.valorEstimado
                          ? Number(r.valorEstimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.valid ? (
                          <span className="text-green-700 font-medium">OK</span>
                        ) : (
                          <span className="text-red-600" title={r.errors.join("; ")}>{r.errors.join("; ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {rows.length === 0 && (
          <div className="px-5 py-12 text-center text-gray-400 text-[12px]">
            Baixe o modelo, preencha e selecione a planilha para visualizar a prévia antes de importar.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
