/** Classes de layout responsivo — modal Nova entrada de sêmen. */
export const SEMEN_ENTRADA_MODAL_MAX_HEIGHT = "max-h-[calc(100dvh-2rem)]";

export const semenEntradaModalLayout = {
  content: [
    "w-[calc(100%-2rem)] max-w-lg p-0 gap-0 overflow-hidden",
    "!flex !flex-col min-h-0",
    SEMEN_ENTRADA_MODAL_MAX_HEIGHT,
    "[&_[data-slot=dialog-close]]:right-5 [&_[data-slot=dialog-close]]:top-5",
  ].join(" "),
  header: "shrink-0 px-6 pt-6 pb-4 pr-12 space-y-0 text-left",
  form: "flex min-h-0 flex-1 flex-col overflow-hidden",
  body: "min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-6 pb-4 pt-1",
  footer: "shrink-0 border-t border-gray-100 px-6 py-4",
  footerActions: "flex flex-wrap justify-end gap-3",
  fieldGrid: "grid grid-cols-1 sm:grid-cols-2 gap-4",
} as const;
