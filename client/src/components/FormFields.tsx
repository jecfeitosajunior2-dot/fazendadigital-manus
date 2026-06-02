import React, { useRef } from "react";
import { Calendar } from "lucide-react";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const FD_PRIMARY = "#4ECDC4";

export function FormLabel({
  children,
  required,
  className,
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("block text-[11px] font-semibold text-gray-700 mb-1.5", className)}>
      {children}
      {required && <span className="text-red-500">*</span>}
    </label>
  );
}

export function FieldBox({
  children,
  required,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
  variant?: "default" | "light";
}) {
  return (
    <div
      className={cn(
        variant === "light" ? "bg-white" : "bg-[#EEEEEE]",
        "border border-gray-200 rounded-sm",
        required && "border-l-[3px] border-l-[#4ECDC4]",
        className
      )}
    >
      {children}
    </div>
  );
}

export const inputClass =
  "w-full bg-transparent px-3 py-2.5 text-[13px] text-gray-800 placeholder:text-gray-400 outline-none border-0 h-auto";

export const inputClassCompact =
  "w-full bg-transparent px-2 py-1.5 text-[12px] text-gray-800 placeholder:text-gray-400 outline-none border-0 h-auto min-h-[34px]";

export function FormInput({
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  compact,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <FieldBox required={required}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(compact ? inputClassCompact : inputClass, className)}
      />
    </FieldBox>
  );
}

export function FormNativeSelect({
  value,
  onChange,
  placeholder,
  disabled,
  required,
  compact,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  compact?: boolean;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <FieldBox required={required}>
      <select
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className={cn(
          compact ? inputClassCompact : inputClass,
          "appearance-none cursor-pointer w-full min-h-[42px]"
        )}
        required={required}
      >
        <option value="" disabled={!!value}>
          {placeholder}
        </option>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldBox>
  );
}

export function FormSelect({
  value,
  onChange,
  placeholder,
  disabled,
  required,
  compact,
  displayValue,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  compact?: boolean;
  /** Texto exibido no trigger (útil quando o value é sigla/código). */
  displayValue?: string;
  children: React.ReactNode;
}) {
  // Sempre mantém o Select controlado (nunca passa undefined) para evitar a
  // troca descontrolado→controlado do Radix que impede a atualização visual.
  const selectValue = value ?? "";

  return (
    <FieldBox required={required}>
      <Select value={selectValue} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          className={cn(
            compact ? inputClassCompact : inputClass,
            "w-full shadow-none rounded-none border-0 focus:ring-0 [&>svg]:opacity-60"
          )}
        >
          {displayValue?.trim() ? (
            <span className="flex-1 truncate text-left text-[13px] text-gray-800">{displayValue.trim()}</span>
          ) : (
            <SelectValue placeholder={placeholder} />
          )}
        </SelectTrigger>
        <SelectContent className="max-h-60">{children}</SelectContent>
      </Select>
    </FieldBox>
  );
}

/** Campo de ano com ícone de calendário clicável — estilo iRancho. */
export function FormYearPicker({
  value,
  onChange,
  placeholder = "Selecione o ano de construção",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const dateRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = dateRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.click();
  };

  const handleDatePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    onChange(String(new Date(`${e.target.value}T12:00:00`).getFullYear()));
  };

  return (
    <FieldBox required={required} variant="light">
      <div className="relative flex items-center min-h-[42px]">
        <button
          type="button"
          tabIndex={-1}
          onClick={openPicker}
          className="absolute left-2.5 z-10 flex items-center justify-center text-gray-500 hover:text-[#4ECDC4] transition-colors"
          aria-label="Abrir calendário"
        >
          <Calendar className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onFocus={openPicker}
          placeholder={placeholder}
          className={cn(inputClass, "pl-10 bg-white min-h-[42px] cursor-pointer")}
          readOnly={false}
        />
        <input
          ref={dateRef}
          type="date"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={handleDatePick}
          value={value && value.length === 4 ? `${value}-01-01` : ""}
        />
      </div>
    </FieldBox>
  );
}

/** Campo de data com ícone de calendário — estilo iRancho. */
export function FormDatePicker({
  value,
  onChange,
  placeholder = "Selecione a data",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const dateRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = dateRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.click();
  };

  const displayValue = value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")
    : "";

  return (
    <FieldBox required={required} variant="light">
      <div className="relative flex items-center min-h-[42px]">
        <button
          type="button"
          tabIndex={-1}
          onClick={openPicker}
          className="absolute left-2.5 z-10 flex items-center justify-center text-gray-500 hover:text-[#4ECDC4] transition-colors"
          aria-label="Abrir calendário"
        >
          <Calendar className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </button>
        <input
          type="text"
          value={displayValue}
          onClick={openPicker}
          onFocus={openPicker}
          placeholder={placeholder}
          readOnly
          className={cn(inputClass, "pl-10 bg-white min-h-[42px] cursor-pointer")}
        />
        <input
          ref={dateRef}
          type="date"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </FieldBox>
  );
}

export function FormTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  required,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  className?: string;
}) {
  return (
    <FieldBox required={required}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(inputClass, "resize-y min-h-[80px]", className)}
      />
    </FieldBox>
  );
}

/** Label + FieldBox para inputs nativos ou componentes customizados. */
export function RequiredField({
  label,
  required,
  children,
  labelClassName,
}: {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  labelClassName?: string;
}) {
  return (
    <div>
      <FormLabel required={required} className={labelClassName}>
        {label}
      </FormLabel>
      <FieldBox required={required}>{children}</FieldBox>
    </div>
  );
}

/** Input nativo dentro de FieldBox (formulários compactos). */
export function NativeInput({
  required,
  compact = true,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { required?: boolean; compact?: boolean }) {
  return (
    <FieldBox required={required}>
      <input {...props} className={cn(compact ? inputClassCompact : inputClass, className)} />
    </FieldBox>
  );
}
