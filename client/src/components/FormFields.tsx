import React, { useRef } from "react";
import { Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const FD_PRIMARY = "#4ECDC4";
/** Fundo suave para estado ativo/selecionado (~8% opacidade). */
export const FD_PRIMARY_SUBTLE_BG = `${FD_PRIMARY}14`;

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
  invalid,
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
  variant?: "default" | "light";
  /** Destaca borda em vermelho (validação). */
  invalid?: boolean;
}) {
  return (
    <div
      className={cn(
        variant === "light" ? "bg-white" : "bg-[#EEEEEE]",
        "border rounded-sm",
        invalid ? "border-red-500" : "border-gray-200",
        required && !invalid && "border-l-[3px] border-l-[#4ECDC4]",
        required && invalid && "border-l-[3px] border-l-red-500",
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
  onBlur,
  placeholder,
  type = "text",
  inputMode,
  required,
  compact,
  className,
  variant = "default",
  min,
  step,
  list,
  id,
  invalid,
  readOnly,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  required?: boolean;
  compact?: boolean;
  className?: string;
  variant?: "default" | "light";
  min?: string | number;
  step?: string | number;
  list?: string;
  id?: string;
  invalid?: boolean;
  readOnly?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <FieldBox required={required} variant={variant} invalid={invalid}>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        readOnly={readOnly}
        onChange={e => {
          if (readOnly) return;
          onChange(e.target.value);
        }}
        onBlur={onBlur ? e => onBlur(e.target.value) : undefined}
        placeholder={placeholder}
        min={min}
        step={step}
        list={list}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        className={cn(
          compact ? inputClassCompact : inputClass,
          variant === "light" && "bg-white",
          className,
        )}
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
  variant = "default",
  id,
  invalid,
  modal,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  compact?: boolean;
  options: readonly { value: string; label: string }[];
  variant?: "default" | "light";
  id?: string;
  invalid?: boolean;
  /** false evita conflito quando o select fica dentro de Popover/Dialog. */
  modal?: boolean;
  "aria-describedby"?: string;
}) {
  const mergedOptions = React.useMemo(() => {
    const current = String(value ?? "").trim();
    if (!current) return options;
    if (options.some(o => o.value === current)) return options;
    return [{ value: current, label: current }, ...options];
  }, [value, options]);

  // Usa Select (Radix) em vez de <select> nativo para forçar abertura para baixo
  // (o nativo do Windows abre para cima quando a lista é longa).
  return (
    <FormSelect
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      compact={compact}
      variant={variant}
      id={id}
      invalid={invalid}
      modal={modal}
      aria-describedby={ariaDescribedBy}
    >
      {mergedOptions.map(o => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </FormSelect>
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
  triggerClassName,
  variant = "default",
  children,
  id,
  invalid,
  modal = true,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  compact?: boolean;
  /** Texto exibido no trigger (útil quando o value é sigla/código). */
  displayValue?: string;
  triggerClassName?: string;
  variant?: "default" | "light";
  children: React.ReactNode;
  id?: string;
  invalid?: boolean;
  /** false evita conflito quando o select fica dentro de Popover/Dialog. */
  modal?: boolean;
  "aria-describedby"?: string;
}) {
  // Radix não aceita value="". Vazio = sem value (placeholder).
  // `key` remonta o Select ao hidratar edição (evita trigger “preso” no placeholder).
  const trimmed = String(value ?? "").trim();

  return (
    <FieldBox required={required} variant={variant} invalid={invalid}>
      <Select
        key={trimmed ? `sel:${trimmed}` : "sel:empty"}
        value={trimmed || undefined}
        onValueChange={onChange}
        disabled={disabled}
        modal={modal}
      >
        <SelectTrigger
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedBy}
          className={cn(
            compact ? inputClassCompact : inputClass,
            "w-full min-h-[42px] justify-between pr-3 shadow-none rounded-none border-0 focus:ring-0 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-gray-500 [&>svg]:opacity-70",
            triggerClassName,
          )}
        >
          {displayValue?.trim() ? (
            <span className="flex-1 truncate text-left text-[13px] text-gray-800">{displayValue.trim()}</span>
          ) : (
            <SelectValue placeholder={placeholder} />
          )}
        </SelectTrigger>
        <SelectContent className="max-h-60" side="bottom" avoidCollisions={false}>
          {children}
        </SelectContent>
      </Select>
    </FieldBox>
  );
}

const ANO_MINIMO_PADRAO = 1900;

function listarAnos(minYear: number, maxYear: number): string[] {
  const anos: string[] = [];
  for (let ano = maxYear; ano >= minYear; ano--) anos.push(String(ano));
  return anos;
}

/** Seletor de ano — lista suspensa sem dia/mês. */
export function FormYearPicker({
  value,
  onChange,
  placeholder = "Selecione o ano",
  required,
  minYear = ANO_MINIMO_PADRAO,
  maxYear = new Date().getFullYear() + 1,
  id,
  invalid,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minYear?: number;
  maxYear?: number;
  id?: string;
  invalid?: boolean;
  "aria-describedby"?: string;
}) {
  const anos = React.useMemo(() => listarAnos(minYear, maxYear), [minYear, maxYear]);
  const opcoes = React.useMemo(() => {
    const atual = String(value ?? "").trim();
    if (atual && !anos.includes(atual)) return [atual, ...anos];
    return anos;
  }, [anos, value]);

  return (
    <FormSelect
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      displayValue={value}
      triggerClassName="h-[42px] py-0"
      invalid={invalid}
      aria-describedby={ariaDescribedBy}
    >
      {opcoes.map(ano => (
        <SelectItem key={ano} value={ano} className="text-[13px]">
          {ano}
        </SelectItem>
      ))}
    </FormSelect>
  );
}

/** Campo de data com digitação manual (DD/MM/AAAA) e ícone de calendário — estilo iRancho. */
export function FormDatePicker({
  value,
  onChange,
  placeholder = "DD/MM/AAAA",
  required,
  max,
  id,
  invalid,
  minHeight = 34,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Limite superior YYYY-MM-DD (ex.: hoje). */
  max?: string;
  id?: string;
  invalid?: boolean;
  /** Altura mínima do campo — 42 em formulários de cadastro, 34 em filtros/manejos. */
  minHeight?: 34 | 42;
  "aria-describedby"?: string;
}) {
  const dateRef = useRef<HTMLInputElement>(null);
  const [inputText, setInputText] = React.useState("");
  const [focused, setFocused] = React.useState(false);

  // Sincroniza inputText com value externo (ex: ao carregar modo edição)
  React.useEffect(() => {
    if (!focused) {
      setInputText(value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "");
    }
  }, [value, focused]);

  const openPicker = () => {
    const el = dateRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.click();
  };

  // Formata automaticamente enquanto o usuário digita: 01/01/2024
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    let formatted = raw;
    if (raw.length > 4) formatted = raw.slice(0, 2) + "/" + raw.slice(2, 4) + "/" + raw.slice(4);
    else if (raw.length > 2) formatted = raw.slice(0, 2) + "/" + raw.slice(2);
    setInputText(formatted);

    // Quando tiver 8 dígitos (ddmmaaaa), converte para YYYY-MM-DD
    if (raw.length === 8) {
      const dd = raw.slice(0, 2);
      const mm = raw.slice(2, 4);
      const yyyy = raw.slice(4, 8);
      const iso = `${yyyy}-${mm}-${dd}`;
      const d = new Date(`${iso}T12:00:00`);
      if (!isNaN(d.getTime())) {
        onChange(iso);
      }
    } else if (raw.length === 0) {
      onChange("");
    }
  };

  const handleBlur = () => {
    setFocused(false);
    // Se o texto não está completo, limpa
    const raw = inputText.replace(/\D/g, "");
    if (raw.length > 0 && raw.length < 8) {
      setInputText("");
      onChange("");
    } else if (raw.length === 0) {
      setInputText("");
    }
  };

  const displayValue = focused ? inputText : (value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : inputText);

  return (
    <FieldBox required={required} variant="light" invalid={invalid}>
      <div
        className="flex w-full items-center justify-start gap-2 pl-1.5 pr-2"
        style={{ minHeight: minHeight }}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={openPicker}
          className="shrink-0 inline-flex items-center justify-center text-[#4ECDC4] hover:text-[#0F766E] transition-colors"
          aria-label="Abrir calendário"
        >
          <Calendar className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleTextChange}
          onFocus={() => { setFocused(true); setInputText(value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : ""); }}
          onBlur={handleBlur}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedBy}
          className="w-full min-w-0 flex-1 bg-transparent border-0 outline-none py-1.5 text-[12px] leading-none text-left text-gray-800 placeholder:text-gray-400"
          style={{ textAlign: "left", paddingLeft: 0, marginLeft: 0 }}
        />
        <input
          ref={dateRef}
          type="date"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          value={value}
          max={max}
          onChange={e => {
            onChange(e.target.value);
            setFocused(false);
          }}
        />
      </div>
    </FieldBox>
  );
}

export function FormTextarea({
  value,
  onChange,
  onFocus,
  placeholder,
  rows = 4,
  required,
  invalid,
  className,
  variant = "default",
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  invalid?: boolean;
  className?: string;
  variant?: "default" | "light";
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <FieldBox required={required} variant={variant} invalid={invalid}>
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={ariaInvalid ?? invalid}
        aria-describedby={ariaDescribedBy}
        className={cn(inputClassCompact, "resize-y min-h-[80px]", className)}
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
