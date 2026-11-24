/**
 * Compara o catálogo do repositório com uma foto de esquema.
 * Não abre conexão e não aplica arquivo.
 * Sem foto, o estado é não verificado. O banco da fazenda não é preenchido por suposição.
 */

export const SITUACAO_OPERACIONAL = "NÃO VERIFICADO NO OPERACIONAL" as const;

export type EstadoEstrutura =
  | "EXISTENTE E COMPATÍVEL"
  | "AUSENTE"
  | "PARCIALMENTE EXISTENTE"
  | "EXISTENTE E INCOMPATÍVEL"
  | "NÃO VERIFICADA";

export type FotoEsquema = {
  tabelas: string[];
  colunas: { tabela: string; coluna: string; tipo: string; nulo: boolean; extra: string }[];
  indices: { tabela: string; nome: string; unico: boolean; colunas: string[] }[];
  chavesEstrangeiras: { tabela: string; nome: string; coluna: string; referencia: string }[];
  journalEntradas: number | null;
};

type Peca = {
  arquivo: string;
  noModelo: boolean;
  tabela: string;
  estrutura: string;
  tipo: "tabela" | "coluna" | "indice";
  coluna?: { nome: string; tipo: string; nulo: boolean; gerada?: boolean };
  indice?: { nome: string; unico: boolean; colunas: string[] };
};

export type LinhaArquivo = {
  migracao: string;
  noModelo: boolean;
  tabelas: string[];
  estado: EstadoEstrutura;
  dependencias: string;
  risco: string;
  preVerificacao: string;
  testeFuncional: string;
  interrupcao: string;
  backup: string;
  necessidade: string;
  proximaAcao: string;
};

const peca = (item: Peca): Peca => item;

const COLUNA = (arquivo: string, noModelo: boolean, tabela: string, nome: string, tipo: string, nulo: boolean, gerada = false): Peca => peca({
  arquivo, noModelo, tabela, tipo: "coluna", estrutura: `${nome} ${tipo}${nulo ? " nula" : " obrigatória"}${gerada ? " gerada" : ""}`,
  coluna: { nome, tipo, nulo, gerada },
});

const INDICE = (arquivo: string, noModelo: boolean, tabela: string, nome: string, unico: boolean, colunas: string[]): Peca => peca({
  arquivo, noModelo, tabela, tipo: "indice", estrutura: `${nome} ${unico ? "único" : "comum"} (${colunas.join(", ")})`,
  indice: { nome, unico, colunas },
});

const TABELA = (arquivo: string, noModelo: boolean, tabela: string): Peca => peca({
  arquivo, noModelo, tabela, tipo: "tabela", estrutura: `tabela ${tabela}`,
});

/** Peças exigidas pelo modelo ou por proposta. A 0070 não entra. */
export const PECAS: readonly Peca[] = [
  COLUNA("0060", true, "manutencoes", "chaveOperacao", "varchar(80)", true),
  INDICE("0060", true, "manutencoes", "manutencoes_chave_operacao_uq", true, ["userId", "chaveOperacao"]),
  TABELA("0067", true, "reproducao_operacoes"),
  COLUNA("0067", true, "reproducao_operacoes", "userId", "int", false),
  COLUNA("0067", true, "reproducao_operacoes", "chave", "varchar(64)", false),
  COLUNA("0067", true, "reproducao_operacoes", "fazendaId", "int", false),
  COLUNA("0067", true, "reproducao_operacoes", "conteudoHash", "varchar(64)", false),
  INDICE("0067", true, "reproducao_operacoes", "reproducao_operacoes_titular_chave_uq", true, ["userId", "chave"]),
  TABELA("0068", true, "semen_entrada_operacoes"),
  COLUNA("0068", true, "semen_entrada_operacoes", "userId", "int", false),
  COLUNA("0068", true, "semen_entrada_operacoes", "chave", "varchar(64)", false),
  COLUNA("0068", true, "semen_entrada_operacoes", "fazendaId", "int", false),
  COLUNA("0068", true, "semen_entrada_operacoes", "conteudoHash", "varchar(64)", false),
  INDICE("0068", true, "semen_entrada_operacoes", "semen_entrada_operacoes_titular_chave_uq", true, ["userId", "chave"]),
  TABELA("0069", true, "semen_partidas"),
  COLUNA("0069", true, "semen_partidas", "user_id", "int", false),
  COLUNA("0069", true, "semen_partidas", "fazenda_id", "int", false),
  COLUNA("0069", true, "semen_partidas", "reprodutor_key", "varchar(120)", false),
  COLUNA("0069", true, "semen_partidas", "partida", "varchar(120)", false),
  INDICE("0069", true, "semen_partidas", "semen_partidas_uq", true, ["user_id", "fazenda_id", "reprodutor_key", "partida"]),
  TABELA("0071", false, "animais"),
  COLUNA("0071", false, "animais", "brinco_ativo_chave", "varchar(50)", true, true),
  INDICE("0071", false, "animais", "animais_brinco_ativo_fazenda_uq", true, ["userId", "fazendaId", "brinco_ativo_chave"]),
  TABELA("0072", false, "estoque_movimentacao_chaves"),
  COLUNA("0072", false, "estoque_movimentacao_chaves", "titular_user_id", "int", false),
  COLUNA("0072", false, "estoque_movimentacao_chaves", "chave", "varchar(80)", false),
  COLUNA("0072", false, "estoque_movimentacao_chaves", "conteudo_hash", "char(64)", false),
  COLUNA("0072", false, "estoque_movimentacao_chaves", "estoque_id", "int", false),
  COLUNA("0072", false, "estoque_movimentacao_chaves", "fazenda_id", "int", false),
  INDICE("0072", false, "estoque_movimentacao_chaves", "estoque_mov_chave_uq", true, ["titular_user_id", "chave"]),
  TABELA("0073", false, "nutricao_fornecimentos"),
  COLUNA("0073", false, "nutricao_fornecimentos", "chaveOperacao", "varchar(80)", true),
  COLUNA("0073", false, "nutricao_fornecimentos", "conteudoHash", "varchar(64)", true),
  INDICE("0073", false, "nutricao_fornecimentos", "nutricao_fornecimentos_user_chave_uq", true, ["userId", "chaveOperacao"]),
  TABELA("0073", false, "nutricao_batidas"),
  COLUNA("0073", false, "nutricao_batidas", "chaveOperacao", "varchar(80)", true),
  COLUNA("0073", false, "nutricao_batidas", "conteudoHash", "varchar(64)", true),
  INDICE("0073", false, "nutricao_batidas", "nutricao_batidas_user_chave_uq", true, ["userId", "chaveOperacao"]),
  TABELA("0074", false, "nutricao_cocho_leituras"),
  COLUNA("0074", false, "nutricao_cocho_leituras", "chaveOperacao", "varchar(80)", true),
  COLUNA("0074", false, "nutricao_cocho_leituras", "conteudoHash", "varchar(64)", true),
  INDICE("0074", false, "nutricao_cocho_leituras", "nutricao_cocho_leituras_user_chave_uq", true, ["userId", "chaveOperacao"]),
  COLUNA("0075", false, "manutencoes", "fazendaId", "int", true),
  INDICE("0075", false, "manutencoes", "manutencoes_user_fazenda_idx", false, ["userId", "fazendaId"]),
  COLUNA("0076", false, "abastecimentos", "chaveOperacao", "varchar(80)", true),
  INDICE("0076", false, "abastecimentos", "abastecimentos_chave_operacao_uq", true, ["userId", "chaveOperacao"]),
  COLUNA("0077", false, "manutencoes", "conteudoOriginal", "varchar(64)", true),
  COLUNA("0077", false, "abastecimentos", "conteudoOriginal", "varchar(64)", true),
];

const TEXTO: Record<string, Omit<LinhaArquivo, "migracao" | "noModelo" | "tabelas" | "estado" | "necessidade" | "proximaAcao">> = {
  "0060": {
    dependencias: "Tabela manutencoes já existente.",
    risco: "Segunda execução encontra a coluna. O ALTER não volta com ROLLBACK.",
    preVerificacao: "Coluna e índice único em userId e chaveOperacao, nessa ordem.",
    testeFuncional: "Abertura de ordem de serviço com a mesma chave.",
    interrupcao: "Parar. Não continuar o comando seguinte. Restaurar a cópia conferida.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0067": {
    dependencias: "Nenhuma tabela anterior. Não altera o lançamento antigo de reprodução.",
    risco: "CREATE TABLE em um comando. A segunda execução encontra a tabela.",
    preVerificacao: "Tabela, colunas userId e chave, índice único nessa ordem.",
    testeFuncional: "Estação de monta e cobertura coletiva com a mesma chave.",
    interrupcao: "Parar se a definição divergir. Não apagar operação já gravada.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0068": {
    dependencias: "Não depende da 0067 nem de um índice novo em semen_partidas.",
    risco: "CREATE TABLE em um comando. A segunda execução encontra a tabela.",
    preVerificacao: "Tabela, colunas userId e chave, índice único nessa ordem.",
    testeFuncional: "Entrada de sêmen com a mesma chave.",
    interrupcao: "Parar se a definição divergir. Não apagar partida nem movimento.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0069": {
    dependencias: "Tabela semen_partidas com a identidade preenchida. Não depende da 0068.",
    risco: "Duplicata impede o índice. A rotina lista e não apaga partida.",
    preVerificacao: "Colunas obrigatórias e índice único na ordem user_id, fazenda_id, reprodutor_key, partida.",
    testeFuncional: "Duas partidas iguais no mesmo titular e na mesma fazenda.",
    interrupcao: "Parar e conservar as duas linhas. Não escolher uma para apagar.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0071": {
    dependencias: "Animais com userId, fazendaId, brinco e status. A 0070 permanece rejeitada.",
    risco: "Brinco ativo repetido na mesma fazenda impede a coluna. As duas linhas ficam.",
    preVerificacao: "Coluna gerada e índice único em userId, fazendaId e brinco_ativo_chave. O nome sozinho não basta.",
    testeFuncional: "Mesmo brinco ativo em duas fazendas pode conviver. Na mesma fazenda, não.",
    interrupcao: "Parar. Não apagar animal para forçar o índice.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0072": {
    dependencias: "Nenhuma tabela anterior.",
    risco: "Se a tabela existir com outro índice, a rotina recusa antes de alterar.",
    preVerificacao: "Tabela e índice único em titular_user_id e chave, nessa ordem.",
    testeFuncional: "A mesma chave de movimentação manual não entra duas vezes.",
    interrupcao: "Parar. Não apagar movimento nem saldo.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0073": {
    dependencias: "Tabelas nutricao_fornecimentos e nutricao_batidas. Não altera leitura de cocho.",
    risco: "Quatro comandos. Falha no meio deixa fornecimento e batida diferentes.",
    preVerificacao: "As duas colunas e o índice único de cada tabela. Um pedaço só não libera o resto.",
    testeFuncional: "Reenvio de fornecimento e de batida com a mesma chave.",
    interrupcao: "Parar. Não continuar do comando seguinte. Restaurar a cópia conferida.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0074": {
    dependencias: "Tabela nutricao_cocho_leituras. Não depende da 0073.",
    risco: "Dois comandos. A coluna pode ficar sem o índice.",
    preVerificacao: "chaveOperacao, conteudoHash e índice único em userId e chaveOperacao.",
    testeFuncional: "Reenvio da mesma leitura de cocho.",
    interrupcao: "Parar. Não preencher chave nas leituras antigas.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0075": {
    dependencias: "Tabela manutencoes. Não copia a fazenda atual da máquina.",
    risco: "Coluna e índice em comandos separados. O passado permanece com fazenda nula.",
    preVerificacao: "fazendaId nula e índice comum em userId e fazendaId.",
    testeFuncional: "Ordem antiga continua sem fazenda. Ordem nova grava a fazenda da época.",
    interrupcao: "Parar. Não preencher fazenda histórica por inferência.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0076": {
    dependencias: "Tabela abastecimentos.",
    risco: "Coluna e índice em comandos separados.",
    preVerificacao: "chaveOperacao nula e índice único em userId e chaveOperacao.",
    testeFuncional: "Reenvio do mesmo abastecimento.",
    interrupcao: "Parar. Não copiar custo nem quantidade de outro lançamento.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
  "0077": {
    dependencias: "O sentido vem depois da chave de manutenção e de abastecimento. O SQL não exige essas colunas.",
    risco: "Dois ALTER. Um pode passar e o outro ficar de fora.",
    preVerificacao: "conteudoOriginal nula em manutencoes e em abastecimentos.",
    testeFuncional: "Reenvio do pedido original depois de editar o cabeçalho.",
    interrupcao: "Parar. Não preencher a fotografia com o valor atual.",
    backup: "Sim, antes de qualquer aplicação futura.",
  },
};

export const ESTRUTURAS_AUTORIZACAO = [
  { tabela: "users", campos: ["papel", "titularUserId", "situacao", "sessionVersion"] },
  { tabela: "usuario_fazendas", campos: ["userId", "fazendaId"] },
  { tabela: "usuario_permissoes", campos: ["userId", "titularUserId", "permissao"] },
] as const;

export const CAMPOS_FAZENDA = [
  "animais.fazendaId",
  "manutencoes.fazendaId",
  "abastecimentos.fazendaId",
  "maquinas.fazendaId",
  "benfeitorias.fazendaId",
  "estoque.fazenda_id",
  "compras.fazenda_id",
  "vendas.fazenda_id",
] as const;

function necessidade(estado: EstadoEstrutura): string {
  if (estado === "NÃO VERIFICADA") return "Não declarar necessária. O banco da fazenda não foi lido.";
  if (estado === "EXISTENTE E COMPATÍVEL") return "Não aplicar de novo. Estar fora do journal não basta. O banco da fazenda não foi lido.";
  if (estado === "AUSENTE") return "Neste ensaio a estrutura falta. No operacional, só depois da leitura autorizada confirmar a mesma ausência.";
  if (estado === "PARCIALMENTE EXISTENTE") return "Interromper. Não continuar do meio. Restaurar a cópia conferida.";
  return "Não cobrir com o mesmo arquivo. A definição observada diverge.";
}

function proximaAcao(estado: EstadoEstrutura): string {
  if (estado === "NÃO VERIFICADA") return "Aguardar autorização de leitura. Não aplicar o arquivo.";
  if (estado === "EXISTENTE E COMPATÍVEL") return "Conferir de novo no operacional antes de qualquer decisão. Não reaplicar por causa do journal.";
  if (estado === "AUSENTE") return "Repetir a pré-verificação na leitura autorizada. Não aplicar neste momento.";
  if (estado === "PARCIALMENTE EXISTENTE") return "Preservar a evidência e restaurar o backup conferido.";
  return "Parar e comparar a definição. Não seguir para o próximo comando.";
}

function tipoCompativel(observado: string, esperado: string): boolean {
  const atual = observado.toLowerCase().replace(/\s+/g, "");
  const quer = esperado.toLowerCase();
  if (quer === "int") return /^int(\(|$)/.test(atual);
  if (quer.startsWith("varchar(")) return atual.startsWith(quer) && !/^\d/.test(atual.slice(quer.length));
  return atual === quer;
}

function estadoPeca(item: Peca, foto: FotoEsquema | null): EstadoEstrutura {
  if (!foto) return "NÃO VERIFICADA";
  const temTabela = foto.tabelas.includes(item.tabela);
  if (item.tipo === "tabela") return temTabela ? "EXISTENTE E COMPATÍVEL" : "AUSENTE";
  if (!temTabela) return "AUSENTE";
  if (item.tipo === "coluna" && item.coluna) {
    const coluna = foto.colunas.find(atual => atual.tabela === item.tabela && atual.coluna === item.coluna?.nome);
    if (!coluna) return "AUSENTE";
    const geradaOk = item.coluna.gerada ? coluna.extra.toLowerCase().includes("generated") : !coluna.extra.toLowerCase().includes("generated");
    if (!tipoCompativel(coluna.tipo, item.coluna.tipo) || coluna.nulo !== item.coluna.nulo || !geradaOk) {
      return "EXISTENTE E INCOMPATÍVEL";
    }
    return "EXISTENTE E COMPATÍVEL";
  }
  if (item.tipo === "indice" && item.indice) {
    const indice = foto.indices.find(atual => atual.tabela === item.tabela && atual.nome === item.indice?.nome);
    if (!indice) return "AUSENTE";
    const mesmasColunas = indice.colunas.join(",") === item.indice.colunas.join(",");
    if (indice.unico !== item.indice.unico || !mesmasColunas) return "EXISTENTE E INCOMPATÍVEL";
    return "EXISTENTE E COMPATÍVEL";
  }
  return "NÃO VERIFICADA";
}

function estadoGrupo(estados: EstadoEstrutura[]): EstadoEstrutura {
  if (estados.some(estado => estado === "NÃO VERIFICADA")) return "NÃO VERIFICADA";
  if (estados.some(estado => estado === "EXISTENTE E INCOMPATÍVEL")) return "EXISTENTE E INCOMPATÍVEL";
  const compativeis = estados.filter(estado => estado === "EXISTENTE E COMPATÍVEL").length;
  const ausentes = estados.filter(estado => estado === "AUSENTE").length;
  if (ausentes === estados.length) return "AUSENTE";
  if (compativeis === estados.length) return "EXISTENTE E COMPATÍVEL";
  return "PARCIALMENTE EXISTENTE";
}

export function compararFoto(foto: FotoEsquema | null): { pecas: { estrutura: string; tabela: string; migracao: string; estado: EstadoEstrutura }[]; arquivos: LinhaArquivo[] } {
  const pecas = PECAS.map(item => ({
    estrutura: item.estrutura,
    tabela: item.tabela,
    migracao: item.arquivo,
    estado: estadoPeca(item, foto),
  }));
  const arquivos = [...new Set(PECAS.map(item => item.arquivo))].map(arquivo => {
    const itens = PECAS.filter(item => item.arquivo === arquivo);
    const estado = estadoGrupo(itens.map(item => estadoPeca(item, foto)));
    const texto = TEXTO[arquivo];
    return {
      migracao: arquivo,
      noModelo: itens.every(item => item.noModelo),
      tabelas: [...new Set(itens.map(item => item.tabela))],
      estado,
      ...texto,
      necessidade: necessidade(estado),
      proximaAcao: proximaAcao(estado),
    };
  });
  return { pecas, arquivos };
}

export function matrizOperacional() {
  const base = compararFoto(null).arquivos.map(arquivo => ({
    tabela: arquivo.tabelas.join(", "),
    estrutura: arquivo.migracao,
    estadoEsperado: arquivo.noModelo ? "já está no modelo atual" : "proposta ainda fora do modelo",
    estadoObservado: SITUACAO_OPERACIONAL,
    migracao: arquivo.migracao,
    dependencias: arquivo.dependencias,
    risco: arquivo.risco,
    preVerificacao: arquivo.preVerificacao,
    proximaAcao: "Aguardar autorização de leitura. Não aplicar o arquivo.",
  }));
  return [...base, {
    tabela: "animais",
    estrutura: "0070 rejeitada",
    estadoEsperado: "ausente — proposta rejeitada",
    estadoObservado: SITUACAO_OPERACIONAL,
    migracao: "0070",
    dependencias: "Não executar.",
    risco: "O índice por titular, sem fazenda, bloqueia o mesmo brinco em fazendas diferentes.",
    preVerificacao: "Confirmar que animais_user_brinco_ativo_uq não será criado.",
    proximaAcao: "Não aplicar a 0070.",
  }];
}

export function vigiar0070(foto: FotoEsquema | null): { estado: EstadoEstrutura; detalhe: string } {
  if (!foto) return { estado: "NÃO VERIFICADA", detalhe: "Sem leitura." };
  const indice = foto.indices.find(item => item.tabela === "animais" && item.nome === "animais_user_brinco_ativo_uq");
  if (!indice) return { estado: "AUSENTE", detalhe: "O índice da proposta rejeitada não apareceu neste ensaio." };
  return { estado: "EXISTENTE E INCOMPATÍVEL", detalhe: "O índice da 0070 está presente. Não usar essa definição." };
}

export function avaliarJournal(entradas: number | null) {
  return {
    entradas,
    tagNoRepositorio: "0000_omniscient_jigsaw",
    arquivosForaDoJournal: [...new Set(PECAS.map(item => item.arquivo))],
    aplicarPorqueForaDoJournal: false,
    leitura: "O arquivo estar fora do journal não torna a migração necessária. A decisão usa a estrutura observada. O banco da fazenda segue não verificado.",
  };
}

export type ConsultaContagem = {
  id: string;
  assunto: string;
  sql: string;
  exigeTabela: string;
  exigeColuna?: string;
};

export const CONSULTAS_DUPLICIDADE: readonly ConsultaContagem[] = [
  {
    id: "brincos_ativos",
    assunto: "Brincos ativos repetidos na mesma fazenda, depois de tirar espaço e caixa.",
    exigeTabela: "animais",
    exigeColuna: "brinco",
    sql: `SELECT COUNT(*) AS total FROM (
      SELECT userId, fazendaId, LOWER(TRIM(brinco)) AS chave
      FROM animais
      WHERE status = 'ativo' AND fazendaId IS NOT NULL AND brinco IS NOT NULL AND CHAR_LENGTH(TRIM(brinco)) > 0
      GROUP BY userId, fazendaId, LOWER(TRIM(brinco))
      HAVING COUNT(*) > 1
    ) AS grupos`,
  },
  {
    id: "partidas_semen",
    assunto: "Partidas repetidas no mesmo titular e na mesma fazenda.",
    exigeTabela: "semen_partidas",
    exigeColuna: "partida",
    sql: `SELECT COUNT(*) AS total FROM (
      SELECT user_id, fazenda_id, reprodutor_key, partida
      FROM semen_partidas
      GROUP BY user_id, fazenda_id, reprodutor_key, partida
      HAVING COUNT(*) > 1
    ) AS grupos`,
  },
  {
    id: "chaves_manutencao",
    assunto: "Chaves de manutenção repetidas.",
    exigeTabela: "manutencoes",
    exigeColuna: "chaveOperacao",
    sql: `SELECT COUNT(*) AS total FROM (
      SELECT userId, chaveOperacao FROM manutencoes
      WHERE chaveOperacao IS NOT NULL
      GROUP BY userId, chaveOperacao HAVING COUNT(*) > 1
    ) AS grupos`,
  },
  {
    id: "chaves_abastecimento",
    assunto: "Chaves de abastecimento repetidas.",
    exigeTabela: "abastecimentos",
    exigeColuna: "chaveOperacao",
    sql: `SELECT COUNT(*) AS total FROM (
      SELECT userId, chaveOperacao FROM abastecimentos
      WHERE chaveOperacao IS NOT NULL
      GROUP BY userId, chaveOperacao HAVING COUNT(*) > 1
    ) AS grupos`,
  },
  {
    id: "chaves_estoque",
    assunto: "Chaves de movimentação de estoque repetidas.",
    exigeTabela: "estoque_movimentacao_chaves",
    exigeColuna: "chave",
    sql: `SELECT COUNT(*) AS total FROM (
      SELECT titular_user_id, chave FROM estoque_movimentacao_chaves
      GROUP BY titular_user_id, chave HAVING COUNT(*) > 1
    ) AS grupos`,
  },
];

export const CONSULTAS_HISTORICO: readonly ConsultaContagem[] = [
  { id: "animais_fazenda_nula", assunto: "Animais sem fazenda.", exigeTabela: "animais", exigeColuna: "fazendaId", sql: "SELECT COUNT(*) AS total FROM animais WHERE fazendaId IS NULL" },
  { id: "animais_usuario_comum", assunto: "Animais ligados a usuário comum, sem atribuir titular.", exigeTabela: "animais", sql: "SELECT COUNT(*) AS total FROM animais a INNER JOIN users u ON u.id = a.userId WHERE u.papel = 'comum'" },
  { id: "brincos_usuario_comum", assunto: "Trocas de brinco ligadas a usuário comum.", exigeTabela: "historico_brincos", sql: "SELECT COUNT(*) AS total FROM historico_brincos h INNER JOIN users u ON u.id = h.userId WHERE u.papel = 'comum'" },
  { id: "pesagens_usuario_comum", assunto: "Pesagens ligadas a usuário comum. A tabela não tem fazenda.", exigeTabela: "pesagens", sql: "SELECT COUNT(*) AS total FROM pesagens p INNER JOIN users u ON u.id = p.userId WHERE u.papel = 'comum'" },
  { id: "maquinas_fazenda_nula", assunto: "Máquinas sem fazenda.", exigeTabela: "maquinas", exigeColuna: "fazendaId", sql: "SELECT COUNT(*) AS total FROM maquinas WHERE fazendaId IS NULL" },
  { id: "maquinas_usuario_comum", assunto: "Máquinas ligadas a usuário comum.", exigeTabela: "maquinas", sql: "SELECT COUNT(*) AS total FROM maquinas m INNER JOIN users u ON u.id = m.userId WHERE u.papel = 'comum'" },
  { id: "manutencoes_fazenda_nula", assunto: "Manutenções sem fazenda, só se a coluna existir.", exigeTabela: "manutencoes", exigeColuna: "fazendaId", sql: "SELECT COUNT(*) AS total FROM manutencoes WHERE fazendaId IS NULL" },
  { id: "manutencoes_usuario_comum", assunto: "Manutenções ligadas a usuário comum.", exigeTabela: "manutencoes", sql: "SELECT COUNT(*) AS total FROM manutencoes m INNER JOIN users u ON u.id = m.userId WHERE u.papel = 'comum'" },
  { id: "abastecimentos_fazenda_nula", assunto: "Abastecimentos sem fazenda.", exigeTabela: "abastecimentos", exigeColuna: "fazendaId", sql: "SELECT COUNT(*) AS total FROM abastecimentos WHERE fazendaId IS NULL" },
  { id: "abastecimentos_usuario_comum", assunto: "Abastecimentos ligados a usuário comum.", exigeTabela: "abastecimentos", sql: "SELECT COUNT(*) AS total FROM abastecimentos a INNER JOIN users u ON u.id = a.userId WHERE u.papel = 'comum'" },
  { id: "estoque_fazenda_nula", assunto: "Saldos de estoque sem fazenda.", exigeTabela: "estoque", exigeColuna: "fazenda_id", sql: "SELECT COUNT(*) AS total FROM estoque WHERE fazenda_id IS NULL" },
  { id: "compras_fazenda_nula", assunto: "Compras sem fazenda.", exigeTabela: "compras", exigeColuna: "fazenda_id", sql: "SELECT COUNT(*) AS total FROM compras WHERE fazenda_id IS NULL" },
  { id: "compras_usuario_comum", assunto: "Compras ligadas a usuário comum.", exigeTabela: "compras", sql: "SELECT COUNT(*) AS total FROM compras c INNER JOIN users u ON u.id = c.user_id WHERE u.papel = 'comum'" },
  { id: "vendas_fazenda_nula", assunto: "Vendas sem fazenda.", exigeTabela: "vendas", exigeColuna: "fazenda_id", sql: "SELECT COUNT(*) AS total FROM vendas WHERE fazenda_id IS NULL" },
  { id: "vendas_usuario_comum", assunto: "Vendas ligadas a usuário comum.", exigeTabela: "vendas", sql: "SELECT COUNT(*) AS total FROM vendas v INNER JOIN users u ON u.id = v.user_id WHERE u.papel = 'comum'" },
  { id: "benfeitorias_fazenda_nula", assunto: "Benfeitorias sem fazenda.", exigeTabela: "benfeitorias", exigeColuna: "fazendaId", sql: "SELECT COUNT(*) AS total FROM benfeitorias WHERE fazendaId IS NULL" },
  { id: "benfeitorias_usuario_comum", assunto: "Benfeitorias ligadas a usuário comum.", exigeTabela: "benfeitorias", sql: "SELECT COUNT(*) AS total FROM benfeitorias b INNER JOIN users u ON u.id = b.userId WHERE u.papel = 'comum'" },
];

export function consultaEhContagem(sql: string): boolean {
  const texto = sql.trim().toLowerCase();
  if (!texto.startsWith("select count(*) as total")) return false;
  if (texto.includes(";")) return false;
  const proibidos = ["insert", "update", "delete", "alter", "drop", "create", "truncate", "replace", "grant", "revoke", "lock", "outfile", "for update", "for share", " into "];
  if (proibidos.some(termo => texto.includes(termo))) return false;
  if (/\b(name|email|openid|password|senha)\b/.test(texto)) return false;
  return true;
}

export function consultaDoCatalogo(id: string): ConsultaContagem | undefined {
  return [...CONSULTAS_DUPLICIDADE, ...CONSULTAS_HISTORICO].find(consulta => consulta.id === id);
}
