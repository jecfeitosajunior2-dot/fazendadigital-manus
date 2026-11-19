/** Linha de inserção do cadastro. O dono gravado é o userId recebido. */

export type AnimalFormInput = {
  brinco?: string;
  brincoEletronico?: string;
  nome?: string;
  raca?: string;
  sexo: "macho" | "femea";
  dataNascimento?: string | null;
  pesoAtual?: string;
  loteId?: number;
  categoria?: string;
  observacoes?: string;
  pelagem?: string;
  marca?: string;
  dataDesmama?: string | null;
  castrado?: boolean | null;
  dataEntrada?: string | null;
  pesoEntrada?: string;
  produtorOrigem?: string;
  precoKg?: string;
  frete?: string;
  sisbov?: string;
  dataRnd?: string | null;
  rgn?: string;
  rgd?: string;
  rastreadoNascimento?: boolean;
  maeId?: number | null;
  paiId?: number | null;
  pai?: string;
  mae?: string;
  fazendaId?: number;
  pastoId?: number;
};

export function buildAnimalInsertRow(userId: number, input: AnimalFormInput) {
  return {
    userId,
    brinco: input.brinco,
    brincoEletronico: input.brincoEletronico,
    nome: input.nome,
    raca: input.raca,
    sexo: input.sexo,
    dataNascimento: input.dataNascimento || undefined,
    pesoAtual: input.pesoAtual,
    loteId: input.loteId,
    categoria: input.categoria,
    observacoes: input.observacoes,
    pelagem: input.pelagem,
    marca: input.marca,
    dataDesmama: input.dataDesmama || undefined,
    castrado: input.castrado ?? null,
    dataEntrada: input.dataEntrada || undefined,
    pesoEntrada: input.pesoEntrada,
    produtorOrigem: input.produtorOrigem,
    precoKg: input.precoKg,
    frete: input.frete,
    sisbov: input.sisbov,
    dataRnd: input.dataRnd || undefined,
    rgn: input.rgn,
    rgd: input.rgd,
    rastreadoNascimento: input.rastreadoNascimento,
    maeId: input.maeId ?? undefined,
    paiId: input.paiId ?? undefined,
    pai: input.pai,
    mae: input.mae,
    fazendaId: input.fazendaId,
    pastoId: input.pastoId,
  };
}

export type LinhaInsercaoAnimal = ReturnType<typeof buildAnimalInsertRow>;
