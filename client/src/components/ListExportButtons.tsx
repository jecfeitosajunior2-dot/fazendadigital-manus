import { useState, useRef, useEffect } from "react";
import { exportListPdf, exportListSpreadsheet, type ExportRow } from "@/lib/exportList";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  filename: string;
  headers: string[];
  rows: ExportRow[];
  alignRightFrom?: number;
  alignRightCols?: number[];
  className?: string;
  fazendaNome?: string;
  groupByCol?: number[];
  landscape?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

export default function ListExportButtons({
  title,
  filename,
  headers,
  rows,
  alignRightFrom,
  alignRightCols,
  className,
  fazendaNome,
  groupByCol,
  landscape,
  disabled = false,
  variant = "primary",
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

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const isSecondary = variant === "secondary";

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen(v => !v);
        }}
        className={cn(
          "flex items-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold active:scale-[0.97] transition w-full sm:w-auto min-h-[44px]",
          isSecondary
            ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            : "text-white",
          disabled && "opacity-50 cursor-not-allowed active:scale-100 hover:bg-white",
        )}
        style={isSecondary ? undefined : { backgroundColor: "#2563eb" }}
        title={disabled ? "Selecione uma fazenda para exportar" : "Exportar"}
      >
        <span className={cn("material-icons text-[16px]", isSecondary && "text-gray-500")}>download</span>
        Exportar
        <span className={cn("material-icons text-[16px] ml-0.5", isSecondary && "text-gray-500")}>
          {open ? "expand_less" : "expand_more"}
        </span>
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
            onClick={() => {
              setOpen(false);
              exportListSpreadsheet(headers, rows, filename);
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
              exportListPdf(title, headers, rows, { alignRightFrom, alignRightCols, fazendaNome, groupByCol, landscape });
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
