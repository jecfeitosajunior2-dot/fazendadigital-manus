/** Classes de layout responsivo — modal Nova entrada de sêmen. */
export const SEMEN_ENTRADA_MODAL_MAX_HEIGHT =
  "max-h-[min(32rem,calc(100dvh-3rem))]";

/** Campo branco arredondado dentro dos cards do modal. */
export const SEMEN_ENTRADA_FIELD_LIGHT =
  "box-border w-full text-[12px] leading-[16px] border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-700 bg-white min-h-[34px] outline-none focus:border-[#4ECDC4] transition-colors placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed";

export const semenEntradaModalLayout = {
  content: [
    "w-[calc(100%-1.5rem)] max-w-md p-0 gap-0 overflow-hidden rounded-xl border-gray-100 shadow-xl",
    "!flex !flex-col min-h-0 bg-[#F7F9FA]",
    SEMEN_ENTRADA_MODAL_MAX_HEIGHT,
    "!top-[50%] !left-1/2 !-translate-x-1/2 !-translate-y-1/2",
    "[&_[data-slot=dialog-close]]:right-4 [&_[data-slot=dialog-close]]:top-3.5",
  ].join(" "),
  shell: "flex min-h-0 max-h-full flex-1 flex-col overflow-hidden",
  header: "shrink-0 px-4 pt-4 pb-2 pr-11 space-y-0 text-left bg-white border-b border-gray-100",
  form: "flex min-h-0 flex-1 flex-col overflow-hidden",
  body: "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-2.5",
  formCard:
    "rounded-lg border border-gray-100 bg-white shadow-sm p-3 space-y-3 divide-y divide-gray-100 [&>section]:pt-0 [&>section:not(:first-child)]:pt-3",
  section: "space-y-2",
  sectionTitle:
    "text-[10px] font-semibold uppercase tracking-wide text-[#2D5A5A]/70 mb-1.5",
  infoLine: "text-[11px] text-gray-500 -mt-0.5",
  footer: "shrink-0 border-t border-gray-100 px-4 py-2.5 bg-white",
  footerActions: "flex flex-wrap justify-end gap-2",
  fieldGrid: "grid grid-cols-1 sm:grid-cols-2 gap-2",
  fieldGrid3: "grid grid-cols-1 sm:grid-cols-3 gap-2",
} as const;
