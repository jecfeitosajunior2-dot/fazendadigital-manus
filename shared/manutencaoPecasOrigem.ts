import { MSG_MANUT_EDICAO_PATRIMONIAL, pecasConsumoIguais } from "./manutencaoEstoque";

export const MANUT_PECA_ORIGEM_ESTOQUE = "estoque";
export const MANUT_PECA_ORIGEM_OFICINA = "oficina";

export const MSG_MANUT_OFICINA_SO_TERCEIRIZADA =
  "Peças fornecidas pela oficina só podem ser registradas em manutenção terceirizada.";

export const MSG_MANUT_OFICINA_SEM_ESTOQUE =
  "Peça da oficina não deve ser vinculada ao estoque da fazenda.";

export const MSG_MANUT_OFICINA_VALOR =
  "Informe o valor unitário da peça fornecida pela oficina.";

export const MSG_MANUT_PECA_ESTOQUE_OBRIGATORIA =
  "Selecione um produto do estoque da Fazenda. Peças sem vínculo de estoque não são permitidas.";

export const MSG_MANUT_EDICAO_ESTORNADA =
  "Manutenção estornada não pode ser editada.";

export const MSG_MANUT_ORIGEM_IMUTAVEL =
  "Não é permitido converter peça do estoque em peça da oficina, nem o contrário.";

export type OrigemPecaManutencao =
  | typeof MANUT_PECA_ORIGEM_ESTOQUE
  | typeof MANUT_PECA_ORIGEM_OFICINA;

export type PecaManutencaoOrigemInput = {
  nome: string;
  quantidade: number;
  valorUnitario?: number | null;
  estoqueId?: number | null;
  origem?: string | null;
};

export type PecaOficinaNormalizada = {
  origem: typeof MANUT_PECA_ORIGEM_OFICINA;
  nome: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
};

/** Lê só o valor persistido. NULL não vira oficina. */
export function lerOrigemPecaManutencao(raw: unknown): OrigemPecaManutencao | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === MANUT_PECA_ORIGEM_ESTOQUE) return MANUT_PECA_ORIGEM_ESTOQUE;
  if (v === MANUT_PECA_ORIGEM_OFICINA) return MANUT_PECA_ORIGEM_OFICINA;
  return null;
}

export function pecaManutencaoEDeOficina(peca: {
  origem?: string | null;
}): boolean {
  return lerOrigemPecaManutencao(peca.origem) === MANUT_PECA_ORIGEM_OFICINA;
}

export function classificarPecasManutencao(pecas: PecaManutencaoOrigemInput[] | undefined): {
  estoque: PecaManutencaoOrigemInput[];
  oficina: PecaManutencaoOrigemInput[];
  semOrigemSemEstoque: PecaManutencaoOrigemInput[];
} {
  const estoque: PecaManutencaoOrigemInput[] = [];
  const oficina: PecaManutencaoOrigemInput[] = [];
  const semOrigemSemEstoque: PecaManutencaoOrigemInput[] = [];

  for (const peca of pecas ?? []) {
    if (pecaManutencaoEDeOficina(peca)) {
      oficina.push(peca);
      continue;
    }
    const estoqueId = Number(peca.estoqueId);
    if (Number.isInteger(estoqueId) && estoqueId > 0) {
      estoque.push(peca);
      continue;
    }
    semOrigemSemEstoque.push(peca);
  }

  return { estoque, oficina, semOrigemSemEstoque };
}

export function validarPecaOficina(
  peca: PecaManutencaoOrigemInput,
): { ok: true; peca: PecaOficinaNormalizada } | { ok: false; message: string } {
  const estoqueId = Number(peca.estoqueId);
  if (Number.isInteger(estoqueId) && estoqueId > 0) {
    return { ok: false, message: MSG_MANUT_OFICINA_SEM_ESTOQUE };
  }
  const nome = String(peca.nome ?? "").trim();
  if (!nome) return { ok: false, message: "Informe a descrição da peça da oficina." };
  const quantidade = Number(peca.quantidade);
  if (!(quantidade > 0)) {
    return { ok: false, message: "A quantidade da peça da oficina deve ser positiva." };
  }
  const valorUnitario = Number(peca.valorUnitario);
  if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
    return { ok: false, message: MSG_MANUT_OFICINA_VALOR };
  }
  return {
    ok: true,
    peca: {
      origem: MANUT_PECA_ORIGEM_OFICINA,
      nome,
      quantidade,
      valorUnitario,
      valorTotal: quantidade * valorUnitario,
    },
  };
}

export function validarPecasOficinaNaExecucao(
  tipoExecucao: string | null | undefined,
  pecasOficina: readonly unknown[],
): { ok: true } | { ok: false; message: string } {
  if (pecasOficina.length === 0) return { ok: true };
  if (String(tipoExecucao ?? "").trim().toLowerCase() !== "externa") {
    return { ok: false, message: MSG_MANUT_OFICINA_SO_TERCEIRIZADA };
  }
  return { ok: true };
}

export function calcularCustosManutencaoCompletos(input: {
  pecasEstoque?: Array<{ quantidade: number; valorUnitario: number }>;
  pecasOficina?: Array<{ valorTotal?: number; quantidade?: number; valorUnitario?: number }>;
  valorMaoObra?: number;
}): {
  valorPecasEstoque: number;
  valorPecasOficina: number;
  valorMaoObra: number;
  valorPecas: number;
  valorTotal: number;
  valorCobradoOficina: number;
} {
  const valorPecasEstoque = (input.pecasEstoque ?? []).reduce(
    (s, p) => s + p.quantidade * p.valorUnitario,
    0,
  );
  const valorPecasOficina = (input.pecasOficina ?? []).reduce((s, p) => {
    if (Number.isFinite(Number(p.valorTotal))) return s + Number(p.valorTotal);
    return s + Number(p.quantidade ?? 0) * Number(p.valorUnitario ?? 0);
  }, 0);
  const valorMaoObra = Number.isFinite(Number(input.valorMaoObra)) ? Number(input.valorMaoObra) : 0;
  const valorPecas = valorPecasEstoque + valorPecasOficina;
  return {
    valorPecasEstoque,
    valorPecasOficina,
    valorMaoObra,
    valorPecas,
    valorTotal: valorPecas + valorMaoObra,
    valorCobradoOficina: valorPecasOficina + valorMaoObra,
  };
}

/** Estorno patrimonial só devolve peça com movimentação oficial. Oficina fica de fora. */
export function pecasParaEstornoPatrimonial<T extends { estoqueMovimentacaoId?: number | string | null }>(
  pecas: T[],
): T[] {
  return pecas.filter((p) => {
    const id = Number(p.estoqueMovimentacaoId);
    return Number.isInteger(id) && id > 0;
  });
}

/** OS só com oficina ou só com mão de obra: estorna o registro, sem estoque. */
export function estornoCompletoSemMovimentacao(kind: string | null | undefined): boolean {
  return kind === "sem_consumo";
}

export function pecaManutencaoEDeEstoque(peca: {
  origem?: string | null;
  estoqueId?: number | string | null;
  estoqueMovimentacaoId?: number | string | null;
}): boolean {
  if (pecaManutencaoEDeOficina(peca)) return false;
  if (lerOrigemPecaManutencao(peca.origem) === MANUT_PECA_ORIGEM_ESTOQUE) return true;
  const estoqueId = Number(peca.estoqueId);
  if (Number.isInteger(estoqueId) && estoqueId > 0) return true;
  const mov = Number(peca.estoqueMovimentacaoId);
  return Number.isInteger(mov) && mov > 0;
}

export function valorPecasEstoqueCongelado(
  pecas: Array<{
    origem?: string | null;
    estoqueId?: number | string | null;
    estoqueMovimentacaoId?: number | string | null;
    valorTotal?: string | number | null;
  }>,
  fallbackOs?: { valorPecas?: string | number | null; valorPecasOficina?: string | number | null },
): number {
  const estoque = pecas.filter(pecaManutencaoEDeEstoque);
  if (estoque.length > 0) {
    return estoque.reduce((s, p) => {
      const n = Number(String(p.valorTotal ?? 0).replace(",", "."));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
  }
  return Math.max(0, Number(fallbackOs?.valorPecas ?? 0) - Number(fallbackOs?.valorPecasOficina ?? 0));
}

export function validarEdicaoOrigemPecas(input: {
  pecasAntigas: Array<{
    origem?: string | null;
    estoqueId?: number | string | null;
    quantidade?: string | number | null;
    estoqueMovimentacaoId?: number | string | null;
  }>;
  pecasEstoqueNovas: Array<{
    estoqueId?: number | string | null;
    quantidade: number;
    origem?: string | null;
  }>;
  pecasOficinaNovas: Array<{
    estoqueId?: number | string | null;
    origem?: string | null;
  }>;
}): { ok: true } | { ok: false; message: string; kind: "origem" | "patrimonial" } {
  for (const peca of input.pecasOficinaNovas) {
    const estoqueId = Number(peca.estoqueId);
    if (Number.isInteger(estoqueId) && estoqueId > 0) {
      return { ok: false, message: MSG_MANUT_ORIGEM_IMUTAVEL, kind: "origem" };
    }
    if (lerOrigemPecaManutencao(peca.origem) === MANUT_PECA_ORIGEM_ESTOQUE) {
      return { ok: false, message: MSG_MANUT_ORIGEM_IMUTAVEL, kind: "origem" };
    }
  }
  for (const peca of input.pecasEstoqueNovas) {
    if (pecaManutencaoEDeOficina(peca)) {
      return { ok: false, message: MSG_MANUT_ORIGEM_IMUTAVEL, kind: "origem" };
    }
  }

  const antigasEstoque = input.pecasAntigas.filter(pecaManutencaoEDeEstoque);
  if (antigasEstoque.length === 0 && input.pecasEstoqueNovas.length > 0) {
    return { ok: false, message: MSG_MANUT_ORIGEM_IMUTAVEL, kind: "origem" };
  }
  if (
    antigasEstoque.length > 0
    && !pecasConsumoIguais(antigasEstoque, input.pecasEstoqueNovas)
  ) {
    return { ok: false, message: MSG_MANUT_EDICAO_PATRIMONIAL, kind: "patrimonial" };
  }
  return { ok: true };
}
