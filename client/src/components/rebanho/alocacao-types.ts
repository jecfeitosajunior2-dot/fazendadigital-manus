export type AnimalAlocacaoRow = {
  id: number;
  numeroVisual: string;
  numeroRfid: string;
  sexo: "macho" | "femea";
  loteNome: string;
  fazendaSubdivisao: string;
  ultimaMovimentacao: string | null;
};
