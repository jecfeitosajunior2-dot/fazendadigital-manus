import { useState, useRef, useEffect } from "react";
import { exportListPdf, exportListSpreadsheet, type ExportRow } from "@/lib/exportList";
import { PdfExportIcon, SpreadsheetExportIcon } from "@/components/icons/ExportFormatIcons";
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
  /** Texto do botão (padrão: "Exportar") */
  buttonLabel?: string;
  spreadsheetCurrencyCols?: number[];
  spreadsheetCurrencyFormat?: string;
  spreadsheetIntegerCols?: number[];
  spreadsheetTextCols?: number[];
  spreadsheetColumnNumFmts?: Partial<Record<number, string>>;
  spreadsheetColumnAligns?: ("left" | "center" | "right")[];
  pdfHeaders?: string[];
  pdfRows?: ExportRow[];
  pdfColumnAligns?: ("left" | "center" | "right")[];
  pdfLandscape?: boolean;
  pdfWrapCols?: number[];
};

type ExportMenuItemProps = {
  variant: "spreadsheet" | "pdf";
  label: string;
  onClick: () => void;
};

function ExportMenuItem({ variant, label, onClick }: ExportMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors font-medium"
    >
      {variant === "spreadsheet" ? (
        <SpreadsheetExportIcon size={18} />
      ) : (
        <PdfExportIcon size={18} />
      )}
      {label}
    </button>
  );
}

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
  buttonLabel = "Exportar",
  spreadsheetCurrencyCols,
  spreadsheetCurrencyFormat,
  spreadsheetIntegerCols,
  spreadsheetTextCols,
  spreadsheetColumnNumFmts,
  spreadsheetColumnAligns,
  pdfHeaders,
  pdfRows,
  pdfColumnAligns,
  pdfLandscape,
  pdfWrapCols,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
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
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex items-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold active:scale-[0.97] transition w-full sm:w-auto min-h-[44px]",
          isSecondary
            ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            : "text-white hover:brightness-[1.03]",
          disabled && "opacity-50 cursor-not-allowed active:scale-100 hover:bg-white",
        )}
        style={isSecondary ? undefined : { backgroundColor: "#2563eb" }}
        title={disabled ? "Selecione uma fazenda para exportar" : buttonLabel}
      >
        <span className={cn("material-icons text-[16px]", isSecondary && "text-gray-500")}>download</span>
        {buttonLabel}
        <span className={cn("material-icons text-[16px] ml-0.5", isSecondary && "text-gray-500")}>
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden"
          style={{
            transformOrigin: "top right",
            animation: "dropdownIn 150ms cubic-bezier(0.23,1,0.32,1) both",
          }}
        >
          <ExportMenuItem
            variant="spreadsheet"
            label="Planilha Excel"
            onClick={() => {
              setOpen(false);
              void exportListSpreadsheet(headers, rows, filename, {
                currencyColIndexes: spreadsheetCurrencyCols,
                currencyNumFmt: spreadsheetCurrencyFormat,
                integerColIndexes: spreadsheetIntegerCols,
                textColIndexes: spreadsheetTextCols,
                columnNumFmts: spreadsheetColumnNumFmts,
                columnAligns: spreadsheetColumnAligns,
              });
            }}
          />
          <div className="border-t border-gray-100" />
          <ExportMenuItem
            variant="pdf"
            label="PDF"
            onClick={() => {
              setOpen(false);
              exportListPdf(title, pdfHeaders ?? headers, pdfRows ?? rows, {
                alignRightFrom,
                alignRightCols,
                fazendaNome,
                groupByCol,
                landscape: pdfLandscape ?? landscape,
                currencyColIndexes: pdfRows ? undefined : spreadsheetCurrencyCols,
                integerColIndexes: pdfRows ? undefined : spreadsheetIntegerCols,
                columnAligns: pdfColumnAligns ?? spreadsheetColumnAligns,
                wrapColIndexes: pdfWrapCols,
              });
            }}
          />
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

export { ListExportButtons, ExportMenuItem };
