import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata CPF (11 dígitos) ou CNPJ (14 dígitos) enquanto digita. */
/** Formata valor monetário BRL enquanto digita (centavos). */
export function formatCurrencyBrl(value: string): string {
  const digits = value.replace(/\D/g, "");
  const num = parseInt(digits || "0", 10) / 100;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Extrai número decimal de string formatada em BRL. */
export function parseCurrencyBrl(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return (parseInt(digits, 10) / 100).toFixed(2);
}

/** Formata porcentagem enquanto digita. */
export function formatPercent(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 3);
  if (!digits) return "";
  return `${parseInt(digits, 10)}%`;
}

/** Extrai número de string com %. */
export function parsePercent(value: string): number | undefined {
  const digits = value.replace(/\D/g, "");
  if (!digits) return undefined;
  const n = parseInt(digits, 10);
  return n > 100 ? 100 : n;
}

export function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Máscara de telefone BR: (00) 0000-0000 ou (00) 00000-0000. */
export function formatPhoneBR(value: string): string {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";

  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
