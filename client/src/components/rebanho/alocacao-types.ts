export type AnimalAlocacaoRow = {
  id: number;
  displayId: string;
  sexo: "macho" | "femea";
  loteNome: string;
  fazendaSubdivisao: string;
  ultimaMovimentacao: string | null;
};
