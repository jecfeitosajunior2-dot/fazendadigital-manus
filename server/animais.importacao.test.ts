/**
 * Testes para a lógica de validação de importação em massa de animais.
 * Valida: campos obrigatórios, brincos duplicados, datas (multi-formato), status/sexo inválidos.
 */
import { describe, it, expect } from 'vitest';

// ─── Lógica de validação extraída (espelha o backend) ─────────────────────────

const SEXOS_VALIDOS = ['macho', 'femea'];
const STATUS_VALIDOS = ['ativo', 'vendido', 'morto', 'transferido'];
const RACAS_VALIDAS = [
  'Nelore', 'Nelore Mocho', 'Angus', 'Senepol', 'Brahman',
  'Girolando', 'Gir', 'Holandês', 'Mestiço', 'Outro',
];
// Categorias válidas: regra centralizada em shared/animal-types.ts
// Macho: Boi, Novilho, Bezerro | Fêmea: Vaca, Novilha, Bezerra
const CATEGORIAS_VALIDAS = [
  'Boi', 'Novilho', 'Bezerro',
  'Vaca', 'Novilha', 'Bezerra',
];

type LinhaAnimal = Record<string, string>;
type Erro = { linha: number; campo: string; mensagem: string };

/**
 * Converte data nos formatos DD/MM/AAAA, DD/MM/AA ou AAAA-MM-DD para AAAA-MM-DD.
 * Retorna null se o formato não for reconhecido.
 */
function parseDateBR(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Formato ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Formato brasileiro: DD/MM/YYYY ou DD/MM/YY
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (brMatch) {
    const d = brMatch[1].padStart(2, '0');
    const m = brMatch[2].padStart(2, '0');
    let y = brMatch[3];
    if (y.length === 2) {
      y = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`;
    }
    return `${y}-${m}-${d}`;
  }
  return null;
}

function validarLinhas(
  linhas: LinhaAnimal[],
  brincosBancoSet: Set<string> = new Set(),
  loteNomeParaId: Map<string, number> = new Map()
): { validos: LinhaAnimal[]; erros: Erro[] } {
  const erros: Erro[] = [];
  const validos: LinhaAnimal[] = [];
  const brincosNaPlanilha = new Set<string>();

  for (let i = 0; i < linhas.length; i++) {
    const linha = { ...linhas[i] }; // cópia para não mutar o original
    const numLinha = i + 2;
    const errosLinha: Erro[] = [];

    // Brinco obrigatório
    const brinco = (linha.brinco || '').trim();
    if (!brinco) {
      errosLinha.push({ linha: numLinha, campo: 'brinco', mensagem: 'Brinco é obrigatório' });
    } else {
      if (brincosNaPlanilha.has(brinco.toLowerCase())) {
        errosLinha.push({ linha: numLinha, campo: 'brinco', mensagem: `Brinco "${brinco}" duplicado na planilha` });
      } else if (brincosBancoSet.has(brinco.toLowerCase())) {
        errosLinha.push({ linha: numLinha, campo: 'brinco', mensagem: `Brinco "${brinco}" já existe no banco de dados` });
      } else {
        brincosNaPlanilha.add(brinco.toLowerCase());
      }
    }

    // Sexo obrigatório
    const sexo = (linha.sexo || '').trim().toLowerCase();
    if (!sexo) {
      errosLinha.push({ linha: numLinha, campo: 'sexo', mensagem: 'Sexo é obrigatório' });
    } else if (!SEXOS_VALIDOS.includes(sexo)) {
      errosLinha.push({ linha: numLinha, campo: 'sexo', mensagem: `Sexo inválido: "${linha.sexo}"` });
    }

    // Status opcional mas deve ser válido
    const status = (linha.status || '').trim().toLowerCase();
    if (status && !STATUS_VALIDOS.includes(status)) {
      errosLinha.push({ linha: numLinha, campo: 'status', mensagem: `Status inválido: "${linha.status}"` });
    }

    // Raça opcional mas deve ser válida
    const raca = (linha.raca || '').trim();
    if (raca && !RACAS_VALIDAS.includes(raca)) {
      errosLinha.push({ linha: numLinha, campo: 'raca', mensagem: `Raça não cadastrada: "${raca}"` });
    }

    // Categoria opcional mas deve ser válida
    const categoria = (linha.categoria || '').trim();
    if (categoria && !CATEGORIAS_VALIDAS.includes(categoria)) {
      errosLinha.push({ linha: numLinha, campo: 'categoria', mensagem: `Categoria inválida: "${categoria}"` });
    }

    // Datas — aceita DD/MM/AAAA, DD/MM/AA e AAAA-MM-DD
    const camposDatas = ['dataNascimento', 'dataDesmama', 'dataEntrada', 'dataRnd'];
    for (const campo of camposDatas) {
      const rawVal = (linha[campo] || '').trim();
      if (rawVal) {
        const converted = parseDateBR(rawVal);
        if (!converted) {
          errosLinha.push({ linha: numLinha, campo, mensagem: `Data inválida em "${campo}": "${rawVal}". Use DD/MM/AAAA ou AAAA-MM-DD` });
        } else {
          const [y, mo, d] = converted.split('-').map(Number);
          const dt = new Date(y, mo - 1, d);
          if (dt.getFullYear() !== y || dt.getMonth() + 1 !== mo || dt.getDate() !== d) {
            errosLinha.push({ linha: numLinha, campo, mensagem: `Data inexistente em "${campo}": "${rawVal}"` });
          } else {
            linha[campo] = converted; // normaliza para YYYY-MM-DD
          }
        }
      }
    }

    // Lote opcional mas deve existir
    const loteNome = (linha.lote || '').trim();
    if (loteNome && !loteNomeParaId.has(loteNome.toLowerCase())) {
      errosLinha.push({ linha: numLinha, campo: 'lote', mensagem: `Lote não encontrado: "${loteNome}"` });
    }

    if (errosLinha.length > 0) {
      erros.push(...errosLinha);
    } else {
      validos.push(linha);
    }
  }

  return { validos, erros };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('Importação em Massa de Animais — Validação', () => {
  it('aceita linha com brinco e sexo válidos', () => {
    const { validos, erros } = validarLinhas([
      { brinco: 'BR-001', sexo: 'femea' },
    ]);
    expect(validos).toHaveLength(1);
    expect(erros).toHaveLength(0);
  });

  it('rejeita linha sem brinco', () => {
    const { validos, erros } = validarLinhas([
      { brinco: '', sexo: 'macho' },
    ]);
    expect(validos).toHaveLength(0);
    expect(erros[0].campo).toBe('brinco');
  });

  it('rejeita linha sem sexo', () => {
    const { validos, erros } = validarLinhas([
      { brinco: 'BR-002', sexo: '' },
    ]);
    expect(validos).toHaveLength(0);
    expect(erros[0].campo).toBe('sexo');
  });

  it('rejeita sexo inválido', () => {
    const { validos, erros } = validarLinhas([
      { brinco: 'BR-003', sexo: 'neutro' },
    ]);
    expect(validos).toHaveLength(0);
    expect(erros[0].mensagem).toContain('Sexo inválido');
  });

  it('rejeita brinco duplicado dentro da planilha', () => {
    const { erros } = validarLinhas([
      { brinco: 'BR-004', sexo: 'macho' },
      { brinco: 'BR-004', sexo: 'femea' },
    ]);
    expect(erros.some(e => e.mensagem.includes('duplicado na planilha'))).toBe(true);
  });

  it('rejeita brinco já existente no banco', () => {
    const banco = new Set(['br-005']);
    const { erros } = validarLinhas([{ brinco: 'BR-005', sexo: 'macho' }], banco);
    expect(erros.some(e => e.mensagem.includes('já existe no banco'))).toBe(true);
  });

  it('rejeita data de nascimento inválida (formato desconhecido)', () => {
    const { erros } = validarLinhas([
      { brinco: 'BR-006', sexo: 'femea', dataNascimento: '32-13-2022' },
    ]);
    expect(erros.some(e => e.campo === 'dataNascimento')).toBe(true);
  });

  // ─── Testes de formatos de data ───────────────────────────────────────────

  it('aceita data no formato YYYY-MM-DD (ISO)', () => {
    const { validos } = validarLinhas([
      { brinco: 'BR-007', sexo: 'macho', dataNascimento: '2025-02-01' },
    ]);
    expect(validos).toHaveLength(1);
    expect(validos[0].dataNascimento).toBe('2025-02-01');
  });

  it('aceita data no formato DD/MM/YYYY (brasileiro completo)', () => {
    const { validos, erros } = validarLinhas([
      { brinco: 'BR-D1', sexo: 'macho', dataNascimento: '01/02/2025' },
    ]);
    expect(erros).toHaveLength(0);
    expect(validos[0].dataNascimento).toBe('2025-02-01');
  });

  it('aceita data no formato DD/MM/YY (brasileiro reduzido)', () => {
    const { validos, erros } = validarLinhas([
      { brinco: 'BR-D2', sexo: 'macho', dataNascimento: '01/02/25' },
    ]);
    expect(erros).toHaveLength(0);
    expect(validos[0].dataNascimento).toBe('2025-02-01');
  });

  it('aceita data 15/12/2024 (DD/MM/YYYY)', () => {
    const { validos, erros } = validarLinhas([
      { brinco: 'BR-D3', sexo: 'femea', dataNascimento: '15/12/2024' },
    ]);
    expect(erros).toHaveLength(0);
    expect(validos[0].dataNascimento).toBe('2024-12-15');
  });

  it('aceita data 15/12/24 (DD/MM/YY)', () => {
    const { validos, erros } = validarLinhas([
      { brinco: 'BR-D4', sexo: 'femea', dataNascimento: '15/12/24' },
    ]);
    expect(erros).toHaveLength(0);
    expect(validos[0].dataNascimento).toBe('2024-12-15');
  });

  it('aceita data 12/1/25 (D/M/YY sem zero à esquerda)', () => {
    const { validos, erros } = validarLinhas([
      { brinco: 'BR-D5', sexo: 'macho', dataDesmama: '12/1/25' },
    ]);
    expect(erros).toHaveLength(0);
    expect(validos[0].dataDesmama).toBe('2025-01-12');
  });

  it('aceita data 1/2/25 (D/M/YY sem zeros)', () => {
    const { validos, erros } = validarLinhas([
      { brinco: 'BR-D6', sexo: 'femea', dataNascimento: '1/2/25' },
    ]);
    expect(erros).toHaveLength(0);
    expect(validos[0].dataNascimento).toBe('2025-02-01');
  });

  it('rejeita data inexistente 30/02/2025', () => {
    const { erros } = validarLinhas([
      { brinco: 'BR-D7', sexo: 'macho', dataNascimento: '30/02/2025' },
    ]);
    expect(erros.some(e => e.campo === 'dataNascimento' && e.mensagem.includes('inexistente'))).toBe(true);
  });

  it('rejeita data com dia/mês inválidos 32/13/2022', () => {
    const { erros } = validarLinhas([
      { brinco: 'BR-D8', sexo: 'femea', dataNascimento: '32/13/2022' },
    ]);
    expect(erros.some(e => e.campo === 'dataNascimento')).toBe(true);
  });

  it('converte todos os campos de data simultaneamente', () => {
    const { validos, erros } = validarLinhas([{
      brinco: 'BR-D9',
      sexo: 'macho',
      dataNascimento: '01/03/22',
      dataDesmama: '15/09/22',
      dataEntrada: '01/01/23',
      dataRnd: '10/06/23',
    }]);
    expect(erros).toHaveLength(0);
    expect(validos[0].dataNascimento).toBe('2022-03-01');
    expect(validos[0].dataDesmama).toBe('2022-09-15');
    expect(validos[0].dataEntrada).toBe('2023-01-01');
    expect(validos[0].dataRnd).toBe('2023-06-10');
  });

  // ─── Outros testes ────────────────────────────────────────────────────────

  it('rejeita raça não cadastrada', () => {
    const { erros } = validarLinhas([
      { brinco: 'BR-008', sexo: 'femea', raca: 'Unicórnio' },
    ]);
    expect(erros.some(e => e.campo === 'raca')).toBe(true);
  });

  it('aceita raça cadastrada', () => {
    const { validos } = validarLinhas([
      { brinco: 'BR-009', sexo: 'macho', raca: 'Nelore' },
    ]);
    expect(validos).toHaveLength(1);
  });

  it('rejeita status inválido', () => {
    const { erros } = validarLinhas([
      { brinco: 'BR-010', sexo: 'femea', status: 'perdido' },
    ]);
    expect(erros.some(e => e.campo === 'status')).toBe(true);
  });

  it('aceita status válido', () => {
    const { validos } = validarLinhas([
      { brinco: 'BR-011', sexo: 'macho', status: 'ativo' },
    ]);
    expect(validos).toHaveLength(1);
  });

  it('rejeita lote inexistente', () => {
    const lotes = new Map([['lote a', 1]]);
    const { erros } = validarLinhas([
      { brinco: 'BR-012', sexo: 'femea', lote: 'Lote Inexistente' },
    ], new Set(), lotes);
    expect(erros.some(e => e.campo === 'lote')).toBe(true);
  });

  it('aceita lote existente (case insensitive)', () => {
    const lotes = new Map([['lote a', 1]]);
    const { validos } = validarLinhas([
      { brinco: 'BR-013', sexo: 'macho', lote: 'Lote A' },
    ], new Set(), lotes);
    expect(validos).toHaveLength(1);
  });

  it('valida 100 animais: 95 válidos e 5 com erro de brinco duplicado', () => {
    const linhas: LinhaAnimal[] = [];
    for (let i = 1; i <= 100; i++) {
      const brinco = i <= 95 ? `BR-${String(i).padStart(3, '0')}` : `BR-${String(i - 5).padStart(3, '0')}`;
      linhas.push({ brinco, sexo: 'macho' });
    }
    const { validos, erros } = validarLinhas(linhas);
    expect(validos).toHaveLength(95);
    expect(erros.filter(e => e.campo === 'brinco')).toHaveLength(5);
  });

  it('rejeita categoria inválida', () => {
    const { erros } = validarLinhas([
      { brinco: 'BR-200', sexo: 'macho', categoria: 'Dragão' },
    ]);
    expect(erros.some(e => e.campo === 'categoria')).toBe(true);
  });
});

// ─── Testes unitários do parseDateBR ─────────────────────────────────────────

describe('parseDateBR — conversão de formatos de data', () => {
  it('converte 01/02/2025 → 2025-02-01', () => {
    expect(parseDateBR('01/02/2025')).toBe('2025-02-01');
  });
  it('converte 01/02/25 → 2025-02-01', () => {
    expect(parseDateBR('01/02/25')).toBe('2025-02-01');
  });
  it('converte 15/12/2024 → 2024-12-15', () => {
    expect(parseDateBR('15/12/2024')).toBe('2024-12-15');
  });
  it('converte 15/12/24 → 2024-12-15', () => {
    expect(parseDateBR('15/12/24')).toBe('2024-12-15');
  });
  it('mantém 2025-02-01 (já é ISO)', () => {
    expect(parseDateBR('2025-02-01')).toBe('2025-02-01');
  });
  it('converte 1/2/25 (sem zeros) → 2025-02-01', () => {
    expect(parseDateBR('1/2/25')).toBe('2025-02-01');
  });
  it('converte 12/1/25 → 2025-01-12', () => {
    expect(parseDateBR('12/1/25')).toBe('2025-01-12');
  });
  it('retorna null para formato inválido', () => {
    expect(parseDateBR('32-13-2022')).toBeNull();
    expect(parseDateBR('abc')).toBeNull();
    expect(parseDateBR('')).toBeNull();
  });
  it('ano 50 → 1950 (regra de corte)', () => {
    expect(parseDateBR('01/01/50')).toBe('1950-01-01');
  });
  it('ano 49 → 2049 (regra de corte)', () => {
    expect(parseDateBR('01/01/49')).toBe('2049-01-01');
  });
});


// ─── Testes do mapeamento de cabeçalhos PT-BR (shared/importacaoAnimais) ──────

import {
  normalizarLinha,
  normalizarSexo,
  normalizarStatus,
  normalizarBooleano,
  normalizarCabecalho,
  COLUNAS_IMPORTACAO,
  isLinhaExemplo,
} from '../shared/importacaoAnimais';

describe('normalizarCabecalho — limpeza de rótulos', () => {
  it('remove acentos e pontuação', () => {
    expect(normalizarCabecalho('Raça')).toBe('raca');
    expect(normalizarCabecalho('Observações')).toBe('observacoes');
    expect(normalizarCabecalho('Mãe (Matriz)')).toBe('mae');
  });
  it('remove conteúdo entre parênteses (unidades)', () => {
    expect(normalizarCabecalho('Peso de Entrada (kg)')).toBe('pesodeentrada');
    expect(normalizarCabecalho('Preço (R$/kg)')).toBe('preco');
  });
  it('é case-insensitive', () => {
    expect(normalizarCabecalho('BRINCO')).toBe(normalizarCabecalho('Brinco'));
  });
});

describe('normalizarLinha — mapeia cabeçalhos PT-BR para chaves internas', () => {
  it('mapeia a planilha oficial do usuário corretamente', () => {
    const linha = {
      'Fazenda': 'Fazenda Volta Grande',
      'Brinco': 'BR-001',
      'Brinco Eletrônico': '123',
      'Sexo': 'Fêmea',
      'Categoria': 'Vaca',
      'Lote': 'Engorda 1',
      'Raça': 'Nelore',
      'Subdivisão (Pasto)': 'Pasto A',
      'Data de Nascimento': '01/02/2025',
      'Data de Desmama': '12/01/25',
      'Castrado': 'Não',
      'Peso de Entrada (kg)': '320',
      'Preço (R$/kg)': '12,50',
      'Rastreado no nascimento': 'Sim',
      'Status': 'Ativo',
      'Observações': 'teste',
    };
    const out = normalizarLinha(linha);
    expect(out.fazendaNome).toBe('Fazenda Volta Grande');
    expect(out.brinco).toBe('BR-001');
    expect(out.brincoEletronico).toBe('123');
    expect(out.sexo).toBe('Fêmea');
    expect(out.categoria).toBe('Vaca');
    expect(out.lote).toBe('Engorda 1');
    expect(out.raca).toBe('Nelore');
    expect(out.subdivisao).toBe('Pasto A');
    expect(out.dataNascimento).toBe('01/02/2025');
    expect(out.dataDesmama).toBe('12/01/25');
    expect(out.castrado).toBe('Não');
    expect(out.pesoEntrada).toBe('320');
    expect(out.precoKg).toBe('12,50');
    expect(out.rastreadoNascimento).toBe('Sim');
    expect(out.status).toBe('Ativo');
    expect(out.observacoes).toBe('teste');
  });

  it('aceita cabeçalho "RFID" como alias de Brinco Eletrônico', () => {
    const out = normalizarLinha({ 'Brinco': 'X', 'RFID': '999' });
    expect(out.brincoEletronico).toBe('999');
  });

  it('aceita chaves internas em inglês/camelCase (compatibilidade retroativa)', () => {
    const out = normalizarLinha({ brinco: 'Y', dataNascimento: '01/01/2020', pesoEntrada: '100' });
    expect(out.brinco).toBe('Y');
    expect(out.dataNascimento).toBe('01/01/2020');
    expect(out.pesoEntrada).toBe('100');
  });

  it('ignora colunas desconhecidas', () => {
    const out = normalizarLinha({ 'Brinco': 'Z', 'Coluna Inventada': 'lixo' });
    expect(out.brinco).toBe('Z');
    expect(Object.keys(out)).not.toContain('Coluna Inventada');
  });

  it('faz trim dos valores', () => {
    const out = normalizarLinha({ 'Brinco': '  BR-9  ' });
    expect(out.brinco).toBe('BR-9');
  });
});

describe('normalizarSexo / normalizarStatus / normalizarBooleano', () => {
  it('normaliza Fêmea → femea e Macho → macho', () => {
    expect(normalizarSexo('Fêmea')).toBe('femea');
    expect(normalizarSexo('FÊMEA')).toBe('femea');
    expect(normalizarSexo('Macho')).toBe('macho');
    expect(normalizarSexo('femea')).toBe('femea');
  });
  it('normaliza Status PT-BR para minúsculas válidas', () => {
    expect(normalizarStatus('Ativo')).toBe('ativo');
    expect(normalizarStatus('Vendido')).toBe('vendido');
    expect(normalizarStatus('Morto')).toBe('morto');
    expect(normalizarStatus('Transferido')).toBe('transferido');
  });
  it('interpreta Sim/Não como booleano', () => {
    expect(normalizarBooleano('Sim')).toBe(true);
    expect(normalizarBooleano('SIM')).toBe(true);
    expect(normalizarBooleano('Não')).toBe(false);
    expect(normalizarBooleano('')).toBe(false);
    expect(normalizarBooleano('Não tem')).toBe(false);
  });
});

describe('COLUNAS_IMPORTACAO — estrutura da planilha oficial', () => {
  it('tem exatamente 27 colunas', () => {
    expect(COLUNAS_IMPORTACAO).toHaveLength(27);
  });
  it('Fazenda, Brinco, Sexo e Categoria são os únicos obrigatórios', () => {
    const obrigatorios = COLUNAS_IMPORTACAO.filter(c => c.obrigatorio).map(c => c.key);
    expect(obrigatorios).toEqual(['fazendaNome', 'brinco', 'sexo', 'categoria']);
  });
  it('a primeira coluna é Fazenda e a ordem segue a planilha oficial', () => {
    expect(COLUNAS_IMPORTACAO[0].key).toBe('fazendaNome');
    expect(COLUNAS_IMPORTACAO[1].key).toBe('brinco');
    expect(COLUNAS_IMPORTACAO[2].key).toBe('brincoEletronico');
    expect(COLUNAS_IMPORTACAO[3].key).toBe('sexo');
    expect(COLUNAS_IMPORTACAO[4].key).toBe('categoria');
    expect(COLUNAS_IMPORTACAO[5].key).toBe('lote');
    expect(COLUNAS_IMPORTACAO[9].key).toBe('subdivisao');
  });
});


describe('isLinhaExemplo — detecção estrutural da linha de demonstração', () => {
  it('identifica a linha de exemplo da planilha modelo (brinco BR-001)', () => {
    const exemplo = normalizarLinha({
      'Brinco': 'BR-001',
      'Nome': 'Mimosa',
      'Sexo': 'Fêmea',
      'Categoria': 'Vaca',
      'Raça': 'Nelore',
      'Lote': 'Engorda 1',
    });
    expect(isLinhaExemplo(exemplo)).toBe(true);
  });

  it('é case-insensitive no brinco-marcador', () => {
    expect(isLinhaExemplo(normalizarLinha({ 'Brinco': 'br-001' }))).toBe(true);
    expect(isLinhaExemplo(normalizarLinha({ 'Brinco': 'Br-001' }))).toBe(true);
  });

  it('NÃO marca um animal real como exemplo', () => {
    expect(isLinhaExemplo(normalizarLinha({ 'Brinco': '06', 'Sexo': 'Fêmea' }))).toBe(false);
    expect(isLinhaExemplo(normalizarLinha({ 'Brinco': 'BR-002', 'Sexo': 'Macho' }))).toBe(false);
    expect(isLinhaExemplo(normalizarLinha({ 'Brinco': '0001', 'Lote': 'Engorda 1' }))).toBe(false);
  });

  it('não considera exemplo quando o brinco está vazio', () => {
    expect(isLinhaExemplo(normalizarLinha({ 'Sexo': 'Macho' }))).toBe(false);
  });
});

describe('Fluxo de importação — linha de exemplo é ignorada (estrutural)', () => {
  // Simula o filtro aplicado tanto no parser frontend quanto no backend:
  // normaliza cada linha e descarta as marcadas como exemplo.
  const filtrarLinhasReais = (linhasBrutas: Array<Record<string, string>>) =>
    linhasBrutas
      .map(l => normalizarLinha(l))
      .filter(l => Object.values(l).some(v => v !== ''))
      .filter(l => !isLinhaExemplo(l));

  it('planilha com cabeçalho + exemplo + 2 animais válidos → processa apenas 2', () => {
    // (cabeçalho é consumido pelo parser; aqui recebemos as linhas de dados)
    const linhasBrutas: Array<Record<string, string>> = [
      // Linha de exemplo (deve ser ignorada)
      { 'Brinco': 'BR-001', 'Nome': 'Mimosa', 'Sexo': 'Fêmea', 'Lote': 'Engorda 1', 'Raça': 'Nelore' },
      // Animal válido 1
      { 'Brinco': '101', 'Sexo': 'Macho', 'Raça': 'Angus' },
      // Animal válido 2
      { 'Brinco': '102', 'Sexo': 'Fêmea', 'Raça': 'Nelore' },
    ];

    const reais = filtrarLinhasReais(linhasBrutas);

    expect(reais).toHaveLength(2);
    expect(reais.map(r => r.brinco)).toEqual(['101', '102']);
    // A linha de exemplo não aparece em nenhuma etapa
    expect(reais.some(r => r.brinco === 'BR-001')).toBe(false);
  });

  it('planilha sem linha de exemplo → processa todos os animais', () => {
    const linhasBrutas: Array<Record<string, string>> = [
      { 'Brinco': '201', 'Sexo': 'Macho' },
      { 'Brinco': '202', 'Sexo': 'Fêmea' },
      { 'Brinco': '203', 'Sexo': 'Macho' },
    ];
    const reais = filtrarLinhasReais(linhasBrutas);
    expect(reais).toHaveLength(3);
  });

  it('descarta também linhas completamente vazias junto com o exemplo', () => {
    const linhasBrutas: Array<Record<string, string>> = [
      { 'Brinco': 'BR-001', 'Nome': 'Mimosa', 'Sexo': 'Fêmea' },
      { 'Brinco': '', 'Sexo': '', 'Raça': '' },
      { 'Brinco': '301', 'Sexo': 'Macho' },
    ];
    const reais = filtrarLinhasReais(linhasBrutas);
    expect(reais).toHaveLength(1);
    expect(reais[0].brinco).toBe('301');
  });
});
