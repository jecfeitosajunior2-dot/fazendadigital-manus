/** Ícone combinado de sexo — símbolos feminino (Vênus) e masculino (Marte) em cinza. */
export default function SexoIcon({ className = 'w-[18px] h-[18px]' }: { className?: string }) {
  const stroke = 2.1;
  const cap = 'round' as const;
  const join = 'round' as const;

  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="none"
      shapeRendering="geometricPrecision"
    >
      {/* Feminino — esquerda */}
      <circle cx="10.5" cy="11.5" r="4.2" stroke="currentColor" strokeWidth={stroke} />
      <path
        d="M10.5 15.7v6.2M7.4 19.8h6.2"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />

      {/* Masculino — direita */}
      <circle cx="21.5" cy="13.5" r="4.2" stroke="currentColor" strokeWidth={stroke} />
      <path
        d="M24.4 10.6 28.8 6.2M28.8 6.2H25.8M28.8 6.2V9.2"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
    </svg>
  );
}
