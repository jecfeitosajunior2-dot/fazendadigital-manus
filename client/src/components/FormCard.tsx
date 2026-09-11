import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Card de formulário — padrão Nova Venda / cadastros. */
export function FormCard({
  title,
  variant = "section",
  children,
  footer,
  subtitle,
  className,
  compact = false,
}: {
  title: string;
  variant?: "page" | "section";
  children?: ReactNode;
  footer?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  /** Menos padding — modais e painéis estreitos. */
  compact?: boolean;
}) {
  const hasBody = Boolean(children) || Boolean(footer);
  return (
    <div
      className={cn(
        "bg-white border border-gray-200 rounded shadow-sm overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          hasBody && "border-b border-gray-100",
          compact ? "px-3 py-2.5" : "px-5 py-4",
        )}
      >
        {variant === "page" ? (
          <>
            <h1
              className={cn(
                "font-semibold text-gray-900",
                compact ? "text-[16px] leading-tight" : "text-[20px]",
              )}
              style={compact ? undefined : { fontFamily: "Fraunces, serif" }}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className={cn("text-gray-500", compact ? "mt-0.5 text-[10px]" : "mt-1 text-[11px]")}>
                {subtitle}
              </p>
            ) : null}
          </>
        ) : (
          <h2
            className={cn(
              "font-semibold text-[#4ECDC4]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {title}
          </h2>
        )}
      </div>
      {hasBody ? (
        <div className={cn(compact ? "p-3 space-y-3" : "p-5 space-y-4")}>
          {children}
          {footer ? (
            <div
              className={cn(
                "border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end",
                compact ? "pt-3 gap-2" : "pt-4 gap-3",
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
