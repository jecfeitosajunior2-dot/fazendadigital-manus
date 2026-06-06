/**
 * shared/importacaoMaquinarios.ts
 *
 * Definições compartilhadas entre frontend e backend para a
 * importação em massa de maquinários via planilha.
 *
 * Segue exatamente o mesmo padrão de importacaoAnimais.ts.
 */

// ─── Colunas da planilha modelo ──────────────────────────────────────────────

export interface ColunaImportacao {
  key: string;
  label: string;
  obrigatorio: boolean;
  descricao: string;
  exemplo: string;
  largura: number;
}

export const COLUNAS_IMPORTACAO: ColunaImportacao[] = [
  { key: 'tipo',           label: 'Tipo (Máquina)',       obrigatorio: true,  largura: 18, descricao: 'Tipo do maquinário (ex: Trator, Colheitadeira)', exemplo: 'Trator' },
  { key: 'fazendaNome',    label: 'Fazenda',               obrigatorio: true,  largura: 22, descricao: 'Nome exato da fazenda cadastrada no sistema',     exemplo: 'Fazenda São João' },
  { key: 'nome',           label: 'Apelido',               obrigatorio: false, largura: 18, descricao: 'Nome/apelido do maquinário',                      exemplo: 'Trator - 01' },
  { key: 'valor',          label: 'Valor (R$)',             obrigatorio: false, largura: 14, descricao: 'Valor de aquisição em reais',                     exemplo: '150000.00' },
  { key: 'marca',          label: 'Marca',                  obrigatorio: true,  largura: 16, descricao: 'Marca do fabricante',                             exemplo: 'John Deere' },
  { key: 'modelo',         label: 'Modelo',                 obrigatorio: false, largura: 14, descricao: 'Modelo do equipamento',                           exemplo: '5075E' },
  { key: 'placa',          label: 'Placa ou Nº de Série',   obrigatorio: false, largura: 18, descricao: 'Placa veicular ou número de série',               exemplo: 'ABC-1234' },
  { key: 'ano',            label: 'Ano de Fabricação',      obrigatorio: false, largura: 16, descricao: 'Ano de fabricação (4 dígitos)',                   exemplo: '2022' },
  { key: 'anoAquisicao',   label: 'Ano de Aquisição',       obrigatorio: false, largura: 16, descricao: 'Ano em que foi adquirido (4 dígitos)',            exemplo: '2023' },
  { key: 'vidaUtil',       label: 'Vida Útil',              obrigatorio: false, largura: 14, descricao: 'Vida útil estimada (ex: 10 anos)',                exemplo: '10 anos' },
  { key: 'dataDesativacao',label: 'Data de Desativação',    obrigatorio: false, largura: 20, descricao: 'Data de desativação no formato DD/MM/AAAA',       exemplo: '31/12/2030' },
  { key: 'estado',         label: 'Estado',                 obrigatorio: false, largura: 12, descricao: 'Estado de conservação: Novo ou Usado',            exemplo: 'Usado' },
  { key: 'status',         label: 'Status',                 obrigatorio: false, largura: 14, descricao: 'Status operacional: Ativo, Manutenção ou Inativo', exemplo: 'Ativo' },
  { key: 'observacoes',    label: 'Observações',            obrigatorio: false, largura: 28, descricao: 'Observações livres sobre o maquinário',           exemplo: 'Revisão em dia' },
];

// ─── Normalização de cabeçalhos ──────────────────────────────────────────────

/**
 * Normaliza texto de cabeçalho para comparação:
 * - minúsculas, sem acentos, sem parênteses, sem pontuação
 */
export function normalizarCabecalho(texto: string): string {
  return (texto || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Mapa: cabeçalho normalizado → chave interna.
 */
export const CABECALHO_PARA_CHAVE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const col of COLUNAS_IMPORTACAO) {
    map[normalizarCabecalho(col.label)] = col.key;
    map[normalizarCabecalho(col.key)]   = col.key;
  }
  // Aliases adicionais para máxima compatibilidade
  const aliases: Record<string, string> = {
    'tipomaquina':        'tipo',
    'tipomaquinario':     'tipo',
    'apelido':            'nome',
    'nomemaquina':        'nome',
    'nomemaquinario':     'nome',
    'valorrs':            'valor',
    'valorreais':         'valor',
    'placaoundedeserie':  'placa',
    'placaounserie':      'placa',
    'numeroserie':        'placa',
    'nserie':             'placa',
    'anofabricacao':      'ano',
    'anofab':             'ano',
    'anodeaquisicao':     'anoAquisicao',
    'vidautilestimada':   'vidaUtil',
    'datadedesativacao':  'dataDesativacao',
    'estadodeconservacao':'estado',
    'statusoperacional':  'status',
    'observacao':         'observacoes',
    'obs':                'observacoes',
    'fazendanome':        'fazendaNome',
    'fazenda':            'fazendaNome',
  };
  for (const [k, v] of Object.entries(aliases)) {
    map[normalizarCabecalho(k)] = v;
  }
  return map;
})();

/**
 * Recebe uma linha lida da planilha (chaves = cabeçalhos originais)
 * e retorna uma linha normalizada com as chaves internas do backend.
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

// ─── Normalização de enums ───────────────────────────────────────────────────

export function normalizarEstado(v: string): string {
  const s = normalizarCabecalho(v);
  if (s === 'novo' || s === 'new') return 'novo';
  if (s === 'usado' || s === 'used' || s === 'usada') return 'usado';
  return (v || '').toLowerCase().trim();
}

export function normalizarStatus(v: string): string {
  const s = normalizarCabecalho(v);
  const map: Record<string, string> = {
    ativo: 'ativo', active: 'ativo',
    manutencao: 'manutencao', manutencoes: 'manutencao', emmanutencao: 'manutencao',
    inativo: 'inativo', inactive: 'inativo', desativado: 'inativo',
  };
  return map[s] || 'ativo';
}

// ─── Detecção de linha de exemplo ────────────────────────────────────────────

/** Marcador da linha ilustrativa na planilha modelo */
export const EXEMPLO_TIPO  = 'Trator';
export const EXEMPLO_MARCA = 'John Deere';
export const EXEMPLO_PLACA = 'ABC-1234';

/**
 * Detecta se a linha normalizada é a linha de exemplo ilustrativa.
 * Critério: tipo = "Trator" E marca = "John Deere" E placa = "ABC-1234"
 * (combinação improvável em dados reais).
 */
export function isLinhaExemplo(linhaNormalizada: Record<string, string>): boolean {
  const tipo  = (linhaNormalizada.tipo  ?? '').trim().toLowerCase();
  const marca = (linhaNormalizada.marca ?? '').trim().toLowerCase();
  const placa = (linhaNormalizada.placa ?? '').trim().toLowerCase();
  return (
    tipo  === EXEMPLO_TIPO.toLowerCase()  &&
    marca === EXEMPLO_MARCA.toLowerCase() &&
    placa === EXEMPLO_PLACA.toLowerCase()
  );
}
