import { persistirCapital } from "./estoqueCapital";

export const MANUT_STATUS_CONCLUIDA = "concluida";
export const MANUT_STATUS_ESTORNADO = "estornado";

export const MANUT_MOV_TIPO = "Saída";
export const MANUT_MOV_MANEJO = "Manutenção";

export const MOTIVO_ESTORNO_MANUT_PADRAO = "Estorno da manutenção";

export const MSG_ESTORNO_GENERICO_MANUTENCAO =
  "Esta movimentação foi gerada por uma manutenção e deve ser estornada pelo módulo de Manutenção.";

export const MSG_MANUT_ESTORNO_LEGADO =
  "Esta manutenção é anterior ao controle patrimonial por movimentação e não pode ser estornada automaticamente com segurança.";

export const MSG_MANUT_VINCULO_INVALIDO =
  "A movimentação de estoque desta manutenção não confere. O estorno foi bloqueado.";

export const MSG_MANUT_MOV_JA_ESTORNADA =
  "A movimentação de estoque desta manutenção já foi estornada.";

export const MSG_MANUT_NAO_ENCONTRADA = "Manutenção não encontrada.";

export const MSG_MANUT_EDICAO_PATRIMONIAL =
  "Esta manutenção já consumiu estoque com movimentação oficial. Estorne a OS e registre uma nova para corrigir as peças.";

export const MSG_MANUT_MYSQL_OBRIGATORIO =
  "O consumo de peças da manutenção precisa do estoque oficial. O banco está indisponível — tente novamente.";

export const MSG_MANUT_ESTOQUE_AUSENTE_MYSQL =
  "Produto de estoque não encontrado no banco oficial. A manutenção não baixa peça pelo arquivo local.";

export type DecisaoEstornoManutencao =
  | { kind: "ja_estornado" }
  | { kind: "sem_consumo" }
  | { kind: "com_vinculo"; movimentacaoIds: number[] }
  | { kind: "legado_bloqueado" }
  | { kind: "legado_sem_capital" };

export function manutencaoEstaEstornada(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === MANUT_STATUS_ESTORNADO;
}

export function grupoMovimentacaoManutencao(manutencaoId: number, pecaId: number): string {
  return `manutencao-${manutencaoId}-peca-${pecaId}`;
}

export function grupoEstornoManutencao(manutencaoId: number): string {
  return `e-manutencao-${manutencaoId}`;
}

export function destinoMovimentacaoManutencao(manutencaoId: number): string {
  return `Manutenção #${manutencaoId}`;
}

function grupoIdEManutencao(grupoId: string | null | undefined): boolean {
  const g = String(grupoId ?? "").trim();
  return /^manutencao-\d+-peca-\d+$/.test(g) || /^e-manutencao-\d+$/.test(g);
}

export function origemMovimentacaoEManutencao(mov: {
  manejo?: string | null;
  grupoId?: string | null;
}): boolean {
  if (String(mov.manejo ?? "").trim() === MANUT_MOV_MANEJO) return true;
  return grupoIdEManutencao(mov.grupoId);
}

export function deveBloquearEstornoGenericoManutencao(input: {
  movimentacoes: Array<{
    id?: number | null;
    manejo?: string | null;
    grupoId?: string | null;
  }>;
  movimentacaoIdsComVinculoManutencao?: Iterable<number>;
}): boolean {
  if (input.movimentacoes.some(origemMovimentacaoEManutencao)) return true;
  const vinculos = new Set<number>();
  for (const raw of input.movimentacaoIdsComVinculoManutencao ?? []) {
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) vinculos.add(id);
  }
  if (vinculos.size === 0) return false;
  return input.movimentacoes.some((m) => {
    const id = Number(m.id);
    return Number.isInteger(id) && vinculos.has(id);
  });
}

export function pecaManutencaoTemConsumo(peca: {
  estoqueId?: number | string | null;
  quantidade?: string | number | null;
}): boolean {
  const estoqueId = Number(peca.estoqueId);
  const qtd = Number(String(peca.quantidade ?? "").replace(",", "."));
  return Number.isInteger(estoqueId) && estoqueId > 0 && Number.isFinite(qtd) && qtd > 0;
}

export function pecaManutencaoTemVinculo(peca: {
  estoqueMovimentacaoId?: number | string | null;
}): boolean {
  const id = Number(peca.estoqueMovimentacaoId);
  return Number.isInteger(id) && id > 0;
}

export function pecasConsumoIguais(
  antigas: Array<{ estoqueId?: number | string | null; quantidade?: string | number | null }>,
  novas: Array<{ estoqueId?: number | string | null; quantidade?: string | number | null }>,
): boolean {
  if (antigas.length !== novas.length) return false;
  const chave = (p: { estoqueId?: number | string | null; quantidade?: string | number | null }) =>
    `${Number(p.estoqueId)}:${Number(String(p.quantidade ?? "").replace(",", ".")).toFixed(2)}`;
  const a = antigas.map(chave).sort();
  const b = novas.map(chave).sort();
  return a.every((v, i) => v === b[i]);
}

export function valorUnitarioDeSnapshot(snapshot: string | number, quantidade: number): string {
  if (!(quantidade > 0)) return persistirCapital(0);
  const snap = Number(String(snapshot).replace(",", "."));
  return persistirCapital(snap / quantidade);
}

export function decidirEstornoManutencao(input: {
  status?: string | null;
  pecas: Array<{
    estoqueId?: number | string | null;
    quantidade?: string | number | null;
    estoqueMovimentacaoId?: number | string | null;
  }>;
  algumEstoqueComCapital?: boolean;
}): DecisaoEstornoManutencao {
  if (manutencaoEstaEstornada(input.status)) {
    return { kind: "ja_estornado" };
  }

  const consumo = input.pecas.filter(pecaManutencaoTemConsumo);
  if (consumo.length === 0) {
    return { kind: "sem_consumo" };
  }

  const comVinculo = consumo.filter(pecaManutencaoTemVinculo);
  const semVinculo = consumo.filter((p) => !pecaManutencaoTemVinculo(p));

  if (comVinculo.length > 0 && semVinculo.length > 0) {
    return { kind: "legado_bloqueado" };
  }

  if (comVinculo.length > 0) {
    return {
      kind: "com_vinculo",
      movimentacaoIds: comVinculo.map((p) => Number(p.estoqueMovimentacaoId)),
    };
  }

  if (input.algumEstoqueComCapital) {
    return { kind: "legado_bloqueado" };
  }
  return { kind: "legado_sem_capital" };
}
