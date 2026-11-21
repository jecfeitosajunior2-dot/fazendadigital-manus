import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";

export const INDICE_CHAVE_MOVIMENTO = "estoque_mov_chave_uq";

export const MSG_ESTOQUE_SEM_TABELA_CHAVE =
  "A movimentação está bloqueada até a chave única existir no banco. Nada foi gravado.";
export const MSG_CHAVE_OUTRO_CONTEUDO =
  "Esta chave já foi usada com outros dados. O saldo não foi movimentado de novo.";
export const MSG_EDICAO_MOVIMENTO_BLOQUEADA =
  "A edição de um movimento confirmado está bloqueada. Ela reescreveria quantidade, custo ou histórico e poderia divergir do saldo. Para corrigir, estorne e lance um movimento novo.";
export const MSG_PRODUTO_INATIVO =
  "Produto inativo não recebe movimentação. O saldo não foi alterado.";

export type ConteudoMovimento = {
  titularUserId: number;
  fazendaId: number;
  estoqueId: number;
  tipo: string;
  quantidade: string;
  valor: string;
  dataMovimentacao: string;
  destino: string;
  manejo: string;
  notaFiscal: string;
  frete: string;
  fornecedor: string;
  observacoes: string;
};

export type ChaveGravada = {
  conteudoHash: string;
  movimentacaoId: number | null;
  estoqueId: number;
  grupoId: string | null;
};

export function quantidadeChave(valor: string | number): string {
  const numero = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(numero)) return "";
  return numero.toFixed(2);
}

export function hashConteudoMovimento(dados: ConteudoMovimento): string {
  const texto = [
    ["titular", dados.titularUserId],
    ["fazenda", dados.fazendaId],
    ["produto", dados.estoqueId],
    ["tipo", dados.tipo.trim().toLowerCase()],
    ["quantidade", quantidadeChave(dados.quantidade)],
    ["valor", dados.valor.trim()],
    ["data", dados.dataMovimentacao.slice(0, 10)],
    ["destino", dados.destino.trim()],
    ["manejo", dados.manejo.trim()],
    ["nota", dados.notaFiscal.trim()],
    ["frete", dados.frete.trim()],
    ["fornecedor", dados.fornecedor.trim()],
    ["observacoes", dados.observacoes.trim()],
  ].map(([chave, valor]) => `${chave}=${valor ?? ""}`).join("\n");
  return createHash("sha256").update(texto).digest("hex");
}

export function hashSaldoInicial(dados: {
  titularUserId: number;
  fazendaId: number;
  nome: string;
  quantidade: string;
  valor: string;
}): string {
  const texto = [
    `titular=${dados.titularUserId}`,
    `fazenda=${dados.fazendaId}`,
    `nome=${dados.nome.trim().toLowerCase()}`,
    `quantidade=${quantidadeChave(dados.quantidade)}`,
    `valor=${dados.valor.trim()}`,
    "tipo=saldo_inicial",
  ].join("\n");
  return createHash("sha256").update(texto).digest("hex");
}

export function indiceChaveConfiavel(resultado: unknown): boolean {
  const pacote = Array.isArray(resultado) && Array.isArray(resultado[0]) ? resultado[0] : resultado;
  if (!Array.isArray(pacote) || pacote.length === 0) return false;
  const linhas = pacote
    .map((item) => {
      const linha = item as Record<string, unknown>;
      return {
        coluna: String(linha.coluna ?? linha.COLUMN_NAME ?? ""),
        unico: Number(linha.naoUnico ?? linha.NON_UNIQUE ?? 1) === 0,
        ordem: Number(linha.ordem ?? linha.SEQ_IN_INDEX ?? 0),
      };
    })
    .sort((a, b) => a.ordem - b.ordem);
  return linhas.every((linha) => linha.unico) && linhas.map((linha) => linha.coluna).join(",") === "titular_user_id,chave";
}

export function linhaChave(resultado: unknown): ChaveGravada | null {
  const pacote = Array.isArray(resultado) && Array.isArray(resultado[0]) ? resultado[0] : resultado;
  if (!Array.isArray(pacote) || pacote.length === 0) return null;
  const linha = pacote[0] as Record<string, unknown>;
  const movimentacao = linha.movimentacaoId ?? linha.movimentacao_id;
  const grupo = linha.grupoId ?? linha.grupo_id;
  return {
    conteudoHash: String(linha.conteudoHash ?? linha.conteudo_hash ?? ""),
    movimentacaoId: movimentacao == null ? null : Number(movimentacao),
    estoqueId: Number(linha.estoqueId ?? linha.estoque_id ?? 0),
    grupoId: grupo == null ? null : String(grupo),
  };
}

export function recusarSemTabelaChave(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_ESTOQUE_SEM_TABELA_CHAVE });
}

export function recusarChaveDivergente(): never {
  throw new TRPCError({ code: "CONFLICT", message: MSG_CHAVE_OUTRO_CONTEUDO });
}

export function conferirChaveReenviada(gravada: ChaveGravada, hash: string): void {
  if (gravada.conteudoHash !== hash) recusarChaveDivergente();
}
