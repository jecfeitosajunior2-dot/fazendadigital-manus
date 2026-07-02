import { cn } from "@/lib/utils";

export const FAZENDA_OVERVIEW_SELECT_CLASS =
  "text-[12px] border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-700 min-w-[200px] transition-colors focus:outline-none focus:border-[#4ECDC4]";

export type FazendaOverviewOption = { id: number; nome: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  fazendas: FazendaOverviewOption[];
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
};

export default function FazendaOverviewSelect({
  value,
  onChange,
  fazendas,
  emptyLabel = "Selecione uma fazenda",
  className,
  disabled,
}: Props) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={cn(FAZENDA_OVERVIEW_SELECT_CLASS, className)}
    >
      <option value="">{emptyLabel}</option>
      {fazendas.map(f => (
        <option key={f.id} value={String(f.id)}>
          {f.nome}
        </option>
      ))}
    </select>
  );
}
