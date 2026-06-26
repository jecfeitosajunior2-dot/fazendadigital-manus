/** Ícone Rebanho do sidebar — clone fiel (duas cabeças sobrepostas) */
export default function RebanhoSidebarIcon({
  size = 26,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Ovelha de trás (esquerda / superior) */}
      <path
        d="M4.2 9.8c0-2.1 1.6-3.8 3.6-3.8 1.2 0 2.2.6 2.9 1.5.4-.9 1.3-1.5 2.3-1.5 2 0 3.6 1.7 3.6 3.8v.4c0 .3-.2.5-.4.6l-1.1.4c-.2.8-.8 1.4-1.6 1.6l-.3 2.1c-.1.7-.7 1.2-1.4 1.2H8.1c-.7 0-1.3-.5-1.4-1.2l-.3-2.1c-.8-.2-1.4-.8-1.6-1.6l-1.1-.4c-.2-.1-.4-.3-.4-.6v-.4Z"
        fill="currentColor"
      />
      <path
        d="M6.1 5.2 4.8 3.8M10.9 5.2 12.2 3.8"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <circle cx="8.1" cy="8.8" r=".55" fill="#0B1622" />
      <circle cx="10.8" cy="8.8" r=".55" fill="#0B1622" />
      <path
        d="M8.8 10.6c.4.35.9.55 1.5.55s1.1-.2 1.5-.55"
        stroke="#0B1622"
        strokeWidth=".9"
        strokeLinecap="round"
      />

      {/* Ovelha da frente (direita / inferior) */}
      <path
        d="M11.8 12.4c0-2.6 2.1-4.7 4.7-4.7 1.5 0 2.9.7 3.8 1.9.5-1.1 1.6-1.9 2.9-1.9 2.6 0 4.7 2.1 4.7 4.7v.5c0 .4-.3.7-.6.8l-1.4.5c-.3 1-.9 1.7-1.9 2l-.4 2.6c-.1.8-.8 1.4-1.7 1.4h-5.4c-.9 0-1.6-.6-1.7-1.4l-.4-2.6c-1-.3-1.6-1-1.9-2l-1.4-.5c-.3-.1-.6-.4-.6-.8v-.5Z"
        fill="currentColor"
      />
      <path
        d="M14.2 7.2 12.6 5.4M19.1 7.2 20.7 5.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="14.8" cy="11.2" r=".65" fill="#0B1622" />
      <circle cx="18.1" cy="11.2" r=".65" fill="#0B1622" />
      <path
        d="M15.7 13.4c.5.4 1.1.65 1.9.65s1.4-.25 1.9-.65"
        stroke="#0B1622"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
