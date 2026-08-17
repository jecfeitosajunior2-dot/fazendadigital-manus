import type { SVGProps } from "react";

type CorralGateIconProps = SVGProps<SVGSVGElement> & {
  /** Largura do ícone (altura proporcional à porteira). */
  size?: number;
};

/**
 * Porteira de curral — outline, estilo alinhado aos ícones Lucide do app.
 * viewBox mais largo que alto para reconhecimento em ~24–30 px.
 */
export function CorralGateIcon({
  size = 28,
  className,
  strokeWidth = 1.75,
  ...props
}: CorralGateIconProps) {
  const width = size;
  const height = Math.round((size * 22) / 28);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 28 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Mourões */}
      <path d="M4 2.5v17" />
      <path d="M24 2.5v17" />
      {/* Travessas */}
      <path d="M4 5.5h20" />
      <path d="M4 16.5h20" />
      {/* Divisão central */}
      <path d="M14 5.5v11" />
      {/* Diagonais da porteira */}
      <path d="M4 5.5 14 16.5" />
      <path d="M24 5.5 14 16.5" />
    </svg>
  );
}
