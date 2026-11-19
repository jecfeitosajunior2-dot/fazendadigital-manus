export type AnimalAlocacaoRow = {
  id: number;
  numeroVisual: string;
  numeroRfid: string;
  sexo: "macho" | "femea";
  loteNome: string;
  fazendaId?: number | null;
  fazendaSubdivisao: string;
  ultimaMovimentacao: string | null;
};
