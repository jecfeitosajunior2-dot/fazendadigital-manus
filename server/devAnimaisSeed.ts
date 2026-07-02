import {
  LISTA_ANIMAIS_PRINT,
  REBANHO_SEED_VERSION,
} from "../shared/listaAnimaisDemo";

export { REBANHO_SEED_VERSION, LISTA_ANIMAIS_PRINT };

export type DevAnimal = {
  id: number;
  userId: number;
  brinco: string | null;
  brincoEletronico: string | null;
  nome: string | null;
  raca: string | null;
  sexo: "macho" | "femea";
  dataNascimento: string | null;
  pesoAtual: string | null;
  status: "ativo" | "vendido" | "morto" | "transferido";
  loteId: number | null;
  fazendaId: number | null;
  pastoId: number | null;
  categoria: string | null;
  castrado: boolean | null;
  dataEntrada: string | null;
  pesoEntrada: string | null;
  createdAt: Date | null;
  idadeMesesFix: number | null;
  diasNaFazendaFix: number | null;
  ganhoKgFix: number | null;
  gmdFix: number | null;
};

export type DevLote = {
  id: number;
  userId: number;
  nome: string;
  sigla: string | null;
  dataCriacao: string | null;
  descricao: string | null;
  localizacao: string | null;
  capacidade: number | null;
  fazendaId: number | null;
  pastoAtualId: number | null;
  dataEntradaPasto: string | null;
  ativo: boolean | null;
  createdAt: Date | null;
};

function birthDateFromIdadeMeses(idadeMeses: number): string {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round(idadeMeses * 30.44);
  const nasc = new Date(hoje);
  nasc.setDate(nasc.getDate() - dias);
  return nasc.toISOString().slice(0, 10);
}

export function buildDevRebanhoSeed(userId = 0) {
  const createdAt = new Date();
  const lotNames = [...new Set(LISTA_ANIMAIS_PRINT.map(a => a.lote))];
  const lotes: DevLote[] = lotNames.map((nome, index) => ({
    id: index + 1,
    userId,
    nome,
    sigla: null,
    dataCriacao: "2024-01-01",
    descricao: null,
    localizacao: null,
    capacidade: null,
    fazendaId: 1,
    pastoAtualId: null,
    dataEntradaPasto: null,
    ativo: true,
    createdAt,
  }));
  const loteIdByName = new Map(lotes.map(l => [l.nome, l.id]));

  const animais: DevAnimal[] = LISTA_ANIMAIS_PRINT.map(row => ({
    id: row.id,
    userId,
    brinco: row.brinco,
    brincoEletronico: null,
    nome: null,
    raca: row.brinco === "25" ? null : "Nelore",
    sexo: row.sexo,
    dataNascimento: birthDateFromIdadeMeses(row.idadeMeses),
    pesoAtual: row.pesoAtual ?? null,
    status: "ativo",
    loteId: loteIdByName.get(row.lote) ?? null,
    fazendaId: 1,
    pastoId: null,
    categoria: row.categoria,
    castrado: null,
    dataEntrada: null,
    pesoEntrada: null,
    createdAt,
    idadeMesesFix: row.idadeMeses,
    diasNaFazendaFix: row.diasNaFazenda,
    ganhoKgFix: row.ganhoKg ?? null,
    gmdFix: row.gmd ?? null,
  }));

  return {
    lotes,
    animais,
    nextAnimalId: animais.length + 1,
    nextLoteId: lotes.length + 1,
  };
}
