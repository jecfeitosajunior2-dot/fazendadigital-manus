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
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** "danger" pinta o botão de confirmar em vermelho (exclusões). */
  variant?: "danger" | "default";
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

  const confirm = useCallback<ConfirmContextValue>((opts) => {
    setOptions(opts ?? {});
    setOpen(true);
    return new Promise<boolean | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean | null) => {
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

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) settle(abortOnDismiss ? null : false);
        }}
      >
        <AlertDialogContent className="max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
              {variant === "danger" && (
                <span className="material-icons text-[22px] text-red-500">warning</span>
              )}
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 whitespace-pre-line">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              onClick={() => settle(false)}
              className="rounded-full"
              style={{ minHeight: 44 }}
            >
              {cancelText}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className="rounded-full text-white"
              style={{
                minHeight: 44,
                backgroundColor: variant === "danger" ? "#dc2626" : undefined,
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
