import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

type IconProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

const SPREADSHEET_COLOR = "#217346";
const PDF_COLOR = "#E53935";

/** Planilha — documento verde (Material Icons) */
export function SpreadsheetExportIcon({ size = 18, className = "", style }: IconProps) {
  return (
    <span
      className={cn("material-icons leading-none select-none", className)}
      style={{ fontSize: size, color: SPREADSHEET_COLOR, ...style }}
      aria-hidden
    >
      description
    </span>
  );
}

/** PDF — documento vermelho (Material Icons) */
export function PdfExportIcon({ size = 18, className = "", style }: IconProps) {
  return (
    <span
      className={cn("material-icons leading-none select-none", className)}
      style={{ fontSize: size, color: PDF_COLOR, ...style }}
      aria-hidden
    >
      description
    </span>
  );
}
