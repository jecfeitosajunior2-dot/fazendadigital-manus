import { cn } from "@/lib/utils";

export const FD_SEM_COORDENADAS_COLOR = "#E53E5A";

type SemCoordenadasIconProps = {
  size?: number;
  className?: string;
};

/** Pin vermelho com furo central — subdivisão sem coordenadas */
export default function SemCoordenadasIcon({ size = 17, className }: SemCoordenadasIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        fill={FD_SEM_COORDENADAS_COLOR}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2c-4.42 0-8 3.58-8 8 0 4.6 8 13.25 8 13.25S20 14.6 20 10c0-4.42-3.58-8-8-8Zm0 9.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z"
      />
      <circle cx="12" cy="23.75" r="1.75" fill={FD_SEM_COORDENADAS_COLOR} />
    </svg>
  );
}
