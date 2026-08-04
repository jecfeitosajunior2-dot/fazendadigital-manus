import { createContext, useContext, useState, useCallback, useRef, type MouseEvent, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title?: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** "danger" = exclusão (vermelho). "warning" = inativação/alerta (âmbar). "success" = confirmação positiva (teal). "default" = confirmação neutra. */
  variant?: "danger" | "warning" | "success" | "default";
  /** Fechar pelo X/backdrop resolve null em vez de false. */
  abortOnDismiss?: boolean;
  /**
   * Se informado, mantém o modal aberto até a Promise resolver.
   * Em caso de erro, o modal permanece aberto e exibe a mensagem.
   */
  onConfirm?: () => void | Promise<void>;
  /** Mensagem exibida quando onConfirm rejeita sem Error.message útil. */
  errorFallbackMessage?: string;
};

type ConfirmContextValue = (options?: ConfirmOptions) => Promise<boolean | null>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Provider global de confirmação. Envolve a aplicação e expõe `useConfirm()`.
 * Uso: `const confirm = useConfirm(); if (await confirm({...})) { ...apaga... }`
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const resolverRef = useRef<((value: boolean | null) => void) | null>(null);
  const settledRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmContextValue>((opts) => {
    settledRef.current = false;
    setBusy(false);
    setSubmitError(null);
    setOptions(opts ?? {});
    setOpen(true);
    return new Promise<boolean | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean | null) => {
    if (busy && value !== true) return;
    settledRef.current = true;
    setBusy(false);
    setSubmitError(null);
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, [busy]);

  const {
    title = "Confirmar ação",
    description = "Tem certeza que deseja continuar? Esta ação não pode ser desfeita.",
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    variant = "danger",
    abortOnDismiss = false,
    onConfirm,
    errorFallbackMessage = "Não foi possível concluir a operação. Nenhuma alteração foi realizada.",
  } = options;

  const confirmButtonStyle = (() => {
    if (variant === "danger") return { backgroundColor: "#dc2626" };
    if (variant === "warning") return { backgroundColor: "#D97706" };
    if (variant === "success") return { backgroundColor: "#4ECDC4" };
    return undefined;
  })();

  const handleConfirmClick = async (e: MouseEvent) => {
    e.preventDefault();
    if (busy) return;

    if (!onConfirm) {
      settle(true);
      return;
    }

    setBusy(true);
    setSubmitError(null);
    try {
      await onConfirm();
      settledRef.current = true;
      setBusy(false);
      setOpen(false);
      resolverRef.current?.(true);
      resolverRef.current = null;
    } catch (err) {
      const msg =
        err instanceof Error && err.message.trim()
          ? err.message
          : errorFallbackMessage;
      setSubmitError(msg);
      setBusy(false);
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (o) {
            setOpen(true);
            return;
          }
          if (busy) {
            setOpen(true);
            return;
          }
          setOpen(false);
          if (settledRef.current) {
            settledRef.current = false;
            return;
          }
          resolverRef.current?.(abortOnDismiss ? null : false);
          resolverRef.current = null;
        }}
      >
        <AlertDialogContent
          className="max-w-[420px]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
              {variant === "danger" && (
                <span className="material-icons text-[22px] text-red-500">warning</span>
              )}
              {variant === "warning" && (
                <span className="material-icons text-[22px] text-amber-600">info</span>
              )}
              {title}
            </AlertDialogTitle>
            {typeof description === "string" ? (
              <AlertDialogDescription className="text-gray-600 whitespace-pre-line">
                {description}
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription asChild>
                <div className="text-sm text-gray-600">{description}</div>
              </AlertDialogDescription>
            )}
            {submitError ? (
              <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2 mt-1" role="alert">
                {submitError}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              ref={cancelRef}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (busy) return;
                settle(false);
              }}
              className="rounded-full border-0 bg-gray-100 text-gray-800 shadow-none hover:bg-gray-200 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none"
              style={{ minHeight: 44 }}
            >
              {cancelText}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={e => void handleConfirmClick(e)}
              className="rounded-full text-white hover:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none"
              style={{
                minHeight: 44,
                ...confirmButtonStyle,
              }}
            >
              {busy ? "Aguarde..." : confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Hook para abrir o diálogo de confirmação. Retorna uma Promise<boolean>.
 */
export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm deve ser usado dentro de <ConfirmDialogProvider>");
  }
  return ctx;
}
