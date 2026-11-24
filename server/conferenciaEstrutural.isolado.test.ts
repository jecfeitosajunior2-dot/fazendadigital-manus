import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { afirmarBancoDescartavel, PORTA_OPERACIONAL } from "./isolamentoMysql";
import {
  CONSULTAS_DUPLICIDADE,
  CONSULTAS_HISTORICO,
  SITUACAO_OPERACIONAL,
  consultaEhContagem,
  matrizOperacional,
} from "./conferenciaEstrutural";
import {
  FRASE_AUTORIZACAO,
  LEITURA_OPERACIONAL_HABILITADA,
  executarLeitura,
  medirContagens,
  type PedidoLeitura,
} from "./leituraAutorizada";

const url = new URL(process.env.DATABASE_URL ?? "mysql://root:ausente@127.0.0.1:9/ausente");
const porta = Number(url.port || 3306);
const container = process.env.FD_CONTAINER ?? "";
const banco = "fd_h4cb_conf";
const senhaLeitura = "leitura-h4cb";

afirmarBancoDescartavel({ host: url.hostname, port: porta, database: banco, container });
if (container !== "fd-h4cb-leitura") throw new Error("Container do ensaio não confirmado.");

type Recorte = {
  conteudoOriginal: boolean;
  indiceAbastecimento: "certo" | "ausente" | "incompativel";
  nutricao: "completa" | "parcial";
  estoqueChaves: boolean;
  brinco: "completo" | "dados";
  partidaUnica: boolean;
  journal: boolean;
  dadosPartida: boolean;
};

const cheio: Recorte = {
  conteudoOriginal: true,
  indiceAbastecimento: "certo",
  nutricao: "completa",
  estoqueChaves: true,
  brinco: "completo",
  partidaUnica: true,
  journal: false,
  dadosPartida: false,
};

function admin() {
  return mysql.createConnection({
    host: url.hostname,
    port: porta,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    multipleStatements: true,
  });
}

function pedido(parcial: Partial<PedidoLeitura> = {}): PedidoLeitura {
  const destino = { host: "127.0.0.1", porta, banco, servidor: container };
  return {
    autorizacao: FRASE_AUTORIZACAO,
    destino,
    esperado: { ...destino },
    credencial: { usuario: "fd_leitura", senha: senhaLeitura, papel: "leitura" },
    limiteConsultas: 20,
    ...parcial,
  };
}

function sqlRecorte(opcoes: Recorte): string[] {
  const conteudo = opcoes.conteudoOriginal ? ",\n  conteudoOriginal VARCHAR(64) NULL" : "";
  const indiceAbastecimento = opcoes.indiceAbastecimento === "certo"
    ? ",\n  UNIQUE KEY abastecimentos_chave_operacao_uq (userId, chaveOperacao)"
    : opcoes.indiceAbastecimento === "incompativel"
      ? ",\n  KEY abastecimentos_chave_operacao_uq (chaveOperacao)"
      : "";
  const nutricaoCompleta = opcoes.nutricao === "completa";
  const comandos = [
    `CREATE TABLE manutencoes (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      chaveOperacao VARCHAR(80) NULL,
      fazendaId INT NULL${conteudo},
      UNIQUE KEY manutencoes_chave_operacao_uq (userId, chaveOperacao),
      KEY manutencoes_user_fazenda_idx (userId, fazendaId)
    )`,
    `CREATE TABLE abastecimentos (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      chaveOperacao VARCHAR(80) NULL,
      fazendaId INT NULL${conteudo}${indiceAbastecimento}
    )`,
    `CREATE TABLE reproducao_operacoes (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      chave VARCHAR(64) NOT NULL,
      fazendaId INT NOT NULL,
      conteudoHash VARCHAR(64) NOT NULL,
      UNIQUE KEY reproducao_operacoes_titular_chave_uq (userId, chave)
    )`,
    `CREATE TABLE semen_entrada_operacoes (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      chave VARCHAR(64) NOT NULL,
      fazendaId INT NOT NULL,
      conteudoHash VARCHAR(64) NOT NULL,
      UNIQUE KEY semen_entrada_operacoes_titular_chave_uq (userId, chave)
    )`,
    `CREATE TABLE semen_partidas (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      fazenda_id INT NOT NULL,
      reprodutor_key VARCHAR(120) NOT NULL,
      partida VARCHAR(120) NOT NULL${opcoes.partidaUnica ? ",\n      UNIQUE KEY semen_partidas_uq (user_id, fazenda_id, reprodutor_key, partida)" : ""}
    )`,
  ];
  if (opcoes.brinco === "completo") {
    comandos.push(`CREATE TABLE animais (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      brinco VARCHAR(50) NULL,
      status VARCHAR(20) NULL DEFAULT 'ativo',
      fazendaId INT NULL,
      brinco_ativo_chave VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
        GENERATED ALWAYS AS (
          CASE
            WHEN status = 'ativo' AND brinco IS NOT NULL AND CHAR_LENGTH(TRIM(brinco)) > 0
              THEN LOWER(TRIM(brinco)) COLLATE utf8mb4_bin
            ELSE NULL
          END
        ) STORED,
      UNIQUE KEY animais_brinco_ativo_fazenda_uq (userId, fazendaId, brinco_ativo_chave)
    )`);
  } else {
    comandos.push(`CREATE TABLE animais (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      brinco VARCHAR(50) NULL,
      status VARCHAR(20) NULL DEFAULT 'ativo',
      fazendaId INT NULL
    )`);
    comandos.push(`CREATE TABLE users (
      id INT NOT NULL PRIMARY KEY,
      openId VARCHAR(64) NOT NULL,
      name VARCHAR(80) NOT NULL,
      papel VARCHAR(20) NOT NULL,
      titularUserId INT NULL
    )`);
  }
  if (opcoes.estoqueChaves) {
    comandos.push(`CREATE TABLE estoque_movimentacao_chaves (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      titular_user_id INT NOT NULL,
      chave VARCHAR(80) NOT NULL,
      conteudo_hash CHAR(64) NOT NULL,
      estoque_id INT NOT NULL,
      fazenda_id INT NOT NULL,
      UNIQUE KEY estoque_mov_chave_uq (titular_user_id, chave)
    )`);
  }
  if (nutricaoCompleta) {
    comandos.push(`CREATE TABLE nutricao_fornecimentos (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      chaveOperacao VARCHAR(80) NULL,
      conteudoHash VARCHAR(64) NULL,
      UNIQUE KEY nutricao_fornecimentos_user_chave_uq (userId, chaveOperacao)
    )`);
    comandos.push(`CREATE TABLE nutricao_batidas (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      chaveOperacao VARCHAR(80) NULL,
      conteudoHash VARCHAR(64) NULL,
      UNIQUE KEY nutricao_batidas_user_chave_uq (userId, chaveOperacao)
    )`);
  } else {
    comandos.push(`CREATE TABLE nutricao_fornecimentos (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      chaveOperacao VARCHAR(80) NULL
    )`);
    comandos.push("CREATE TABLE nutricao_batidas (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL)");
  }
  comandos.push(`CREATE TABLE nutricao_cocho_leituras (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    chaveOperacao VARCHAR(80) NULL,
    conteudoHash VARCHAR(64) NULL,
    UNIQUE KEY nutricao_cocho_leituras_user_chave_uq (userId, chaveOperacao)
  )`);
  if (opcoes.journal) {
    comandos.push(`CREATE TABLE __drizzle_migrations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      hash VARCHAR(255) NOT NULL,
      created_at BIGINT NULL
    )`);
    comandos.push("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('ensaio-0000', 1)");
  }
  if (opcoes.brinco === "dados") {
    comandos.push("INSERT INTO users (id, openId, name, papel, titularUserId) VALUES (1, 'sintetico-comum', 'Funcionario sintetico', 'comum', 1)");
    comandos.push("INSERT INTO animais (userId, brinco, status, fazendaId) VALUES (1, 'ABC', 'ativo', 10), (1, ' abc ', 'ativo', 10), (1, 'ABC', 'ativo', 11), (1, 'ABC', 'vendido', 10)");
  }
  if (opcoes.dadosPartida) {
    comandos.push("INSERT INTO semen_partidas (user_id, fazenda_id, reprodutor_key, partida) VALUES (1, 10, 'touro-sintetico', 'lote-a'), (1, 10, 'touro-sintetico', 'lote-a'), (1, 11, 'touro-sintetico', 'lote-a')");
  }
  return comandos;
}

async function recriar(opcoes: Recorte) {
  const conn = await admin();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${banco}\``);
    await conn.query(`CREATE DATABASE \`${banco}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${banco}\``);
    for (const comando of sqlRecorte(opcoes)) await conn.query(comando);
  } finally {
    await conn.end();
  }
}

async function ler(opcoes: Recorte = cheio) {
  await recriar(opcoes);
  const resultado = await executarLeitura(pedido());
  if (!("arquivos" in resultado)) throw new Error("motivo" in resultado ? resultado.motivo : "leitura recusada");
  return resultado;
}

function arquivoDe(resultado: Awaited<ReturnType<typeof ler>>, migracao: string) {
  const arquivo = resultado.arquivos.find(item => item.migracao === migracao);
  if (!arquivo) throw new Error(`Arquivo ${migracao} ausente da matriz.`);
  return arquivo;
}

describe("conferência estrutural no descartável", () => {
  beforeAll(async () => {
    let ultimo = "MySQL descartável indisponível.";
    for (let tentativa = 0; tentativa < 40; tentativa += 1) {
      try {
        const conn = await admin();
        await conn.query("SELECT 1 AS ok");
        await conn.query(`CREATE USER IF NOT EXISTS 'fd_leitura'@'%' IDENTIFIED BY '${senhaLeitura}'`);
        await conn.query("GRANT SELECT ON *.* TO 'fd_leitura'@'%'");
        await conn.end();
        return;
      } catch (erro) {
        ultimo = erro instanceof Error ? erro.message : ultimo;
        await new Promise(resolver => setTimeout(resolver, 1000));
      }
    }
    throw new Error(ultimo);
  }, 50000);

  afterAll(async () => {
    const conn = await admin();
    await conn.query(`DROP DATABASE IF EXISTS \`${banco}\``);
    await conn.query("DROP USER IF EXISTS 'fd_leitura'@'%'");
    await conn.end();
  });

  it("mantém o operacional sem observação e a 0070 fora da execução", () => {
    expect(LEITURA_OPERACIONAL_HABILITADA).toBe(false);
    const matriz = matrizOperacional();
    expect(matriz.every(linha => linha.estadoObservado === SITUACAO_OPERACIONAL)).toBe(true);
    expect(matriz.find(linha => linha.migracao === "0070")?.proximaAcao).toBe("Não aplicar a 0070.");
    expect(fs.readFileSync(new URL("./leituraAutorizada.ts", import.meta.url), "utf8").includes("process.env")).toBe(false);
  });

  it("prepara só contagens e recusa gravação, trava e for update", () => {
    const consultas = [...CONSULTAS_DUPLICIDADE, ...CONSULTAS_HISTORICO];
    expect(consultas.every(consulta => consultaEhContagem(consulta.sql))).toBe(true);
    expect(consultaEhContagem("SELECT * FROM animais FOR UPDATE")).toBe(false);
    expect(consultaEhContagem("LOCK TABLES animais READ")).toBe(false);
    expect(consultaEhContagem("INSERT INTO animais (id) VALUES (1)")).toBe(false);
    expect(consultaEhContagem("UPDATE animais SET brinco = 'x'")).toBe(false);
    expect(consultaEhContagem("DELETE FROM animais")).toBe(false);
  });

  it("reconhece o recorte completo sem disparar contagem", async () => {
    const resultado = await ler();
    expect(resultado.situacaoOperacional).toBe(SITUACAO_OPERACIONAL);
    expect(resultado.arquivos.every(arquivo => arquivo.estado === "EXISTENTE E COMPATÍVEL")).toBe(true);
    expect(resultado.proposta0070.estado).toBe("AUSENTE");
    expect(resultado.consultasExecutadas.some(sql => /group by/i.test(sql))).toBe(false);
  });

  it("aponta coluna ausente sem marcar o resto do recorte", async () => {
    const resultado = await ler({ ...cheio, conteudoOriginal: false });
    expect(arquivoDe(resultado, "0077").estado).toBe("AUSENTE");
    expect(arquivoDe(resultado, "0060").estado).toBe("EXISTENTE E COMPATÍVEL");
    expect(resultado.pecas.find(peca => peca.migracao === "0077" && peca.estrutura.startsWith("conteudoOriginal"))?.estado).toBe("AUSENTE");
  });

  it("aponta índice ausente quando a coluna já existe", async () => {
    const resultado = await ler({ ...cheio, indiceAbastecimento: "ausente" });
    expect(arquivoDe(resultado, "0076").estado).toBe("PARCIALMENTE EXISTENTE");
    expect(resultado.pecas.find(peca => peca.estrutura.startsWith("abastecimentos_chave_operacao_uq"))?.estado).toBe("AUSENTE");
  });

  it("não aceita índice só pelo nome", async () => {
    const resultado = await ler({ ...cheio, indiceAbastecimento: "incompativel" });
    expect(arquivoDe(resultado, "0076").estado).toBe("EXISTENTE E INCOMPATÍVEL");
    expect(resultado.pecas.find(peca => peca.estrutura.startsWith("abastecimentos_chave_operacao_uq"))?.estado).toBe("EXISTENTE E INCOMPATÍVEL");
    expect(arquivoDe(resultado, "0076").proximaAcao).toContain("Não seguir");
  });

  it("marca a 0073 pela metade e não libera o restante", async () => {
    const resultado = await ler({ ...cheio, nutricao: "parcial" });
    expect(arquivoDe(resultado, "0073").estado).toBe("PARCIALMENTE EXISTENTE");
    expect(arquivoDe(resultado, "0073").necessidade).toContain("Não continuar do meio");
    expect(resultado.pecas.find(peca => peca.tabela === "nutricao_batidas" && peca.estrutura.startsWith("chaveOperacao"))?.estado).toBe("AUSENTE");
  });

  it("marca tabela ausente só na migração correspondente", async () => {
    const resultado = await ler({ ...cheio, estoqueChaves: false });
    expect(arquivoDe(resultado, "0072").estado).toBe("AUSENTE");
    expect(arquivoDe(resultado, "0073").estado).toBe("EXISTENTE E COMPATÍVEL");
    expect(arquivoDe(resultado, "0072").necessidade).toContain("Neste ensaio a estrutura falta");
  });

  it("conta brinco ativo repetido e conserva as linhas", async () => {
    await recriar({ ...cheio, brinco: "dados" });
    const medido = await medirContagens(pedido(), ["brincos_ativos", "animais_usuario_comum", "animais_fazenda_nula", "pesagens_usuario_comum"]);
    if (!("resultados" in medido)) throw new Error(medido.motivo);
    expect(medido.resultados.find(item => item.id === "brincos_ativos")).toEqual({ id: "brincos_ativos", executada: true, total: 1 });
    expect(medido.resultados.find(item => item.id === "animais_usuario_comum")).toEqual({ id: "animais_usuario_comum", executada: true, total: 4 });
    expect(medido.resultados.find(item => item.id === "pesagens_usuario_comum")).toEqual({ id: "pesagens_usuario_comum", executada: false, motivo: "Estrutura ausente. A contagem não rodou." });
    expect(medido.situacaoOperacional).toBe(SITUACAO_OPERACIONAL);
    const conn = await admin();
    await conn.query(`USE \`${banco}\``);
    const [linhas] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS total FROM animais");
    await conn.end();
    expect(Number(linhas[0]?.total)).toBe(4);
  });

  it("conta partida repetida só na mesma fazenda", async () => {
    await recriar({ ...cheio, partidaUnica: false, dadosPartida: true });
    const medido = await medirContagens(pedido(), ["partidas_semen"]);
    if (!("resultados" in medido)) throw new Error(medido.motivo);
    expect(medido.resultados).toEqual([{ id: "partidas_semen", executada: true, total: 1 }]);
    const conn = await admin();
    await conn.query(`USE \`${banco}\``);
    const [linhas] = await conn.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS total FROM semen_partidas");
    await conn.end();
    expect(Number(linhas[0]?.total)).toBe(3);
  });

  it("não trata journal incompleto como ordem para aplicar", async () => {
    const resultado = await ler({ ...cheio, journal: true });
    expect(resultado.journal.entradas).toBe(1);
    expect(resultado.journal.aplicarPorqueForaDoJournal).toBe(false);
    expect(arquivoDe(resultado, "0060").estado).toBe("EXISTENTE E COMPATÍVEL");
    expect(arquivoDe(resultado, "0060").necessidade).toContain("não basta");
    expect(resultado.situacaoOperacional).toBe(SITUACAO_OPERACIONAL);
  });

  it("recusa a credencial administrativa antes de conectar", async () => {
    const resultado = await executarLeitura(pedido({
      credencial: { usuario: "root", senha: "nao-usar", papel: "leitura" },
    }), async () => { throw new Error("CONECTOU"); });
    expect(resultado.aceito).toBe(false);
    if (!resultado.aceito) expect(resultado.motivo).toContain("administrativa");
  });

  it("informa conexão indisponível sem consultar o esquema", async () => {
    const destino = { host: "127.0.0.1", porta: 9, banco: "fd_teste_nao_conectar", servidor: container };
    const resultado = await executarLeitura(pedido({ destino, esperado: { ...destino } }));
    expect(resultado.aceito).toBe(true);
    if (resultado.aceito && resultado.situacao === "indisponivel") {
      expect(resultado.consultasExecutadas).toEqual([]);
      expect(resultado.motivo).not.toContain(senhaLeitura);
      expect(resultado.situacaoOperacional).toBe(SITUACAO_OPERACIONAL);
    } else {
      throw new Error("A porta fechada foi tratada como leitura.");
    }
  });

  it("recusa destino diferente do esperado antes de conectar", async () => {
    const destino = { host: "127.0.0.1", porta, banco: "fd_outro", servidor: container };
    const resultado = await executarLeitura(pedido({
      destino,
      esperado: { host: "127.0.0.1", porta, banco, servidor: container },
    }), async () => { throw new Error("CONECTOU"); });
    expect(resultado.aceito).toBe(false);
    if (!resultado.aceito) expect(resultado.motivo).toContain("não confirma");
  });

  it("não começa a leitura sem a frase, mesmo com o ambiente apontando para o ensaio", async () => {
    const resultado = await executarLeitura(pedido({ autorizacao: "" }), async () => { throw new Error("CONECTOU"); });
    expect(resultado.aceito).toBe(false);
    if (!resultado.aceito) {
      expect(resultado.motivo).toContain("Sem autorização");
      expect(resultado.consultasExecutadas).toEqual([]);
    }
  });

  it("recusa a porta operacional e preserva o bloqueio dos testes", async () => {
    const destino = { host: "127.0.0.1", porta: PORTA_OPERACIONAL, banco: "fazenda_digital", servidor: "fazenda-digital-mysql" };
    const resultado = await executarLeitura(pedido({ destino, esperado: { ...destino } }), async () => { throw new Error("CONECTOU"); });
    expect(resultado.aceito).toBe(false);
    if (!resultado.aceito) expect(resultado.motivo).toContain("não está habilitada");
    expect(() => afirmarBancoDescartavel({
      host: "127.0.0.1",
      port: PORTA_OPERACIONAL,
      database: banco,
      container,
    })).toThrow(/porta/);
  });
});
