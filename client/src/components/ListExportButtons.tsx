import { useState, useRef, useEffect } from "react";
import { exportListPdf, exportListSpreadsheet, type ExportRow } from "@/lib/exportList";

type Props = {
  title: string;
  filename: string;
  headers: string[];
  rows: ExportRow[];
  alignRightFrom?: number;
  className?: string;
  fazendaNome?: string;
};

export default function ListExportButtons({
  title,
  filename,
  headers,
  rows,
  alignRightFrom,
  className,
  fazendaNome,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold active:scale-[0.97] transition w-full sm:w-auto"
        style={{ backgroundColor: "#2563eb", minHeight: 44 }}
        title="Exportar"
      >
        <span className="material-icons text-[16px]">download</span>
        Exportar
        <span className="material-icons text-[16px] ml-0.5">{open ? "expand_less" : "expand_more"}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden"
          style={{
            transformOrigin: "top right",
            animation: "dropdownIn 150ms cubic-bezier(0.23,1,0.32,1) both",
          }}
        >
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await exportListSpreadsheet(headers, rows, filename);
            }}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors font-medium"
          >
            <span className="material-icons text-[18px] text-gray-500">table_chart</span>
            Exportar Planilha
          </button>
          <div className="border-t border-gray-100" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              exportListPdf(title, headers, rows, { alignRightFrom, fazendaNome });
            }}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors font-medium"
          >
            <span className="material-icons text-[18px] text-gray-500">picture_as_pdf</span>
            PDF
          </button>
        </div>
      )}

      <style>{`
        @keyframes dropdownIn {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
      `}</style>
    </div>
  );
}

export { ListExportButtons };
