/**
 * Planejador de migração `.local-data` / `.dev-data` → MySQL.
 *
 * ESTA VERSÃO É SOMENTE DRY-RUN.
 * Não importa driver de banco, pool nem URL de conexão.
 * Não existe caminho de INSERT/UPDATE/DELETE/REPLACE/TRUNCATE/ALTER/CREATE/DROP.
 * Uma futura escrita real precisará de outro arquivo, autorizado à parte.
 *
 * Execução:
 *   pnpm exec tsx scripts/import-local-data-to-mysql.dry-run.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findActiveBrincoConflict, normalizeBrincoKey } from "../shared/brincoAtivo";
import { findRfidConflict, normalizeRfidKey } from "../shared/rfidUnicidade";

export const EXPECTED_USER_ID = 1;

export const LOCAL_DATA_FILES = [
  "fazendas.json",
  "pastos.json",
  "lotes.json",
  "animais.json",
  "pesagens.json",
  "saude-registros.json",
  "reproducao-registros.json",
  "parto-crias.json",
  "historico-brincos.json",
  "animal-baixas.json",
  "animal-lote-movimentacoes.json",
  "lote-pasto-movimentacoes.json",
  "maquinas.json",
  "abastecimentos.json",
  "manutencoes.json",
  "benfeitorias.json",
  "semen-partidas.json",
  "semen-movimentacoes.json",
  "semen-reprodutores-externos.json",
] as const;

/** Entidades de `.dev-data/local.json` que um dia poderão ser migradas. Demo fica de fora. */
export const DEV_DATA_WHITELIST = {
  pessoas: { classe: "B", motivo: "Cadastro de negócio independente (fornecedores/clientes/funcionários)." },
  produtosCatalogo: { classe: "B", motivo: "Catálogo mestre; estoque.produtoId aponta para cá." },
  estoque: {
    classe: "A",
    motivo: "Referenciado por saude-registros.estoqueId e manutencoes.pecas.estoqueId do rebanho real.",
  },
  movimentacoes: {
    classe: "A",
    motivo: "Pode ser referenciado por abastecimentos.movimentacaoEstoqueId.",
  },
  contas: { classe: "B", motivo: "Contas financeiras independentes do rebanho." },
  financeiroMovimentacoes: { classe: "B", motivo: "Lançamentos financeiros independentes do rebanho." },
} as const;

export const DEV_DATA_EXCLUIDOS = {
  fazendas: { classe: "C", motivo: "Fazenda demo 'Minha Fazenda' (userId 0). Não misturar com Fazenda J/B." },
  animais: { classe: "C", motivo: "6 animais de demo (userId 0). Não são o rebanho real." },
  lotes: { classe: "C", motivo: "4 lotes de demo (userId 0), inclusive um lote id 1 de seed. Não recriar." },
  nextFazendaId: { classe: "D", motivo: "Contador. Reconstruir pelo MAX(id)+1." },
  nextEstoqueId: { classe: "D", motivo: "Contador. Reconstruir pelo MAX(id)+1." },
  nextMovId: { classe: "D", motivo: "Contador. Reconstruir pelo MAX(id)+1." },
  nextContaId: { classe: "D", motivo: "Contador. Reconstruir pelo MAX(id)+1." },
  nextFinMovId: { classe: "D", motivo: "Contador. Reconstruir pelo MAX(id)+1." },
  nextAnimalId: { classe: "D", motivo: "Contador de demo. Não usar." },
  nextLoteId: { classe: "D", motivo: "Contador de demo. Não usar." },
  nextPessoaId: { classe: "D", motivo: "Contador. Reconstruir pelo MAX(id)+1." },
  nextProdutoCatalogoId: { classe: "D", motivo: "Contador. Reconstruir pelo MAX(id)+1." },
  rebanhoSeedVersion: { classe: "D", motivo: "Metadado de seed de demo." },
} as const;

const ANIMAL_STATUS = new Set(["ativo", "vendido", "morto", "transferido"]);
const ANIMAL_SEXO = new Set(["macho", "femea"]);
const BAIXA_TIPO = new Set(["venda", "morte", "transferencia"]);
const PASTO_STATUS = new Set(["ativo", "descanso", "vazio", "reforma", "interditado", "reserva", "sem_uso"]);
const COMBUSTIVEL = new Set(["diesel", "gasolina", "etanol", "arla"]);
const BRINCO_MOTIVO = new Set(["perda", "danificado", "reidentificacao", "erro_cadastro", "outro"]);

export type RefKind = "OK" | "HISTÓRICA AUSENTE" | "DEPENDÊNCIA EXTERNA (.dev-data)" | "ERRO/ÓRFÃO";

export type RefIssue = {
  kind: RefKind;
  origem: string;
  registroId: number | null;
  campo: string;
  valor: unknown;
  detalhe: string;
};

export type ValidationIssue = {
  nivel: "erro" | "aviso";
  origem: string;
  registroId?: number | null;
  campo?: string;
  valor?: unknown;
  detalhe: string;
};

export type PlanRow = {
  tabela: string;
  origem: string;
  noPlano: boolean;
  quantidade: number;
  ids: string;
  dependencias: string[];
  validos: number;
  bloqueados: number;
  transformacoes: string[];
  observacoes: string;
};

export type SentinelResult = { nome: string; ok: boolean; detalhe: string };

export type DevDataClass = {
  chave: string;
  classe: "A" | "B" | "C" | "D";
  quantidade: number;
  motivo: string;
};

export type DryRunReport = {
  arquivosLidos: Array<{ arquivo: string; registros: number }>;
  userIdsLocal: number[];
  userIdsDevRebanhoDemo: number[];
  fazendas: Array<{ id: number; nome: string }>;
  lotes: Array<{ id: number; nome: string; fazendaId: number | null }>;
  lote1: { existe: boolean; refsHistoricas: number; detalhe: string };
  animais: number;
  sentinelas: SentinelResult[];
  refs: RefIssue[];
  issues: ValidationIssue[];
  manutencoesPecas: Array<{ manutencaoId: number; pecas: number; estoqueIds: number[] }>;
  cruzamentosDev: Array<{ origem: string; campo: string; ids: number[]; encontradosEmEstoque: number[] }>;
  devClassificacao: DevDataClass[];
  plano: PlanRow[];
  apto: boolean;
  motivosBloqueio: string[];
};

type Rec = Record<string, unknown>;

function projectRootFromMeta(metaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), "..");
}

function asRec(value: unknown): Rec {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

function asRows(value: unknown): Rec[] {
  return Array.isArray(value) ? value.filter((row): row is Rec => !!row && typeof row === "object") : [];
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function intId(value: unknown): number | null {
  const n = num(value);
  return n != null && Number.isInteger(n) ? n : null;
}

function sameNumber(a: unknown, b: number): boolean {
  const n = num(a);
  return n != null && n === b;
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function idsOf(rows: Rec[]): number[] {
  return rows.map(row => intId(row.id)).filter((id): id is number => id != null);
}

function idRange(rows: Rec[]): string {
  const ids = idsOf(rows);
  if (ids.length === 0) return "—";
  return `${Math.min(...ids)}–${Math.max(...ids)}`;
}

function collectUserIds(rows: Rec[]): number[] {
  return [...new Set(rows.map(row => intId(row.userId)).filter((id): id is number => id != null))].sort((a, b) => a - b);
}

function decimalOk(value: unknown): boolean {
  if (value == null || value === "") return true;
  return num(value) != null;
}

export function explodeManutencaoPecas(manutencao: Rec): {
  principal: Rec;
  pecas: Rec[];
} {
  const pecas = asRows(manutencao.pecas);
  const principal = { ...manutencao };
  delete principal.pecas;
  return {
    principal,
    pecas: pecas.map(peca => ({
      manutencaoId: manutencao.id,
      estoqueId: peca.estoqueId ?? null,
      nome: peca.nome,
      quantidade: peca.quantidade,
      valorUnitario: peca.valorUnitario,
      valorTotal: peca.valorTotal,
    })),
  };
}

function addRef(
  refs: RefIssue[],
  issue: RefIssue,
) {
  refs.push(issue);
}

function lookup(ids: Set<number>, value: unknown): "empty" | "hit" | "miss" {
  const id = intId(value);
  if (id == null) return "empty";
  return ids.has(id) ? "hit" : "miss";
}

function checkUserIds(origem: string, rows: Rec[], issues: ValidationIssue[]) {
  for (const row of rows) {
    if (!("userId" in row)) continue;
    const userId = intId(row.userId);
    if (userId !== EXPECTED_USER_ID) {
      issues.push({
        nivel: "erro",
        origem,
        registroId: intId(row.id),
        campo: "userId",
        valor: row.userId,
        detalhe: `userId esperado ${EXPECTED_USER_ID}, encontrado ${String(row.userId)}`,
      });
    }
  }
}

function checkDuplicateIds(origem: string, rows: Rec[], issues: ValidationIssue[]) {
  const seen = new Map<number, number>();
  for (const row of rows) {
    const id = intId(row.id);
    if (id == null) {
      issues.push({ nivel: "erro", origem, detalhe: "Registro sem id inteiro." });
      continue;
    }
    if (seen.has(id)) {
      issues.push({
        nivel: "erro",
        origem,
        registroId: id,
        campo: "id",
        valor: id,
        detalhe: "ID duplicado no arquivo. IDs precisam ser preservados e únicos.",
      });
    }
    seen.set(id, 1);
  }
}

function checkEnum(origem: string, rows: Rec[], campo: string, allowed: Set<string>, issues: ValidationIssue[], required = false) {
  for (const row of rows) {
    const raw = row[campo];
    if (raw == null || raw === "") {
      if (required) {
        issues.push({
          nivel: "erro",
          origem,
          registroId: intId(row.id),
          campo,
          valor: raw,
          detalhe: `Campo obrigatório ${campo} vazio.`,
        });
      }
      continue;
    }
    if (!allowed.has(String(raw))) {
      issues.push({
        nivel: "erro",
        origem,
        registroId: intId(row.id),
        campo,
        valor: raw,
        detalhe: `${campo} fora do enum do schema: ${String(raw)}`,
      });
    }
  }
}

export function assertSentinelas(animais: Rec[], pesagens: Rec[]): SentinelResult[] {
  const byId = new Map(animais.map(row => [intId(row.id), row]));
  const pesagemById = new Map(pesagens.map(row => [intId(row.id), row]));

  const checks: Array<{
    nome: string;
    animalId: number;
    brinco: string;
    rfid: string;
    fazendaId: number;
    peso: number;
    pesagemId: number;
  }> = [
    { nome: "801", animalId: 25, brinco: "801", rfid: "963000400650144", fazendaId: 1, peso: 300, pesagemId: 35 },
    { nome: "802", animalId: 26, brinco: "802", rfid: "963000400650051", fazendaId: 1, peso: 400, pesagemId: 36 },
  ];

  return checks.map(spec => {
    const animal = byId.get(spec.animalId);
    const pesagem = pesagemById.get(spec.pesagemId);
    const falhas: string[] = [];
    if (!animal) falhas.push(`animal id ${spec.animalId} ausente`);
    else {
      if (intId(animal.id) !== spec.animalId) falhas.push(`id != ${spec.animalId}`);
      if (intId(animal.userId) !== EXPECTED_USER_ID) falhas.push(`userId != ${EXPECTED_USER_ID}`);
      if (intId(animal.fazendaId) !== spec.fazendaId) falhas.push(`fazendaId != ${spec.fazendaId}`);
      if (normalizeRfidKey(String(animal.brincoEletronico ?? "")) !== spec.rfid) {
        falhas.push(`RFID != ${spec.rfid}`);
      }
      if (normalizeBrincoKey(String(animal.brinco ?? "")) !== spec.brinco) {
        falhas.push(`brinco != ${spec.brinco}`);
      }
      if (!sameNumber(animal.pesoAtual, spec.peso)) falhas.push(`pesoAtual != ${spec.peso}`);
    }
    if (!pesagem) falhas.push(`pesagem id ${spec.pesagemId} ausente`);
    else {
      if (intId(pesagem.animalId) !== spec.animalId) falhas.push(`pesagem.animalId != ${spec.animalId}`);
      if (!sameNumber(pesagem.peso, spec.peso)) falhas.push(`pesagem ${spec.pesagemId} peso != ${spec.peso}`);
    }
    return {
      nome: spec.nome,
      ok: falhas.length === 0,
      detalhe: falhas.length === 0 ? "OK" : falhas.join("; "),
    };
  });
}

export function runDryRun(projectRoot: string): DryRunReport {
  const localDir = path.join(projectRoot, ".local-data");
  const devFile = path.join(projectRoot, ".dev-data", "local.json");

  const arquivosLidos: Array<{ arquivo: string; registros: number }> = [];
  const local: Record<string, Rec[]> = {};

  for (const file of LOCAL_DATA_FILES) {
    const rows = asRows(readJson(path.join(localDir, file)));
    local[file] = rows;
    arquivosLidos.push({ arquivo: `.local-data/${file}`, registros: rows.length });
  }

  const devRaw = asRec(readJson(devFile));
  arquivosLidos.push({ arquivo: ".dev-data/local.json", registros: 1 });

  const fazendas = local["fazendas.json"];
  const pastos = local["pastos.json"];
  const lotes = local["lotes.json"];
  const animais = local["animais.json"];
  const pesagens = local["pesagens.json"];
  const saude = local["saude-registros.json"];
  const reproducao = local["reproducao-registros.json"];
  const partoCrias = local["parto-crias.json"];
  const historicoBrincos = local["historico-brincos.json"];
  const baixas = local["animal-baixas.json"];
  const movLote = local["animal-lote-movimentacoes.json"];
  const movPasto = local["lote-pasto-movimentacoes.json"];
  const maquinas = local["maquinas.json"];
  const abastecimentos = local["abastecimentos.json"];
  const manutencoes = local["manutencoes.json"];
  const benfeitorias = local["benfeitorias.json"];
  const semenPartidas = local["semen-partidas.json"];
  const semenMovs = local["semen-movimentacoes.json"];
  const semenExternos = local["semen-reprodutores-externos.json"];

  const devEstoque = asRows(devRaw.estoque);
  const devMovs = asRows(devRaw.movimentacoes);
  const devPessoas = asRows(devRaw.pessoas);
  const devProdutos = asRows(devRaw.produtosCatalogo);
  const devContas = asRows(devRaw.contas);
  const devFin = asRows(devRaw.financeiroMovimentacoes);
  const devAnimais = asRows(devRaw.animais);
  const devLotes = asRows(devRaw.lotes);
  const devFazendas = asRows(devRaw.fazendas);

  const issues: ValidationIssue[] = [];
  const refs: RefIssue[] = [];

  if (LOCAL_DATA_FILES.length !== 19) {
    issues.push({ nivel: "erro", origem: ".local-data", detalhe: "Lista oficial de arquivos diferente de 19." });
  }

  for (const [file, rows] of Object.entries(local)) {
    checkDuplicateIds(file, rows, issues);
    checkUserIds(file, rows, issues);
  }

  const fazendaIds = new Set(idsOf(fazendas));
  const pastoIds = new Set(idsOf(pastos));
  const loteIds = new Set(idsOf(lotes));
  const animalIds = new Set(idsOf(animais));
  const reproIds = new Set(idsOf(reproducao));
  const maquinaIds = new Set(idsOf(maquinas));
  const partidaIds = new Set(idsOf(semenPartidas));
  const semenMovIds = new Set(idsOf(semenMovs));
  const estoqueDevIds = new Set(idsOf(devEstoque));
  const movDevIds = new Set(idsOf(devMovs));

  if (!fazendaIds.has(1) || !fazendaIds.has(2)) {
    issues.push({
      nivel: "erro",
      origem: "fazendas.json",
      detalhe: `Fazendas esperadas 1 e 2. Encontradas: ${[...fazendaIds].join(", ") || "nenhuma"}`,
    });
  }

  if (loteIds.has(1)) {
    issues.push({
      nivel: "erro",
      origem: "lotes.json",
      registroId: 1,
      detalhe: "Lote id 1 existe no JSON atual. Não era esperado. Não usar demo do .dev-data.",
    });
  }

  checkEnum("animais.json", animais, "status", ANIMAL_STATUS, issues, true);
  checkEnum("animais.json", animais, "sexo", ANIMAL_SEXO, issues, true);
  checkEnum("animal-baixas.json", baixas, "tipo", BAIXA_TIPO, issues, true);
  checkEnum("pastos.json", pastos, "status", PASTO_STATUS, issues);
  checkEnum("abastecimentos.json", abastecimentos, "combustivel", COMBUSTIVEL, issues, true);
  checkEnum("historico-brincos.json", historicoBrincos, "motivo", BRINCO_MOTIVO, issues, true);

  for (const animal of animais) {
    if (!decimalOk(animal.pesoAtual)) {
      issues.push({
        nivel: "erro",
        origem: "animais.json",
        registroId: intId(animal.id),
        campo: "pesoAtual",
        valor: animal.pesoAtual,
        detalhe: "pesoAtual não é decimal compatível.",
      });
    }
  }

  const loteFazendaById = new Map<number, number | null>();
  for (const lote of lotes) {
    const id = intId(lote.id);
    if (id != null) loteFazendaById.set(id, intId(lote.fazendaId));
  }

  for (let i = 0; i < animais.length; i++) {
    const animal = animais[i]!;
    const rfid = normalizeRfidKey(animal.brincoEletronico == null ? null : String(animal.brincoEletronico));
    if (rfid) {
      const conflito = findRfidConflict(animais as Array<{ id: number; brincoEletronico?: string | null; status?: string | null }>, rfid, {
        excludeAnimalId: intId(animal.id) ?? undefined,
      });
      if (conflito) {
        issues.push({
          nivel: "erro",
          origem: "animais.json",
          registroId: intId(animal.id),
          campo: "brincoEletronico",
          valor: rfid,
          detalhe: `RFID duplicado com animal id ${conflito.id}.`,
        });
      }
    }

    const brinco = String(animal.brinco ?? "");
    const fazendaId = intId(animal.fazendaId) ?? undefined;
    const conflitoBrinco = findActiveBrincoConflict(
      animais as Array<{ id: number; brinco?: string | null; status?: string | null; fazendaId?: number | null; loteId?: number | null }>,
      brinco,
      {
        excludeAnimalId: intId(animal.id) ?? undefined,
        effectiveStatus: String(animal.status ?? "ativo"),
        fazendaId,
        loteFazendaById,
      },
    );
    if (conflitoBrinco) {
      issues.push({
        nivel: "erro",
        origem: "animais.json",
        registroId: intId(animal.id),
        campo: "brinco",
        valor: brinco,
        detalhe: `Brinco visual ativo duplicado na mesma fazenda (outro id ${conflitoBrinco.id}).`,
      });
    }
  }

  const sentinelas = assertSentinelas(animais, pesagens);
  for (const s of sentinelas) {
    if (!s.ok) {
      issues.push({
        nivel: "erro",
        origem: "sentinela",
        detalhe: `Animal ${s.nome}: ${s.detalhe}`,
      });
    }
  }

  function refFazenda(origem: string, row: Rec, campo: string, required = false) {
    const state = lookup(fazendaIds, row[campo]);
    if (state === "empty") {
      if (required) {
        addRef(refs, {
          kind: "ERRO/ÓRFÃO",
          origem,
          registroId: intId(row.id),
          campo,
          valor: row[campo],
          detalhe: `${campo} obrigatório ausente.`,
        });
      }
      return;
    }
    if (state === "hit") {
      addRef(refs, { kind: "OK", origem, registroId: intId(row.id), campo, valor: row[campo], detalhe: "Fazenda existente." });
      return;
    }
    addRef(refs, {
      kind: "ERRO/ÓRFÃO",
      origem,
      registroId: intId(row.id),
      campo,
      valor: row[campo],
      detalhe: "Fazenda inexistente no .local-data.",
    });
  }

  function refPasto(origem: string, row: Rec, campo: string) {
    const state = lookup(pastoIds, row[campo]);
    if (state === "empty") return;
    if (state === "hit") {
      addRef(refs, { kind: "OK", origem, registroId: intId(row.id), campo, valor: row[campo], detalhe: "Pasto existente." });
      return;
    }
    addRef(refs, {
      kind: "ERRO/ÓRFÃO",
      origem,
      registroId: intId(row.id),
      campo,
      valor: row[campo],
      detalhe: "Pasto inexistente no .local-data.",
    });
  }

  function refLote(origem: string, row: Rec, campo: string, required = false) {
    const id = intId(row[campo]);
    if (id == null) {
      if (required) {
        addRef(refs, {
          kind: "ERRO/ÓRFÃO",
          origem,
          registroId: intId(row.id),
          campo,
          valor: row[campo],
          detalhe: `${campo} obrigatório ausente.`,
        });
      }
      return;
    }
    if (loteIds.has(id)) {
      addRef(refs, { kind: "OK", origem, registroId: intId(row.id), campo, valor: id, detalhe: "Lote existente." });
      return;
    }
    if (id === 1) {
      addRef(refs, {
        kind: "HISTÓRICA AUSENTE",
        origem,
        registroId: intId(row.id),
        campo,
        valor: 1,
        detalhe: "Referência histórica ao lote 1, que não existe hoje. Não recriar lote 1.",
      });
      return;
    }
    addRef(refs, {
      kind: "ERRO/ÓRFÃO",
      origem,
      registroId: intId(row.id),
      campo,
      valor: id,
      detalhe: "Lote inexistente (não é o lote 1 histórico).",
    });
  }

  function refAnimal(origem: string, row: Rec, campo: string, required = false) {
    const state = lookup(animalIds, row[campo]);
    if (state === "empty") {
      if (required) {
        addRef(refs, {
          kind: "ERRO/ÓRFÃO",
          origem,
          registroId: intId(row.id),
          campo,
          valor: row[campo],
          detalhe: `${campo} obrigatório ausente.`,
        });
      }
      return;
    }
    if (state === "hit") {
      addRef(refs, { kind: "OK", origem, registroId: intId(row.id), campo, valor: row[campo], detalhe: "Animal existente." });
      return;
    }
    addRef(refs, {
      kind: "ERRO/ÓRFÃO",
      origem,
      registroId: intId(row.id),
      campo,
      valor: row[campo],
      detalhe: "Animal inexistente no rebanho real.",
    });
  }

  for (const row of pastos) refFazenda("pastos.json", row, "fazendaId", true);
  for (const row of lotes) {
    refFazenda("lotes.json", row, "fazendaId");
    refPasto("lotes.json", row, "pastoAtualId");
  }
  for (const row of animais) {
    refFazenda("animais.json", row, "fazendaId");
    refLote("animais.json", row, "loteId");
    refPasto("animais.json", row, "pastoId");
    if (row.maeId != null) refAnimal("animais.json", row, "maeId");
    if (row.paiId != null) refAnimal("animais.json", row, "paiId");
  }
  for (const row of pesagens) refAnimal("pesagens.json", row, "animalId", true);
  for (const row of saude) {
    refAnimal("saude-registros.json", row, "animalId", true);
    const estoqueId = intId(row.estoqueId);
    if (estoqueId != null) {
      addRef(refs, {
        kind: "DEPENDÊNCIA EXTERNA (.dev-data)",
        origem: "saude-registros.json",
        registroId: intId(row.id),
        campo: "estoqueId",
        valor: estoqueId,
        detalhe: estoqueDevIds.has(estoqueId)
          ? `estoque ${estoqueId} existe em .dev-data/local.json.`
          : `estoque ${estoqueId} NÃO encontrado em .dev-data.`,
      });
      if (!estoqueDevIds.has(estoqueId)) {
        issues.push({
          nivel: "erro",
          origem: "saude-registros.json",
          registroId: intId(row.id),
          campo: "estoqueId",
          valor: estoqueId,
          detalhe: "estoqueId não existe nem no .dev-data.",
        });
      }
    }
  }
  for (const row of reproducao) {
    refAnimal("reproducao-registros.json", row, "femeaId", true);
    if (row.machoId != null) refAnimal("reproducao-registros.json", row, "machoId");
  }
  for (const row of partoCrias) {
    refAnimal("parto-crias.json", row, "criaAnimalId", true);
    const partoId = intId(row.partoRegistroId);
    if (partoId == null || !reproIds.has(partoId)) {
      addRef(refs, {
        kind: "ERRO/ÓRFÃO",
        origem: "parto-crias.json",
        registroId: intId(row.id),
        campo: "partoRegistroId",
        valor: row.partoRegistroId,
        detalhe: "Parto/reprodução inexistente.",
      });
    } else {
      addRef(refs, {
        kind: "OK",
        origem: "parto-crias.json",
        registroId: intId(row.id),
        campo: "partoRegistroId",
        valor: partoId,
        detalhe: "Registro de reprodução existente.",
      });
    }
  }
  for (const row of historicoBrincos) refAnimal("historico-brincos.json", row, "animalId", true);
  for (const row of baixas) {
    refAnimal("animal-baixas.json", row, "animalId", true);
    refFazenda("animal-baixas.json", row, "fazendaId", true);
  }
  for (const row of movLote) {
    refAnimal("animal-lote-movimentacoes.json", row, "animalId", true);
    refLote("animal-lote-movimentacoes.json", row, "loteOrigemId");
    refLote("animal-lote-movimentacoes.json", row, "loteDestinoId", true);
    refPasto("animal-lote-movimentacoes.json", row, "pastoOrigemId");
    refPasto("animal-lote-movimentacoes.json", row, "pastoDestinoId");
    refFazenda("animal-lote-movimentacoes.json", row, "fazendaId");
    refFazenda("animal-lote-movimentacoes.json", row, "fazendaOrigemId");
  }
  for (const row of movPasto) {
    refLote("lote-pasto-movimentacoes.json", row, "loteId", true);
    refPasto("lote-pasto-movimentacoes.json", row, "pastoOrigemId");
    refPasto("lote-pasto-movimentacoes.json", row, "pastoDestinoId");
  }
  for (const row of maquinas) refFazenda("maquinas.json", row, "fazendaId");
  for (const row of abastecimentos) {
    const mid = intId(row.maquinaId);
    if (mid == null || !maquinaIds.has(mid)) {
      addRef(refs, {
        kind: "ERRO/ÓRFÃO",
        origem: "abastecimentos.json",
        registroId: intId(row.id),
        campo: "maquinaId",
        valor: row.maquinaId,
        detalhe: "Máquina inexistente.",
      });
    } else {
      addRef(refs, {
        kind: "OK",
        origem: "abastecimentos.json",
        registroId: intId(row.id),
        campo: "maquinaId",
        valor: mid,
        detalhe: "Máquina existente.",
      });
    }
    refFazenda("abastecimentos.json", row, "fazendaId");
    const movEst = intId(row.movimentacaoEstoqueId);
    if (movEst != null) {
      addRef(refs, {
        kind: "DEPENDÊNCIA EXTERNA (.dev-data)",
        origem: "abastecimentos.json",
        registroId: intId(row.id),
        campo: "movimentacaoEstoqueId",
        valor: movEst,
        detalhe: movDevIds.has(movEst)
          ? `movimentação ${movEst} existe em .dev-data.`
          : `movimentação ${movEst} NÃO encontrada em .dev-data.`,
      });
      if (!movDevIds.has(movEst)) {
        issues.push({
          nivel: "erro",
          origem: "abastecimentos.json",
          registroId: intId(row.id),
          campo: "movimentacaoEstoqueId",
          valor: movEst,
          detalhe: "movimentacaoEstoqueId não existe no .dev-data.",
        });
      }
    }
  }
  for (const row of manutencoes) {
    const mid = intId(row.maquinaId);
    if (mid == null || !maquinaIds.has(mid)) {
      addRef(refs, {
        kind: "ERRO/ÓRFÃO",
        origem: "manutencoes.json",
        registroId: intId(row.id),
        campo: "maquinaId",
        valor: row.maquinaId,
        detalhe: "Máquina inexistente.",
      });
    } else {
      addRef(refs, {
        kind: "OK",
        origem: "manutencoes.json",
        registroId: intId(row.id),
        campo: "maquinaId",
        valor: mid,
        detalhe: "Máquina existente.",
      });
    }
  }
  for (const row of benfeitorias) refFazenda("benfeitorias.json", row, "fazendaId");
  for (const row of semenPartidas) {
    refFazenda("semen-partidas.json", row, "fazendaId", true);
    if (row.machoId != null) refAnimal("semen-partidas.json", row, "machoId");
  }
  for (const row of semenExternos) refFazenda("semen-reprodutores-externos.json", row, "fazendaId", true);
  for (const row of semenMovs) {
    refFazenda("semen-movimentacoes.json", row, "fazendaId", true);
    const pid = intId(row.partidaId);
    if (pid == null || !partidaIds.has(pid)) {
      addRef(refs, {
        kind: "ERRO/ÓRFÃO",
        origem: "semen-movimentacoes.json",
        registroId: intId(row.id),
        campo: "partidaId",
        valor: row.partidaId,
        detalhe: "Partida de sêmen inexistente.",
      });
    } else {
      addRef(refs, {
        kind: "OK",
        origem: "semen-movimentacoes.json",
        registroId: intId(row.id),
        campo: "partidaId",
        valor: pid,
        detalhe: "Partida existente.",
      });
    }
    const origemId = intId(row.movimentacaoOrigemId);
    if (origemId != null) {
      if (semenMovIds.has(origemId)) {
        addRef(refs, {
          kind: "OK",
          origem: "semen-movimentacoes.json",
          registroId: intId(row.id),
          campo: "movimentacaoOrigemId",
          valor: origemId,
          detalhe: "Movimentação de origem existente.",
        });
      } else {
        addRef(refs, {
          kind: "ERRO/ÓRFÃO",
          origem: "semen-movimentacoes.json",
          registroId: intId(row.id),
          campo: "movimentacaoOrigemId",
          valor: origemId,
          detalhe: "Movimentação de origem inexistente.",
        });
      }
    }
  }

  const manutencoesPecas = manutencoes.map(row => {
    const exploded = explodeManutencaoPecas(row);
    const estoqueIds = exploded.pecas.map(p => intId(p.estoqueId)).filter((id): id is number => id != null);
    for (const peca of exploded.pecas) {
      const estoqueId = intId(peca.estoqueId);
      if (estoqueId == null) continue;
      addRef(refs, {
        kind: "DEPENDÊNCIA EXTERNA (.dev-data)",
        origem: "manutencoes.json#pecas",
        registroId: intId(row.id),
        campo: "estoqueId",
        valor: estoqueId,
        detalhe: estoqueDevIds.has(estoqueId)
          ? `peça "${String(peca.nome)}" → estoque ${estoqueId} em .dev-data.`
          : `peça "${String(peca.nome)}" → estoque ${estoqueId} NÃO encontrado.`,
      });
      if (!estoqueDevIds.has(estoqueId)) {
        issues.push({
          nivel: "erro",
          origem: "manutencoes.json#pecas",
          registroId: intId(row.id),
          campo: "estoqueId",
          valor: estoqueId,
          detalhe: `Peça sem estoque correspondente no .dev-data.`,
        });
      }
    }
    return { manutencaoId: intId(row.id) ?? -1, pecas: exploded.pecas.length, estoqueIds };
  });

  const saudeEstoqueIds = [...new Set(saude.map(row => intId(row.estoqueId)).filter((id): id is number => id != null))].sort((a, b) => a - b);
  const pecasEstoqueIds = [...new Set(manutencoesPecas.flatMap(m => m.estoqueIds))].sort((a, b) => a - b);
  const abastecimentoMovIds = [...new Set(abastecimentos.map(row => intId(row.movimentacaoEstoqueId)).filter((id): id is number => id != null))].sort((a, b) => a - b);

  const cruzamentosDev = [
    {
      origem: "saude-registros.json",
      campo: "estoqueId",
      ids: saudeEstoqueIds,
      encontradosEmEstoque: saudeEstoqueIds.filter(id => estoqueDevIds.has(id)),
    },
    {
      origem: "manutencoes.json#pecas",
      campo: "estoqueId",
      ids: pecasEstoqueIds,
      encontradosEmEstoque: pecasEstoqueIds.filter(id => estoqueDevIds.has(id)),
    },
    {
      origem: "abastecimentos.json",
      campo: "movimentacaoEstoqueId",
      ids: abastecimentoMovIds,
      encontradosEmEstoque: abastecimentoMovIds.filter(id => movDevIds.has(id)),
    },
  ];

  const lote1Refs = refs.filter(r => r.kind === "HISTÓRICA AUSENTE" && r.valor === 1).length;

  const pecasFuturas = manutencoesPecas.reduce((acc, m) => acc + m.pecas, 0);

  const countKind = (kind: RefKind) => refs.filter(r => r.kind === kind).length;
  const errosRef = countKind("ERRO/ÓRFÃO");
  const errosValidacao = issues.filter(i => i.nivel === "erro").length;

  function plan(
    tabela: string,
    origem: string,
    rows: Rec[],
    dependencias: string[],
    observacoes: string,
  ): PlanRow {
    const bloqueados = issues.filter(i => i.nivel === "erro" && i.origem === origem).length;
    return {
      tabela,
      origem,
      noPlano: true,
      quantidade: rows.length,
      ids: idRange(rows),
      dependencias,
      validos: Math.max(0, rows.length),
      bloqueados,
      transformacoes: [
        "preservar id explícito",
        "preservar userId=1",
        "decimal string → decimal",
        "datas YYYY-MM-DD / timestamps ISO",
      ],
      observacoes,
    };
  }

  const plano: PlanRow[] = [
    {
      tabela: "users",
      origem: "pressuposto (não lido de JSON)",
      noPlano: false,
      quantidade: 1,
      ids: "1",
      dependencias: [],
      validos: 0,
      bloqueados: 1,
      transformacoes: [],
      observacoes: "Futuro users.id=1. NÃO criar, NÃO gerar senha, NÃO executar seed nesta etapa.",
    },
    plan("fazendas", "fazendas.json", fazendas, ["users"], "Preservar ids 1 e 2. camelCase igual ao schema."),
    plan("pastos", "pastos.json", pastos, ["users", "fazendas"], "fazendaId obrigatório. area decimal string → decimal."),
    plan("lotes", "lotes.json", lotes, ["users", "fazendas", "pastos"], "Preservar ids 2–7. NÃO criar lote 1."),
    plan("animais", "animais.json", animais, ["users", "fazendas", "lotes", "pastos"], "Preservar ids 1–26. 801=25 e 802=26."),
    plan("pesagens", "pesagens.json", pesagens, ["users", "animais"], "peso decimal string. data YYYY-MM-DD."),
    plan("historico_brincos", "historico-brincos.json", historicoBrincos, ["users", "animais"], "motivo enum do schema."),
    plan("animal_baixas", "animal-baixas.json", baixas, ["users", "animais", "fazendas"], "tipo venda|morte|transferencia."),
    plan("saude_registros", "saude-registros.json", saude, ["users", "animais", "estoque (.dev-data)"], "estoqueId cruza .dev-data. Não misturar demo."),
    plan("reproducao_registros", "reproducao-registros.json", reproducao, ["users", "animais"], "femeaId/machoId. observacoes podem conter payload interno."),
    plan("parto_crias", "parto-crias.json", partoCrias, ["users", "reproducao_registros", "animais"], "Preservar vínculo parto 23 → crias 16 e 17."),
    plan(
      "animal_lote_movimentacoes",
      "animal-lote-movimentacoes.json",
      movLote,
      ["users", "animais", "lotes", "pastos", "fazendas"],
      "lote 1 histórico: MySQL aceita o inteiro (não há FK física). Não inventar lote.",
    ),
    plan("lote_pasto_movimentacoes", "lote-pasto-movimentacoes.json", movPasto, ["users", "lotes", "pastos"], "Sem referência ao lote 1."),
    plan("maquinas", "maquinas.json", maquinas, ["users", "fazendas"], "fazendaId opcional. valor decimal."),
    plan("abastecimentos", "abastecimentos.json", abastecimentos, ["users", "maquinas", "fazendas", "estoque_movimentacoes (.dev-data)"], "movimentacaoEstoqueId atual está vazio ou nulo."),
    {
      tabela: "manutencoes",
      origem: "manutencoes.json (sem array pecas)",
      noPlano: true,
      quantidade: manutencoes.length,
      ids: idRange(manutencoes),
      dependencias: ["users", "maquinas"],
      validos: manutencoes.length,
      bloqueados: 0,
      transformacoes: ["remover pecas[] do registro principal"],
      observacoes: `${manutencoes.length} manutenções. Peças vão para manutencao_pecas.`,
    },
    {
      tabela: "manutencao_pecas",
      origem: "manutencoes.json#pecas",
      noPlano: true,
      quantidade: pecasFuturas,
      ids: "sem id próprio no JSON",
      dependencias: ["manutencoes", "estoque (.dev-data)"],
      validos: pecasFuturas,
      bloqueados: 0,
      transformacoes: ["explodir pecas[] em linhas; não inventar id de peça"],
      observacoes: "Escrita futura pode usar AUTO_INCREMENT. estoqueId cruza .dev-data.",
    },
    plan("benfeitorias", "benfeitorias.json", benfeitorias, ["users", "fazendas"], "fazendaId opcional."),
    plan("semen_reprodutores_externos", "semen-reprodutores-externos.json", semenExternos, ["users", "fazendas"], "colunas físicas snake_case no schema."),
    plan("semen_partidas", "semen-partidas.json", semenPartidas, ["users", "fazendas", "animais?"], "user_id/fazenda_id no MySQL."),
    plan("semen_movimentacoes", "semen-movimentacoes.json", semenMovs, ["users", "fazendas", "semen_partidas"], "movimentacao_origem_id e grupo_correcao_id."),
    {
      tabela: "pessoas",
      origem: ".dev-data/local.json#pessoas (whitelist B)",
      noPlano: false,
      quantidade: devPessoas.length,
      ids: idRange(devPessoas),
      dependencias: ["users"],
      validos: 0,
      bloqueados: devPessoas.length,
      transformacoes: ["userId 0 do fallback precisaria remapear depois"],
      observacoes: "Apenas relatado. Não entra no plano do rebanho real nesta etapa.",
    },
    {
      tabela: "produtos_catalogo",
      origem: ".dev-data/local.json#produtosCatalogo (whitelist B)",
      noPlano: false,
      quantidade: devProdutos.length,
      ids: idRange(devProdutos),
      dependencias: [],
      validos: 0,
      bloqueados: devProdutos.length,
      transformacoes: ["camelCase JSON → snake_case físico"],
      observacoes: "Apenas relatado. Necessário antes de estoque numa etapa futura.",
    },
    {
      tabela: "estoque",
      origem: ".dev-data/local.json#estoque (whitelist A)",
      noPlano: false,
      quantidade: devEstoque.length,
      ids: idRange(devEstoque),
      dependencias: ["fazendas", "produtos_catalogo"],
      validos: 0,
      bloqueados: devEstoque.length,
      transformacoes: ["preservar ids para saude/manutenção"],
      observacoes: "Apenas relatado. Cruza com o rebanho real. Não importar agora.",
    },
    {
      tabela: "estoque_movimentacoes",
      origem: ".dev-data/local.json#movimentacoes (whitelist A/B)",
      noPlano: false,
      quantidade: devMovs.length,
      ids: idRange(devMovs),
      dependencias: ["estoque"],
      validos: 0,
      bloqueados: devMovs.length,
      transformacoes: ["camelCase → snake_case"],
      observacoes: "Apenas relatado.",
    },
    {
      tabela: "contas_financeiras + movimentacoes",
      origem: ".dev-data contas/financeiroMovimentacoes (whitelist B)",
      noPlano: false,
      quantidade: devContas.length + devFin.length,
      ids: `contas ${idRange(devContas)}; fin ${idRange(devFin)}`,
      dependencias: ["contas_financeiras"],
      validos: 0,
      bloqueados: devContas.length + devFin.length,
      transformacoes: [],
      observacoes: "Apenas relatado. Independente do rebanho.",
    },
    {
      tabela: "animais/lotes DEMO",
      origem: ".dev-data animais+lotes (classe C)",
      noPlano: false,
      quantidade: devAnimais.length + devLotes.length,
      ids: "demo",
      dependencias: [],
      validos: 0,
      bloqueados: devAnimais.length + devLotes.length,
      transformacoes: [],
      observacoes: "NÃO migrar. 6 animais e 4 lotes de seed, userId 0.",
    },
  ];

  const devClassificacao: DevDataClass[] = [
    ...Object.entries(DEV_DATA_WHITELIST).map(([chave, meta]) => ({
      chave,
      classe: meta.classe,
      quantidade:
        chave === "pessoas" ? devPessoas.length
        : chave === "produtosCatalogo" ? devProdutos.length
        : chave === "estoque" ? devEstoque.length
        : chave === "movimentacoes" ? devMovs.length
        : chave === "contas" ? devContas.length
        : chave === "financeiroMovimentacoes" ? devFin.length
        : 0,
      motivo: meta.motivo,
    })),
    ...Object.entries(DEV_DATA_EXCLUIDOS).map(([chave, meta]) => ({
      chave,
      classe: meta.classe,
      quantidade:
        chave === "fazendas" ? devFazendas.length
        : chave === "animais" ? devAnimais.length
        : chave === "lotes" ? devLotes.length
        : 1,
      motivo: meta.motivo,
    })),
  ];

  const motivosBloqueio = [
    ...issues.filter(i => i.nivel === "erro").map(i => `${i.origem}${i.registroId != null ? `#${i.registroId}` : ""}: ${i.detalhe}`),
    ...sentinelas.filter(s => !s.ok).map(s => `Sentinela ${s.nome} falhou: ${s.detalhe}`),
  ];
  const uniqueMotivos = [...new Set(motivosBloqueio)];

  return {
    arquivosLidos,
    userIdsLocal: collectUserIds(Object.values(local).flat()),
    userIdsDevRebanhoDemo: collectUserIds([...devAnimais, ...devLotes, ...devFazendas, ...devPessoas]),
    fazendas: fazendas.map(row => ({ id: intId(row.id) ?? -1, nome: String(row.nome ?? "") })),
    lotes: lotes.map(row => ({
      id: intId(row.id) ?? -1,
      nome: String(row.nome ?? ""),
      fazendaId: intId(row.fazendaId),
    })),
    lote1: {
      existe: loteIds.has(1),
      refsHistoricas: lote1Refs,
      detalhe: loteIds.has(1)
        ? "Lote 1 existe no JSON atual — situação inesperada."
        : `Lote 1 não existe. ${lote1Refs} referências históricas em movimentações. MySQL sem FK física aceitaria o inteiro 1; não recriar o lote.`,
    },
    animais: animais.length,
    sentinelas,
    refs,
    issues,
    manutencoesPecas,
    cruzamentosDev,
    devClassificacao,
    plano,
    apto: uniqueMotivos.length === 0 && errosRef === 0 && errosValidacao === 0 && sentinelas.every(s => s.ok),
    motivosBloqueio: uniqueMotivos,
  };
}

export function formatDryRunReport(report: DryRunReport): string {
  const ok = report.refs.filter(r => r.kind === "OK").length;
  const hist = report.refs.filter(r => r.kind === "HISTÓRICA AUSENTE").length;
  const ext = report.refs.filter(r => r.kind === "DEPENDÊNCIA EXTERNA (.dev-data)").length;
  const err = report.refs.filter(r => r.kind === "ERRO/ÓRFÃO").length;
  const lines: string[] = [];
  lines.push("DRY-RUN MIGRAÇÃO LOCAL → MYSQL");
  lines.push("Modo: somente leitura de JSON. Nenhuma escrita em banco.");
  lines.push("");
  lines.push("Fonte:");
  lines.push(".local-data");
  lines.push(".dev-data");
  lines.push("");
  lines.push("Arquivos lidos:");
  for (const file of report.arquivosLidos) {
    lines.push(`- ${file.arquivo}: ${file.registros}`);
  }
  lines.push("");
  lines.push("Rebanho:");
  lines.push(`${report.animais} animais`);
  lines.push(`Fazendas: ${report.fazendas.map(f => `${f.id} ${f.nome}`).join("; ")}`);
  lines.push(`Lotes: ${report.lotes.map(l => `${l.id} ${l.nome}`).join("; ")}`);
  lines.push(`userId local: ${report.userIdsLocal.join(", ") || "nenhum"}`);
  lines.push("");
  lines.push("Sentinelas:");
  for (const s of report.sentinelas) {
    lines.push(`${s.nome} ${s.ok ? "OK" : "FALHOU"} — ${s.detalhe}`);
  }
  lines.push("");
  lines.push("Lote 1 histórico:");
  lines.push(report.lote1.detalhe);
  lines.push("");
  lines.push("Referências:");
  lines.push(`OK: ${ok}`);
  lines.push(`Históricas ausentes: ${hist}`);
  lines.push(`Dependências .dev-data: ${ext}`);
  lines.push(`Erros reais: ${err}`);
  if (hist > 0) {
    const amostra = report.refs.filter(r => r.kind === "HISTÓRICA AUSENTE").slice(0, 8);
    for (const r of amostra) {
      lines.push(`  · ${r.origem}#${r.registroId} ${r.campo}=${String(r.valor)}`);
    }
    if (hist > amostra.length) lines.push(`  · … +${hist - amostra.length}`);
  }
  if (ext > 0) {
    for (const cruz of report.cruzamentosDev) {
      lines.push(`  · ${cruz.origem}.${cruz.campo}: [${cruz.ids.join(", ") || "nenhum"}] encontrados=[${cruz.encontradosEmEstoque.join(", ")}]`);
    }
  }
  if (err > 0) {
    for (const r of report.refs.filter(x => x.kind === "ERRO/ÓRFÃO")) {
      lines.push(`  · ERRO ${r.origem}#${r.registroId} ${r.campo}=${String(r.valor)} — ${r.detalhe}`);
    }
  }
  lines.push("");
  lines.push("Manutenções → peças (em memória):");
  for (const m of report.manutencoesPecas) {
    lines.push(`- manutenção ${m.manutencaoId}: 1 registro principal + ${m.pecas} linha(s) futuras em manutencao_pecas (estoqueIds ${m.estoqueIds.join(", ") || "—"})`);
  }
  lines.push("");
  lines.push(".dev-data (classificação, sem misturar no rebanho):");
  for (const item of report.devClassificacao) {
    lines.push(`- [${item.classe}] ${item.chave} (${item.quantidade}) — ${item.motivo}`);
  }
  lines.push("");
  lines.push("Plano futuro (ordem):");
  lines.push("users (pressuposto) → fazendas → pastos → lotes → animais →");
  lines.push("pesagens / historico_brincos / animal_baixas → saude_registros →");
  lines.push("reproducao_registros → parto_crias → animal_lote_movimentacoes → lote_pasto_movimentacoes →");
  lines.push("maquinas → abastecimentos → manutencoes → manutencao_pecas → benfeitorias →");
  lines.push("semen_reprodutores_externos → semen_partidas → semen_movimentacoes");
  lines.push("depois, se autorizado: produtos_catalogo → estoque → estoque_movimentacoes → pessoas → financeiro");
  lines.push("");
  for (const p of report.plano.filter(row => row.noPlano)) {
    lines.push(`- ${p.tabela}: ${p.quantidade} (ids ${p.ids}) deps=[${p.dependencias.join(", ")}] ${p.observacoes}`);
  }
  lines.push("");
  if (report.issues.filter(i => i.nivel === "erro").length) {
    lines.push("Erros de validação:");
    for (const issue of report.issues.filter(i => i.nivel === "erro")) {
      lines.push(`- ${issue.origem}${issue.registroId != null ? `#${issue.registroId}` : ""}: ${issue.detalhe}`);
    }
    lines.push("");
  }
  lines.push(`Resultado: ${report.apto ? "APTO PARA PRÓXIMA ETAPA" : "BLOQUEADO"}`);
  if (!report.apto) {
    for (const motivo of report.motivosBloqueio) {
      lines.push(`- ${motivo}`);
    }
  }
  return lines.join("\n");
}

export function assertThisFileCannotWrite(sourceText: string): string[] {
  const body = sourceText.replace(/export function assertThisFileCannotWrite[\s\S]*?\n\}/, "");
  const tokens = [
    "create" + "MysqlPool",
    "DATA" + "BASE_URL",
    "drizzle-orm/" + "mysql2",
    "db" + ".insert",
    "db" + ".update",
    "db" + ".delete",
    "pool" + ".query",
    "INSERT" + " INTO",
    "DELETE" + " FROM",
    "REPLACE" + " INTO",
    "TRUNCATE" + " ",
    "ALTER" + " TABLE",
    "DROP" + " TABLE",
  ];
  return tokens.filter(token => body.includes(token));
}

function isDirectRun(): boolean {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return path.normalize(self) === path.normalize(invoked);
}

if (isDirectRun()) {
  const root = projectRootFromMeta(import.meta.url);
  const ownSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const leaked = assertThisFileCannotWrite(ownSource);
  if (leaked.length) {
    console.error("DRY-RUN bloqueado: o arquivo contém padrão de escrita/conexão:", leaked.join(", "));
    process.exit(2);
  }
  const report = runDryRun(root);
  console.log(formatDryRunReport(report));
  process.exit(report.apto ? 0 : 1);
}
