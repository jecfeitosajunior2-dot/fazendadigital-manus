/** Ícone de brinco de identificação animal — silhueta em cinza (currentColor). */
export default function BrincoIcon({ className = 'w-[18px] h-[18px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="none"
      shapeRendering="geometricPrecision"
    >
      <path
        d="M16 1.1
           C17.9 1.1 19.2 2.5 19.2 4.3
           C19.2 5.2 18.7 6 18 6.5
           C20.8 7.1 23 9 23.9 11.6
           L 26.1 24.8
           C 26.7 27.8 24.6 30.2 21.6 30.2
           H 10.4
           C 7.4 30.2 5.3 27.8 5.9 24.8
           L 8.1 11.6
           C 9 9 11.2 7.1 14 6.5
           C 13.3 6 12.8 5.2 12.8 4.3
           C 12.8 2.5 14.1 1.1 16 1.1
           Z"
        fill="currentColor"
      />

      <ellipse cx="16" cy="6.8" rx="3.6" ry="3.1" fill="currentColor" />

      <circle cx="16" cy="2.1" r="1.35" fill="currentColor" opacity="0.55" />

      <rect x="9.2" y="14.8" width="13.6" height="2.4" rx="1.2" fill="currentColor" opacity="0.3" />

      <rect x="14.8" y="19.2" width="2.4" height="7.2" rx="1.2" fill="currentColor" opacity="0.2" />
    </svg>
  );
}
