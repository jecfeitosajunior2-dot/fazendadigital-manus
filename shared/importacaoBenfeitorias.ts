/**
 * Definições compartilhadas para importação em massa de benfeitorias via planilha.
 * Sequência do modelo FD: Fazenda → Nome (Benfeitoria) → Ano → Valor (R$) → Vida útil → Observações
 */

export interface ColunaImportacao {
  key: string;
  label: string;
  obrigatorio: boolean;
  descricao: string;
  exemplo: string;
  largura: number;
}

export const COLUNAS_IMPORTACAO: ColunaImportacao[] = [
  { key: 'fazendaNome', label: 'Fazenda', obrigatorio: true, largura: 24, descricao: 'Nome exato da fazenda cadastrada no sistema', exemplo: 'Fazenda Volta Grande' },
  { key: 'nome', label: 'Nome (Benfeitoria)', obrigatorio: true, largura: 28, descricao: 'Nome da benfeitoria', exemplo: 'Galpão de Máquinas' },
  { key: 'anoConstrucao', label: 'Ano', obrigatorio: true, largura: 12, descricao: 'Ano de construção (4 dígitos)', exemplo: '2020' },
  { key: 'valor', label: 'Valor (R$)', obrigatorio: false, largura: 16, descricao: 'Valor estimado em reais', exemplo: '150000.00' },
  { key: 'vidaUtil', label: 'Vida útil', obrigatorio: false, largura: 14, descricao: 'Vida útil estimada em anos', exemplo: '15' },
  { key: 'observacoes', label: 'Observações', obrigatorio: false, largura: 32, descricao: 'Observações adicionais', exemplo: '' },
];

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

export const CABECALHO_PARA_CHAVE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const col of COLUNAS_IMPORTACAO) {
    map[normalizarCabecalho(col.label)] = col.key;
    map[normalizarCabecalho(col.key)] = col.key;
  }
  const aliases: Record<string, string> = {
    benfeitoria: 'nome',
    nome: 'nome',
    nomebenfeitoria: 'nome',
    fazenda: 'fazendaNome',
    fazendanome: 'fazendaNome',
    anoconstrucao: 'anoConstrucao',
    ano: 'anoConstrucao',
    vidautil: 'vidaUtil',
    valorrs: 'valor',
    valorestimado: 'valor',
    observacoes: 'observacoes',
    observacao: 'observacoes',
  };
  for (const [k, v] of Object.entries(aliases)) {
    map[normalizarCabecalho(k)] = v;
  }
  return map;
})();

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

export const EXEMPLO_NOME = 'Galpão de Máquinas';
export const EXEMPLO_FAZENDA = 'Fazenda Volta Grande';
export const EXEMPLO_ANO = '2020';

export function isLinhaExemplo(linha: Record<string, string>): boolean {
  const nome = (linha.nome ?? '').trim().toLowerCase();
  const fazenda = (linha.fazendaNome ?? '').trim().toLowerCase();
  const ano = (linha.anoConstrucao ?? '').trim();
  return (
    nome === EXEMPLO_NOME.toLowerCase() &&
    fazenda === EXEMPLO_FAZENDA.toLowerCase() &&
    ano === EXEMPLO_ANO
  );
}

export function parseValorImport(val: string): string {
  const v = val.trim();
  if (!v) return '';
  if (v.includes(',')) {
    const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
    return Number.isNaN(n) ? '' : n.toFixed(2);
  }
  const n = parseFloat(v);
  return Number.isNaN(n) ? '' : n.toFixed(2);
}

/** Cabeçalhos na ordem do modelo FD para exportação. */
export const EXPORT_HEADERS = COLUNAS_IMPORTACAO.map(c => c.label);
