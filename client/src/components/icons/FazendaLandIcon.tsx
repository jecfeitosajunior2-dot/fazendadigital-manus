/** Ícone de fazenda (mesmo da barra lateral — fd_farm_land). */
export default function FazendaLandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="none"
      shapeRendering="geometricPrecision"
    >
      <path
        d="M7.2 14.1 16 6.85l8.8 7.25"
        stroke="currentColor"
        strokeWidth="2.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.4 13.7v12.15h13.2V13.7L16 8.25Z" fill="currentColor" />
      <rect x="13.55" y="12.1" width="2.25" height="2.5" rx=".25" fill="currentColor" opacity=".35" />
      <rect x="16.25" y="12.1" width="2.25" height="2.5" rx=".25" fill="currentColor" opacity=".35" />
      <path d="M12.6 18.05h6.8v7.8h-6.8Z" fill="currentColor" opacity=".35" />
      <path
        d="M12.6 18.05 19.4 25.85M19.4 18.05 12.6 25.85M16 18.05v7.8"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}
