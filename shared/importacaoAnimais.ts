/**
 * Definição única das colunas da planilha de importação de animais.
 *
 * Esta é a fonte da verdade compartilhada entre:
 *  - geração da planilha modelo (server)
 *  - normalização dos cabeçalhos lidos do arquivo enviado (server)
 *
 * A planilha do usuário usa cabeçalhos em PORTUGUÊS. O parser precisa mapear
 * esses rótulos (e variações) para as CHAVES INTERNAS usadas no backend.
 */

export interface ColunaImportacao {
  /** Chave interna usada no backend (camelCase) */
  key: string;
  /** Rótulo exibido na planilha (português) */
  label: string;
  /** Se o campo é obrigatório */
  obrigatorio: boolean;
  /** Largura sugerida da coluna no Excel */
  largura: number;
  /** Descrição para o dicionário de dados */
  descricao: string;
  /** Exemplo de valor */
  exemplo: string;
}

/**
 * Ordem e definição EXATAS conforme a planilha oficial — 27 colunas em português.
 *
 * Campos obrigatórios: Fazenda, Brinco, Sexo, Categoria.
 */
export const COLUNAS_IMPORTACAO: ColunaImportacao[] = [
  { key: 'fazendaNome',          label: 'Fazenda',                    obrigatorio: true,  largura: 24, descricao: 'Nome exato da fazenda cadastrada no sistema',                              exemplo: 'Fazenda Volta Grande' },
  { key: 'brinco',               label: 'Brinco',                     obrigatorio: true,  largura: 14, descricao: 'Identificação visual do animal (brinco físico)',                          exemplo: 'BR-001' },
  { key: 'brincoEletronico',     label: 'Brinco Eletrônico',          obrigatorio: false, largura: 20, descricao: 'Número eletrônico do chip RFID',                                          exemplo: '123456789012345' },
  { key: 'sexo',                 label: 'Sexo',                       obrigatorio: true,  largura: 12, descricao: 'Sexo do animal: Macho ou Fêmea',                                         exemplo: 'Fêmea' },
  { key: 'categoria',            label: 'Categoria',                  obrigatorio: true,  largura: 14, descricao: 'Macho: Boi, Novilho, Bezerro | Fêmea: Vaca, Novilha, Bezerra',           exemplo: 'Vaca' },
  { key: 'lote',                 label: 'Lote',                       obrigatorio: false, largura: 18, descricao: 'Nome exato do lote ativo cadastrado',                                     exemplo: 'Engorda 1' },
  { key: 'raca',                 label: 'Raça',                       obrigatorio: false, largura: 16, descricao: 'Raça do animal conforme lista disponível',                                exemplo: 'Nelore' },
  { key: 'pelagem',              label: 'Pelagem',                    obrigatorio: false, largura: 14, descricao: 'Cor/pelagem do animal',                                                   exemplo: 'Branca' },
  { key: 'marca',                label: 'Marca',                      obrigatorio: false, largura: 12, descricao: 'Marca ou sinal do animal',                                                exemplo: 'Fogo' },
  { key: 'subdivisao',           label: 'Subdivisão (Pasto)',         obrigatorio: false, largura: 20, descricao: 'Nome exato do pasto/subdivisão cadastrado na fazenda',                    exemplo: 'Pasto A' },
  { key: 'dataNascimento',       label: 'Data de Nascimento',         obrigatorio: false, largura: 18, descricao: 'Data de nascimento no formato DD/MM/AAAA',                               exemplo: '15/03/2022' },
  { key: 'dataDesmama',          label: 'Data de Desmama',            obrigatorio: false, largura: 16, descricao: 'Data de desmama no formato DD/MM/AAAA',                                  exemplo: '15/09/2022' },
  { key: 'castrado',             label: 'Castrado',                   obrigatorio: false, largura: 12, descricao: 'Se o animal é castrado: Sim ou Não',                                     exemplo: 'Não' },
  { key: 'dataEntrada',          label: 'Data da Entrada',            obrigatorio: false, largura: 16, descricao: 'Data de entrada na fazenda (DD/MM/AAAA)',                                exemplo: '10/01/2023' },
  { key: 'pesoEntrada',          label: 'Peso na Entrada (kg)',       obrigatorio: false, largura: 18, descricao: 'Peso do animal na entrada, em kg',                                       exemplo: '320' },
  { key: 'produtorOrigem',       label: 'Produtor de Origem',         obrigatorio: false, largura: 22, descricao: 'Nome do produtor/fazenda de origem',                                     exemplo: 'Fazenda São João' },
  { key: 'precoKg',              label: 'Preço (R$/kg)',              obrigatorio: false, largura: 14, descricao: 'Preço por kg na compra (R$)',                                             exemplo: '12,50' },
  { key: 'frete',                label: 'Frete (R$)',                 obrigatorio: false, largura: 12, descricao: 'Valor do frete (R$)',                                                    exemplo: '350' },
  { key: 'sisbov',               label: 'SISBOV',                     obrigatorio: false, largura: 16, descricao: 'Número SISBOV do animal',                                                exemplo: '' },
  { key: 'dataRnd',              label: 'Data RND',                   obrigatorio: false, largura: 14, descricao: 'Data RND no formato DD/MM/AAAA',                                         exemplo: '' },
  { key: 'rgn',                  label: 'RGN',                        obrigatorio: false, largura: 12, descricao: 'Registro Genealógico de Nascimento',                                     exemplo: '' },
  { key: 'rgd',                  label: 'RGD',                        obrigatorio: false, largura: 12, descricao: 'Registro Genealógico Definitivo',                                        exemplo: '' },
  { key: 'rastreadoNascimento',  label: 'Rastreado no nascimento',    obrigatorio: false, largura: 22, descricao: 'Se foi rastreado ao nascer: Sim ou Não',                                 exemplo: 'Não' },
  { key: 'pai',                  label: 'Pai (Reprodutor)',           obrigatorio: false, largura: 18, descricao: 'Brinco/nome do pai (reprodutor)',                                        exemplo: '' },
  { key: 'mae',                  label: 'Mãe (Matriz)',               obrigatorio: false, largura: 18, descricao: 'Brinco/nome da mãe (matriz)',                                            exemplo: '' },
  { key: 'status',               label: 'Status',                     obrigatorio: false, largura: 12, descricao: 'Status: Ativo, Vendido, Morto ou Transferido',                           exemplo: 'Ativo' },
  { key: 'observacoes',          label: 'Observações',                obrigatorio: false, largura: 30, descricao: 'Observações livres sobre o animal',                                      exemplo: 'Animal de boa conformação' },
];

/**
 * Normaliza um texto de cabeçalho para comparação:
 * - minúsculas
 * - remove acentos
 * - remove parênteses e seu conteúdo
 * - remove espaços/pontuação extras
 */
export function normalizarCabecalho(texto: string): string {
  return (texto || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove acentos
    .replace(/\(.*?\)/g, '')            // remove (...) ex: "(kg)"
    .replace(/[^a-z0-9]/g, '')          // remove tudo que não é letra/número
    .trim();
}

/**
 * Mapa: cabeçalho normalizado → chave interna.
 * Inclui o label oficial e aliases comuns para máxima compatibilidade.
 */
export const CABECALHO_PARA_CHAVE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  // Mapeia o label oficial de cada coluna
  for (const col of COLUNAS_IMPORTACAO) {
    map[normalizarCabecalho(col.label)] = col.key;
    // A própria chave interna também é aceita (compatibilidade retroativa)
    map[normalizarCabecalho(col.key)] = col.key;
  }
  // Aliases adicionais (variações que o usuário pode usar)
  const aliases: Record<string, string> = {
    'rfid': 'brincoEletronico',
    'brincoeletronico': 'brincoEletronico',
    'numerovisual': 'brinco',
    'numerorfid': 'brincoEletronico',
    'fazenda': 'fazendaNome',
    'nomefazenda': 'fazendaNome',
    'fazendanome': 'fazendaNome',
    'pasto': 'subdivisao',
    'subdivisaopasto': 'subdivisao',
    'pastopiquete': 'subdivisao',
    'piquete': 'subdivisao',
    'datanascimento': 'dataNascimento',
    'datadesmama': 'dataDesmama',
    'dataentrada': 'dataEntrada',
    'datadaentrada': 'dataEntrada',
    'pesodeentrada': 'pesoEntrada',
    'pesoentrada': 'pesoEntrada',
    'pesonaentrada': 'pesoEntrada',
    'produtordeorigem': 'produtorOrigem',
    'produtororigem': 'produtorOrigem',
    'preco': 'precoKg',
    'precorkg': 'precoKg',
    'precokg': 'precoKg',
    'rastreadononascimento': 'rastreadoNascimento',
    'rastreadonascimento': 'rastreadoNascimento',
    'paireprodutor': 'pai',
    'maematriz': 'mae',
    'datarnd': 'dataRnd',
  };
  for (const [k, v] of Object.entries(aliases)) {
    map[normalizarCabecalho(k)] = v;
  }
  return map;
})();

/**
 * Recebe uma linha lida da planilha (chaves = cabeçalhos originais em PT-BR)
 * e retorna uma linha normalizada com as CHAVES INTERNAS do backend.
 * Cabeçalhos não reconhecidos são ignorados.
 */
export function normalizarLinha(linhaOriginal: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [cabecalho, valor] of Object.entries(linhaOriginal)) {
    const chaveNorm = normalizarCabecalho(cabecalho);
    const chaveInterna = CABECALHO_PARA_CHAVE[chaveNorm];
    if (chaveInterna) {
      out[chaveInterna] = (valor ?? '').toString().trim();
    }
  }
  return out;
}

/**
 * Normaliza valores de enums vindos da planilha em PT-BR para o formato do banco.
 * Ex: "Fêmea" → "femea", "Sim" → "sim", "Ativo" → "ativo"
 */
export function normalizarSexo(v: string): string {
  const s = normalizarCabecalho(v);
  if (s === 'femea' || s === 'f' || s === 'fem') return 'femea';
  if (s === 'macho' || s === 'm' || s === 'mac') return 'macho';
  return (v || '').toLowerCase().trim();
}

export function normalizarStatus(v: string): string {
  const s = normalizarCabecalho(v);
  const map: Record<string, string> = {
    ativo: 'ativo', vendido: 'vendido', morto: 'morto',
    transferido: 'transferido', vendida: 'vendido', morta: 'morto',
  };
  return map[s] || (v || '').toLowerCase().trim();
}

export function normalizarBooleano(v: string): boolean {
  const s = normalizarCabecalho(v);
  return ['sim', 's', 'yes', '1', 'true', 'verdadeiro'].includes(s);
}

/**
 * Valores-marcador usados na linha de EXEMPLO ilustrativa da planilha modelo.
 * Estes valores combinados identificam a linha de demonstração que NÃO deve
 * ser validada nem importada.
 */
export const EXEMPLO_BRINCO = 'BR-001';
export const EXEMPLO_NOME = 'Mimosa';

/**
 * Detecção ESTRUTURAL e ROBUSTA de linha de exemplo.
 *
 * A planilha modelo histórica trazia uma linha ilustrativa
 * (Brinco "BR-001", nome "Mimosa", produtor "Fazenda São João", etc.).
 * Mesmo que o usuário utilize uma planilha antiga (com a linha de exemplo
 * embutida na própria aba de dados), esta função garante que ela seja
 * ignorada em TODAS as camadas (parser e validação).
 *
 * A linha recebida já deve estar NORMALIZADA (chaves internas).
 *
 * Critério: considera-se exemplo quando o brinco é exatamente o brinco-marcador
 * (BR-001) — opcionalmente combinado com outros campos-marcador. Usamos o brinco
 * como sinal primário porque é o identificador único da linha de demonstração.
 */
export function isLinhaExemplo(linhaNormalizada: Record<string, string>): boolean {
  const brinco = (linhaNormalizada.brinco ?? '').toString().trim().toLowerCase();
  if (!brinco) return false;

  const brincoMarcador = EXEMPLO_BRINCO.toLowerCase();
  // Sinal primário: brinco idêntico ao marcador da planilha modelo.
  if (brinco === brincoMarcador) {
    return true;
  }
  return false;
}
