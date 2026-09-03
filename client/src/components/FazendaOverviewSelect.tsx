import { FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const FAZENDA_OVERVIEW_SELECT_CLASS = "min-w-[200px]";

export type FazendaOverviewOption = { id: number; nome: string };

const EMPTY = "__empty__";

type Props = {
  value: string;
  onChange: (value: string) => void;
  fazendas: FazendaOverviewOption[];
  emptyLabel?: string;
  showEmptyOption?: boolean;
  className?: string;
  disabled?: boolean;
};

export default function FazendaOverviewSelect({
  value,
  onChange,
  fazendas,
  emptyLabel = "Selecione uma fazenda",
  showEmptyOption = true,
  className,
  disabled,
}: Props) {
  return (
    <FormSelect
      variant="light"
      value={value.trim() ? value : EMPTY}
      onChange={v => onChange(v === EMPTY ? "" : v)}
      placeholder={emptyLabel}
      disabled={disabled}
      triggerClassName={cn(FAZENDA_OVERVIEW_SELECT_CLASS, className)}
    >
      {showEmptyOption ? (
        <SelectItem value={EMPTY} className="text-[12px] text-gray-400">
          {emptyLabel}
        </SelectItem>
      ) : null}
      {fazendas.map(f => (
        <SelectItem key={f.id} value={String(f.id)} className="text-[12px]">
          {f.nome}
        </SelectItem>
      ))}
    </FormSelect>
  );
}
