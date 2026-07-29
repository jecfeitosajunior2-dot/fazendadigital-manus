import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
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
  const resolverRef = useRef<((value: boolean | null) => void) | null>(null);
  const settledRef = useRef(false);

  const confirm = useCallback<ConfirmContextValue>((opts) => {
    settledRef.current = false;
    setOptions(opts ?? {});
    setOpen(true);
    return new Promise<boolean | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean | null) => {
    settledRef.current = true;
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const {
    title = "Confirmar ação",
    description = "Tem certeza que deseja continuar? Esta ação não pode ser desfeita.",
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    variant = "danger",
    abortOnDismiss = false,
  } = options;

  const confirmButtonStyle = (() => {
    if (variant === "danger") return { backgroundColor: "#dc2626" };
    if (variant === "warning") return { backgroundColor: "#D97706" };
    if (variant === "success") return { backgroundColor: "#4ECDC4" };
    return undefined;
  })();

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
          setOpen(false);
          if (settledRef.current) {
            settledRef.current = false;
            return;
          }
          resolverRef.current?.(abortOnDismiss ? null : false);
          resolverRef.current = null;
        }}
      >
        <AlertDialogContent className="max-w-[420px]">
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
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              onClick={(e) => {
                e.preventDefault();
                settle(false);
              }}
              className="rounded-full border-0 bg-gray-100 text-gray-800 shadow-none hover:bg-gray-200 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
              style={{ minHeight: 44 }}
            >
              {cancelText}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                settle(true);
              }}
              className="rounded-full text-white hover:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                minHeight: 44,
                ...confirmButtonStyle,
              }}
            >
              {confirmText}
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
