import React from "react";
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
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-[#EEEEEE] border border-gray-200 rounded-sm overflow-hidden",
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

export function FormSelect({
  value,
  onChange,
  placeholder,
  disabled,
  required,
  compact,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FieldBox required={required}>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          className={cn(
            compact ? inputClassCompact : inputClass,
            "shadow-none rounded-none border-0 focus:ring-0 [&>svg]:opacity-60"
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-60">{children}</SelectContent>
      </Select>
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
