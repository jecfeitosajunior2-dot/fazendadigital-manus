/**
 * Testes para a lógica de validação de importação em massa de animais.
 * Valida: campos obrigatórios, brincos duplicados, datas inválidas, status/sexo inválidos.
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

function validarLinhas(
  linhas: LinhaAnimal[],
  brincosBancoSet: Set<string> = new Set(),
  loteNomeParaId: Map<string, number> = new Map()
): { validos: LinhaAnimal[]; erros: Erro[] } {
  const erros: Erro[] = [];
  const validos: LinhaAnimal[] = [];
  const brincosNaPlanilha = new Set<string>();

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
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

    // Datas
    const camposDatas = ['dataNascimento', 'dataDesmama', 'dataEntrada', 'dataRnd'];
    for (const campo of camposDatas) {
      const val = (linha[campo] || '').trim();
      if (val) {
        const d = new Date(val);
        if (isNaN(d.getTime())) {
          errosLinha.push({ linha: numLinha, campo, mensagem: `Data inválida em "${campo}": "${val}"` });
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

  it('rejeita data de nascimento inválida', () => {
    const { erros } = validarLinhas([
      { brinco: 'BR-006', sexo: 'femea', dataNascimento: '32/13/2022' },
    ]);
    expect(erros.some(e => e.campo === 'dataNascimento')).toBe(true);
  });

  it('aceita data de nascimento no formato YYYY-MM-DD', () => {
    const { validos } = validarLinhas([
      { brinco: 'BR-007', sexo: 'macho', dataNascimento: '2022-05-10' },
    ]);
    expect(validos).toHaveLength(1);
  });

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
      // Animais 96-100 têm brinco duplicado do 91-95
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
