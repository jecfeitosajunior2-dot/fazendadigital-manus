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
const CATEGORIAS_VALIDAS = [
  'Touro', 'Boi', 'Bezerro', 'Garrote',
  'Vaca', 'Novilha', 'Bezerra', 'Vaca Prenhe',
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
