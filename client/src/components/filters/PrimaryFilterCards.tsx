import { type ReactNode } from "react";
import { SelectItem } from "@/components/ui/select";
import { FormSelect } from "@/components/FormFields";

export const labelClass =
  "block text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0 leading-none";

export const PRIMARY_FILTER_ICON_BOX =
  "inline-flex items-center justify-center w-4 h-4 shrink-0 overflow-hidden";

export const PRIMARY_FILTER_ICON_INNER = "flex items-center justify-center w-full h-full";

export const primaryFilterIconColor = (active?: boolean) =>
  active ? "text-[#4ECDC4]" : "text-gray-400";

export const filterInputClass =
  "w-full h-[28px] px-2 text-[12px] border-0 border-b-2 border-gray-200 bg-transparent text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#4ECDC4] transition-colors duration-150";

export const filterSelectTriggerClass =
  "w-full h-[28px] min-h-[28px] px-2 pr-1 text-[12px] leading-[16px] border-0 border-b-2 border-gray-200 rounded-none bg-transparent shadow-none text-gray-800 focus:border-[#4ECDC4] focus-visible:border-[#4ECDC4] focus-visible:ring-0 focus-visible:ring-offset-0";

export const FILTER_SELECT_EMPTY = "__empty__";

export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  allowEmpty = true,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const current = String(value ?? "").trim();
  return (
    <FormSelect
      variant="light"
      disabled={disabled}
      value={allowEmpty && !current ? FILTER_SELECT_EMPTY : current}
      onChange={v => onChange(allowEmpty && v === FILTER_SELECT_EMPTY ? "" : v)}
      placeholder={placeholder}
      triggerClassName={filterSelectTriggerClass}
    >
      {allowEmpty ? (
        <SelectItem value={FILTER_SELECT_EMPTY} className="text-[12px] text-gray-400">
          {placeholder}
        </SelectItem>
      ) : null}
      {options.map(o => (
        <SelectItem key={o.value} value={o.value} className="text-[12px]">
          {o.label}
        </SelectItem>
      ))}
    </FormSelect>
  );
}

/** Card de filtro principal com ícone e underline verde (#4ECDC4) quando ativo. */
export function PrimaryFilterCard({
  label,
  icon,
  children,
  active,
  customIcon,
  iconNode,
  iconOpticalScale = 1,
  embedded,
}: {
  label: string;
  icon: string;
  children: ReactNode;
  active?: boolean;
  customIcon?: string;
  iconNode?: ReactNode;
  iconOpticalScale?: number;
  embedded?: boolean;
}) {
  const iconInnerStyle = iconOpticalScale !== 1 ? { transform: `scale(${iconOpticalScale})` } : undefined;

  const renderIcon = (node: ReactNode) => (
    <span className={PRIMARY_FILTER_ICON_INNER} style={iconInnerStyle}>
      {node}
    </span>
  );

  return (
    <div
      className={`relative flex flex-col transition-all duration-150 ${
        embedded
          ? `rounded px-2 pt-1 pb-0.5 ${active ? "bg-[#4ECDC4]/10" : "bg-gray-50/50"}`
          : `bg-white rounded px-2 pt-1 pb-0.5 border ${active ? "border-[#4ECDC4] shadow-[0_0_0_1px_rgba(78,205,196,0.12)]" : "border-gray-200 hover:border-gray-300"}`
      }`}
    >
      <div className="flex items-center gap-1 mb-0.5 h-4">
        {iconNode ? (
          <span className={`${PRIMARY_FILTER_ICON_BOX} ${primaryFilterIconColor(active)}`}>
            {renderIcon(iconNode)}
          </span>
        ) : customIcon ? (
          <span className={PRIMARY_FILTER_ICON_BOX}>
            {renderIcon(
              <img
                src={customIcon}
                alt={label}
                className="w-full h-full object-contain"
                style={{ filter: active ? "none" : "grayscale(0.4) opacity(0.6)" }}
              />,
            )}
          </span>
        ) : (
          <span className={`${PRIMARY_FILTER_ICON_BOX} ${primaryFilterIconColor(active)}`}>
            {renderIcon(<span className="material-icons text-[14px] leading-none">{icon}</span>)}
          </span>
        )}
        <label
          className={`text-[9px] font-semibold uppercase tracking-wider leading-none truncate ${primaryFilterIconColor(active)}`}
        >
          {label}
        </label>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function FilterCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-2.5 py-2 flex flex-col h-full">
      <label className={labelClass}>{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
