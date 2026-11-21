import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  conferirChaveReenviada,
  hashConteudoMovimento,
  hashSaldoInicial,
  indiceChaveConfiavel,
} from "./estoqueChaveMovimento";
import { ordemTravaTransferencia } from "./estoqueSaldoTx";

const here = dirname(fileURLToPath(import.meta.url));

function ler(nome: string) {
  return readFileSync(resolve(here, nome), "utf8").replace(/\r\n/g, "\n");
}

function roteador() {
  const texto = ler("routers.ts");
  const inicio = texto.indexOf("const estoqueRouter = router({");
  const fim = texto.indexOf("const financeiroRouter = router({");
  return texto.slice(inicio, fim);
}

function corpo(nome: string) {
  const bloco = roteador();
  const marca = `\n  ${nome}: protectedProcedure`;
  const inicio = bloco.indexOf(marca);
  const resto = bloco.slice(inicio + marca.length);
  const proximo = resto.search(/\n  [A-Za-z0-9]+: protectedProcedure/);
  return proximo === -1 ? resto : resto.slice(0, proximo);
}

function entre(texto: string, inicio: string, fim: string) {
  const de = texto.indexOf(inicio);
  const ate = texto.indexOf(fim, de + inicio.length);
  return texto.slice(de, ate);
}

const conteudo = {
  titularUserId: 7,
  fazendaId: 10,
  estoqueId: 3,
  tipo: "entrada",
  quantidade: "2,5",
  valor: "4.00",
  dataMovimentacao: "2026-11-21T08:00:00",
  destino: "curral",
  manejo: "compra",
  notaFiscal: "NF 1",
  frete: "0",
  fornecedor: "Casa",
  observacoes: "manha",
};

describe("estoque H4-AY — proposta e contratos", () => {
  it("deixa a chave 0072 fora do journal e não apaga tabela", () => {
    const sql = ler("../drizzle/propostas/0072_estoque_movimentacao_chaves.sql");
    const journal = ler("../drizzle/migrations/meta/_journal.json");
    expect(journal).not.toContain("0072");
    expect(sql).toContain("fd_h4ay_aplicar_estoque_movimentacao_chaves");
    expect(sql).toContain("UNIQUE KEY estoque_mov_chave_uq (titular_user_id, chave)");
    const drops = sql.split("\n").filter((linha) => /drop table/i.test(linha));
    expect(drops.length).toBeGreaterThan(0);
    expect(drops.every((linha) => linha.trim().startsWith("--"))).toBe(true);
  });

  it("só confia no índice único do titular com a chave", () => {
    expect(indiceChaveConfiavel([])).toBe(false);
    expect(indiceChaveConfiavel([[
      { COLUMN_NAME: "chave", NON_UNIQUE: 0, SEQ_IN_INDEX: 1 },
    ]])).toBe(false);
    expect(indiceChaveConfiavel([[
      { COLUMN_NAME: "titular_user_id", NON_UNIQUE: 0, SEQ_IN_INDEX: 1 },
      { COLUMN_NAME: "chave", NON_UNIQUE: 0, SEQ_IN_INDEX: 2 },
    ]])).toBe(true);
    expect(indiceChaveConfiavel([[
      { COLUMN_NAME: "chave", NON_UNIQUE: 0, SEQ_IN_INDEX: 2 },
      { COLUMN_NAME: "titular_user_id", NON_UNIQUE: 1, SEQ_IN_INDEX: 1 },
    ]])).toBe(false);
  });

  it("repete o mesmo hash e recusa a mesma chave com outro conteúdo", () => {
    const primeiro = hashConteudoMovimento(conteudo);
    expect(hashConteudoMovimento({ ...conteudo, dataMovimentacao: "2026-11-21T18:00:00" })).toBe(primeiro);
    expect(hashConteudoMovimento({ ...conteudo, quantidade: "3" })).not.toBe(primeiro);
    expect(hashSaldoInicial({
      titularUserId: 7, fazendaId: 10, nome: "Sal", quantidade: "2", valor: "1",
    })).toBe(hashSaldoInicial({
      titularUserId: 7, fazendaId: 10, nome: " sal ", quantidade: "2.00", valor: "1",
    }));
    expect(() => conferirChaveReenviada({
      conteudoHash: primeiro, movimentacaoId: 9, estoqueId: 3, grupoId: "g1",
    }, "outro")).toThrow(/outros dados/);
  });

  it("cadastra o saldo inicial na mesma transação e não no arquivo", () => {
    const trecho = corpo("create");
    const helper = entre(ler("estoqueCadastroMysql.ts"), "export async function cadastrarProdutoEstoque", "export async function editarProdutoEstoque");
    expect(trecho).toContain("cadastrarProdutoEstoque");
    expect(helper).toContain("db.transaction");
    expect(helper).toContain("saldo_inicial");
    expect(helper).toContain("recusarSemTabelaChave");
    expect(helper).not.toContain("devLocalStore");
    expect(helper).not.toContain("localFallback");
  });

  it("não deixa a edição cadastral mudar quantidade nem custo", () => {
    const helper = entre(ler("estoqueCadastroMysql.ts"), "export async function editarProdutoEstoque", "export async function vincularProdutoNaFazenda");
    expect(corpo("update")).toContain("editarProdutoEstoque");
    expect(helper).toContain("PERMISSAO_EDITAR_ESTOQUE");
    expect(helper).toContain("db.transaction");
    expect(helper).not.toContain("valorUnitario");
    expect(helper).not.toContain("valorTotalEstoque");
    expect(helper).not.toContain("quantidade:");
    expect(helper).not.toContain("devLocalStore");
  });

  it("vincula fazenda com quantidade zero e não copia o saldo", () => {
    const helper = entre(ler("estoqueCadastroMysql.ts"), "export async function vincularProdutoNaFazenda", "export async function mudarSituacaoProdutos");
    expect(corpo("vincularFazenda")).toContain("vincularProdutoNaFazenda");
    expect(helper).toContain('quantidade: "0"');
    expect(helper).not.toContain("valorTotalEstoque");
    expect(helper).not.toContain("devLocalStore");
  });

  it("ativa e inativa sem apagar histórico e sem arquivo", () => {
    const helper = ler("estoqueCadastroMysql.ts");
    const situacao = helper.slice(helper.indexOf("export async function mudarSituacaoProdutos"));
    expect(corpo("inativarProdutos")).toContain('mudarSituacaoProdutos(ctx.user, input, "inativo")');
    expect(corpo("ativarProdutos")).toContain('mudarSituacaoProdutos(ctx.user, input, "ativo")');
    expect(situacao).toContain("PERMISSAO_INATIVAR_ESTOQUE");
    expect(situacao).not.toContain(".delete(");
    expect(situacao).not.toContain("devLocalStore");
  });

  it("exige chave persistida na movimentação manual", () => {
    const trecho = corpo("createMovimentacao");
    expect(trecho).toContain("chave: z.string().min(8).max(80)");
    expect(trecho).toContain("recusarSemTabelaChave");
    expect(trecho).toContain("conferirChaveReenviada");
    expect(trecho).toContain("db.transaction");
    expect(trecho).toContain('.for("update")');
    expect(trecho).not.toContain("devLocalStore");
    expect(trecho).not.toContain("localFallback");
  });

  it("confirma compra e transferência com o titular lido no banco", () => {
    expect(corpo("confirmarCompraInsumos")).toContain("sessionVersionDaSessao");
    expect(corpo("confirmarTransferenciaInsumos")).toContain("fazendaOrigemId: input.fazendaOrigemId");
    expect(ler("compraInsumos.ts")).toContain("tx.autorizarDono && contexto");
    expect(ler("compraInsumosMysql.ts")).toContain("autorizarEstoqueNaFazenda");
    expect(ler("transferenciaInsumosMysql.ts")).toContain("autorizarEstoqueNaFazenda");
    expect(ler("transferenciaInsumosMysql.ts")).toContain("lerEstoque");
    expect(ler("estoqueSaldoTx.ts")).toContain("ordemTravaTransferencia");
  });

  it("bloqueia reescrever um movimento confirmado", () => {
    const trecho = corpo("updateMovimentacao");
    expect(trecho).toContain("MSG_EDICAO_MOVIMENTO_BLOQUEADA");
    expect(trecho).not.toContain("devLocalStore");
    expect(trecho).not.toContain("aplicarPatchSaldo");
    expect(trecho.indexOf("throw new TRPCError")).toBeGreaterThan(-1);
  });

  it("valida e estorna só no MySQL, com trava do movimento", () => {
    const validar = corpo("validarEstorno");
    const estornar = corpo("estornarMovimentacao");
    expect(validar).not.toContain("devLocalStore");
    expect(validar).toContain("recusarEstoqueSemMysql");
    expect(validar).toContain("PERMISSAO_ESTORNAR_ESTOQUE");
    expect(estornar).toContain("PERMISSAO_ESTORNAR_ESTOQUE");
    expect(estornar).toContain('.for("update")');
    expect(estornar).not.toContain("devLocalStore");
  });

  it("mantém as três exclusões físicas bloqueadas", () => {
    for (const nome of ["delete", "deleteMovimentacao", "deleteAllMovimentacoesByProduto"]) {
      const trecho = corpo(nome);
      expect(trecho.indexOf("recusarExclusaoFisicaEstoque()")).toBeGreaterThan(-1);
      expect(trecho.indexOf("recusarExclusaoFisicaEstoque()")).toBeLessThan(trecho.search(/\.delete\(/));
    }
  });

  it("ordena as travas da transferência pelo id, qualquer que seja a origem", () => {
    expect(ordemTravaTransferencia([8, 2, 2, 0, 5])).toEqual([2, 5, 8]);
    expect(ordemTravaTransferencia([5, 2])).toEqual(ordemTravaTransferencia([2, 5]));
  });

  it("não deixa produto inativo receber movimento novo", () => {
    expect(ler("estoqueSaldoTx.ts")).toContain('item.situacao === "inativo"');
    expect(ler("nutricaoFornecimentos.ts")).toContain("Produto inativo não recebe movimentação.");
    expect(ler("nutricaoBatidas.ts")).toContain("Produto inativo não recebe movimentação.");
    expect(ler("abastecimentoEstoqueSync.ts")).toContain("Produto inativo não recebe movimentação.");
  });
});
