import { exportListPdf, exportListSpreadsheet, type ExportRow } from "@/lib/exportList";

type Props = {
  title: string;
  filename: string;
  headers: string[];
  rows: ExportRow[];
  alignRightFrom?: number;
  className?: string;
};

export default function ListExportButtons({
  title,
  filename,
  headers,
  rows,
  alignRightFrom,
  className,
}: Props) {
  return (
    <div className={`flex items-center gap-4 text-[10px] text-gray-600 shrink-0 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => exportListSpreadsheet(headers, rows, filename)}
        className="flex items-center gap-1.5 hover:text-[#4ECDC4] transition-colors font-medium"
      >
        <span className="material-icons text-[16px]">table_chart</span>
        Exportar Planilha
      </button>
      <button
        type="button"
        onClick={() => exportListPdf(title, headers, rows, { alignRightFrom })}
        className="flex items-center gap-1.5 hover:text-[#4ECDC4] transition-colors font-medium"
      >
        <span className="material-icons text-[16px]">picture_as_pdf</span>
        PDF
      </button>
    </div>
  );
}

export { ListExportButtons };
