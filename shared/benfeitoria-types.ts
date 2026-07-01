export const TIPOS_BENFEITORIA = [
  "Curral",
  "Galpão",
  "Poço",
  "Caixa d’água",
  "Reservatório",
  "Bebedouro",
  "Cocho",
  "Cerca",
  "Casa",
  "Estrada",
  "Ponte",
  "Energia",
  "Depósito",
  "Sistema de água",
  "Sistema de irrigação",
  "Embarcadouro",
  "Tronco de contenção",
  "Balança",
  "Mangueira",
  "Sede",
  "Outros",
] as const;

export const ESTADOS_CONSERVACAO_BENFEITORIA = [
  "Bom",
  "Regular",
  "Ruim",
  "Precisa manutenção",
] as const;

export type BenfeitoriaStatusDb = "ativo" | "manutencao" | "inativo";

export const STATUS_BENFEITORIA_OPTIONS: { value: BenfeitoriaStatusDb; label: string }[] = [
  { value: "ativo", label: "Operacional" },
  { value: "manutencao", label: "Em manutenção" },
  { value: "inativo", label: "Inativo" },
];

export function benfeitoriaStatusLabel(status: BenfeitoriaStatusDb | null | undefined): string {
  return STATUS_BENFEITORIA_OPTIONS.find(o => o.value === status)?.label ?? "Operacional";
}

export function benfeitoriaStatusBadgeClass(status: BenfeitoriaStatusDb | null | undefined): string {
  switch (status) {
    case "manutencao":
      return "bg-amber-100 text-amber-800";
    case "inativo":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-teal-100 text-teal-800";
  }
}
