import { describe, it, expect } from 'vitest';
import {
  animaisFiltersToApiParams,
  clearAnimaisListFilters,
  hasActiveAnimaisFilters,
  hasActiveMaisFiltrosAvancados,
  INITIAL_ANIMAIS_LIST_FILTERS,
  type AnimaisListFiltersState,
} from '../shared/animal-filter-types';

function makeFilters(overrides: Partial<AnimaisListFiltersState> = {}): AnimaisListFiltersState {
  return { ...INITIAL_ANIMAIS_LIST_FILTERS, ...overrides };
}

type EnrichedAnimal = {
  id: number;
  fazendaId: number;
  sexo: string;
  categoria: string;
  raca: string;
  loteId: number | null;
  status: string;
  brincoEletronico: string;
  dataEntrada: string | null;
  dataNascimento: string | null;
  emCarencia: boolean;
  ultimoPeso: number | null;
  idadeMeses: number | null;
};

/** Espelha pós-filtros de animais.list (server/routers.ts) para testes unitários. */
function applyAnimaisPostFilters(
  animais: EnrichedAnimal[],
  input: ReturnType<typeof animaisFiltersToApiParams>,
) {
  let filtered = [...animais];

  if (input.apenasEmCarencia) {
    filtered = filtered.filter(a => a.emCarencia === true);
  }
  if (input.apenasSemLote) {
    filtered = filtered.filter(a => !a.loteId);
  }
  if (input.apenasSemPesagem) {
    filtered = filtered.filter(a => a.ultimoPeso === null);
  }
  if (input.pesoMin !== undefined || input.pesoMax !== undefined) {
    filtered = filtered.filter(a => {
      const peso = a.ultimoPeso;
      if (peso === null || peso === undefined) return false;
      if (input.pesoMin !== undefined && peso < input.pesoMin) return false;
      if (input.pesoMax !== undefined && peso > input.pesoMax) return false;
      return true;
    });
  }
  if (input.idadeMesesMin !== undefined || input.idadeMesesMax !== undefined) {
    filtered = filtered.filter(a => {
      if (a.idadeMeses === null || a.idadeMeses === undefined) return false;
      if (input.idadeMesesMin !== undefined && a.idadeMeses < input.idadeMesesMin) return false;
      if (input.idadeMesesMax !== undefined && a.idadeMeses > input.idadeMesesMax) return false;
      return true;
    });
  }

  return filtered;
}

/** Espelha filtros SQL/local aplicados antes do enriquecimento. */
function applyAnimaisPreFilters(animais: EnrichedAnimal[], input: ReturnType<typeof animaisFiltersToApiParams>) {
  let lista = [...animais];

  if (input.fazendaId) lista = lista.filter(a => a.fazendaId === input.fazendaId);
  if (input.sexo) lista = lista.filter(a => a.sexo === input.sexo);
  if (input.categoria) lista = lista.filter(a => a.categoria === input.categoria);
  if (input.loteId) lista = lista.filter(a => a.loteId === input.loteId);
  if (input.raca) lista = lista.filter(a => a.raca === input.raca);
  if (input.status && input.status !== 'todos') {
    if (input.status === 'inativo') {
      lista = lista.filter(a => a.status !== 'ativo');
    } else {
      lista = lista.filter(a => a.status === input.status);
    }
  }
  if (input.brincoEletronico?.trim()) {
    const q = input.brincoEletronico.trim().toLowerCase();
    lista = lista.filter(a => (a.brincoEletronico ?? '').toLowerCase().includes(q));
  }
  if (input.dataEntradaDe) {
    lista = lista.filter(a => a.dataEntrada && a.dataEntrada >= input.dataEntradaDe!);
  }
  if (input.dataEntradaAte) {
    lista = lista.filter(a => a.dataEntrada && a.dataEntrada <= input.dataEntradaAte!);
  }

  return applyAnimaisPostFilters(lista, input);
}

const SAMPLE: EnrichedAnimal[] = [
  {
    id: 1,
    fazendaId: 1,
    sexo: 'macho',
    categoria: 'Bezerro',
    raca: 'Nelore Mocho',
    loteId: 10,
    status: 'ativo',
    brincoEletronico: 'RFID-001',
    dataEntrada: '2024-01-15',
    dataNascimento: '2023-06-01',
    emCarencia: false,
    ultimoPeso: 180,
    idadeMeses: 8,
  },
  {
    id: 2,
    fazendaId: 1,
    sexo: 'macho',
    categoria: 'Bezerro',
    raca: 'Angus',
    loteId: null,
    status: 'ativo',
    brincoEletronico: 'RFID-002',
    dataEntrada: '2024-03-01',
    dataNascimento: '2023-01-01',
    emCarencia: true,
    ultimoPeso: null,
    idadeMeses: 12,
  },
  {
    id: 3,
    fazendaId: 2,
    sexo: 'femea',
    categoria: 'Novilha',
    raca: 'Nelore Mocho',
    loteId: 20,
    status: 'inativo',
    brincoEletronico: 'RFID-999',
    dataEntrada: '2023-12-01',
    dataNascimento: '2022-01-01',
    emCarencia: false,
    ultimoPeso: 320,
    idadeMeses: 24,
  },
  {
    id: 4,
    fazendaId: 1,
    sexo: 'macho',
    categoria: 'Bezerro',
    raca: 'Nelore Mocho',
    loteId: null,
    status: 'ativo',
    brincoEletronico: 'RFID-003',
    dataEntrada: '2024-06-01',
    dataNascimento: '2024-01-01',
    emCarencia: false,
    ultimoPeso: 150,
    idadeMeses: 5,
  },
];

describe('Mais Filtros — mapeamento para API', () => {
  it('mapeia switches Em Carência, Sem Pesagem e Sem Lote', () => {
    const params = animaisFiltersToApiParams(
      makeFilters({ apenasEmCarencia: true, apenasSemPesagem: true, apenasSemLote: true }),
      '',
    );
    expect(params.apenasEmCarencia).toBe(true);
    expect(params.apenasSemPesagem).toBe(true);
    expect(params.apenasSemLote).toBe(true);
  });

  it('não envia switches quando desligados', () => {
    const params = animaisFiltersToApiParams(makeFilters(), '');
    expect(params.apenasEmCarencia).toBeUndefined();
    expect(params.apenasSemPesagem).toBeUndefined();
    expect(params.apenasSemLote).toBeUndefined();
  });

  it('mapeia Raça, Status, RFID e Data de Entrada', () => {
    const params = animaisFiltersToApiParams(
      makeFilters({
        raca: 'Nelore Mocho',
        statusFiltro: 'ativo',
        rfid: 'RFID-00',
        dataEntradaDe: '2024-01-01',
        dataEntradaAte: '2024-12-31',
      }),
      '',
    );
    expect(params.raca).toBe('Nelore Mocho');
    expect(params.status).toBe('ativo');
    expect(params.brincoEletronico).toBe('RFID-00');
    expect(params.dataEntradaDe).toBe('2024-01-01');
    expect(params.dataEntradaAte).toBe('2024-12-31');
  });

  it('mapeia combinação com filtros principais', () => {
    const params = animaisFiltersToApiParams(
      makeFilters({
        fazendaId: '1',
        sexo: 'macho',
        categoria: 'Bezerro',
        apenasSemPesagem: true,
      }),
      '',
    );
    expect(params.fazendaId).toBe(1);
    expect(params.sexo).toBe('macho');
    expect(params.categoria).toBe('Bezerro');
    expect(params.apenasSemPesagem).toBe(true);
  });
});

describe('Mais Filtros — indicadores e limpar', () => {
  it('hasActiveMaisFiltrosAvancados detecta cada filtro avançado', () => {
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ apenasSemPesagem: true }))).toBe(true);
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ apenasSemLote: true }))).toBe(true);
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ apenasEmCarencia: true }))).toBe(true);
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ raca: 'Nelore Mocho' }))).toBe(true);
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ pesoInicial: '100' }))).toBe(true);
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ idadeMesesMax: '12' }))).toBe(true);
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ rfid: 'X' }))).toBe(true);
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ statusFiltro: 'ativo' }))).toBe(false);
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ statusFiltro: 'morto' }))).toBe(true);
    expect(hasActiveMaisFiltrosAvancados(makeFilters({ dataEntradaDe: '2024-01-01' }))).toBe(true);
    expect(hasActiveMaisFiltrosAvancados(makeFilters())).toBe(false);
  });

  it('clearAnimaisListFilters limpa principais e avançados, mantendo fazenda e painel aberto', () => {
    const dirty = makeFilters({
      maisFiltrosAbertos: true,
      fazendaId: '1',
      pesquisa: '123',
      sexo: 'macho',
      categoria: 'Bezerro',
      loteId: '5',
      apenasSemPesagem: true,
      raca: 'Nelore Mocho',
      pesoInicial: '100',
      pesoFinal: '200',
      idadeMesesMin: '6',
      idadeMesesMax: '24',
      rfid: 'RFID',
      statusFiltro: 'ativo',
      dataEntradaDe: '2024-01-01',
      dataEntradaAte: '2024-12-31',
    });

    const cleared = clearAnimaisListFilters(dirty);

    expect(cleared.maisFiltrosAbertos).toBe(true);
    expect(cleared.fazendaId).toBe('1');
    expect(cleared.pesquisa).toBe('');
    expect(cleared.sexo).toBe('');
    expect(cleared.categoria).toBe('');
    expect(cleared.loteId).toBe('');
    expect(cleared.apenasSemPesagem).toBe(false);
    expect(cleared.apenasSemLote).toBe(false);
    expect(cleared.apenasEmCarencia).toBe(false);
    expect(cleared.raca).toBe('');
    expect(cleared.pesoInicial).toBe('');
    expect(cleared.pesoFinal).toBe('');
    expect(cleared.idadeMesesMin).toBe('');
    expect(cleared.idadeMesesMax).toBe('');
    expect(cleared.rfid).toBe('');
    expect(cleared.statusFiltro).toBe('ativo');
    expect(cleared.dataEntradaDe).toBe('');
    expect(cleared.dataEntradaAte).toBe('');
    expect(hasActiveAnimaisFilters(cleared)).toBe(false);
    expect(hasActiveMaisFiltrosAvancados(cleared)).toBe(false);
  });

  it('persistência ao fechar/abrir painel — filtros permanecem no estado', () => {
    const withFilters = makeFilters({ maisFiltrosAbertos: true, apenasSemLote: true, raca: 'Angus' });
    const closed = { ...withFilters, maisFiltrosAbertos: false };
    const reopened = { ...closed, maisFiltrosAbertos: true };

    expect(reopened.apenasSemLote).toBe(true);
    expect(reopened.raca).toBe('Angus');
    expect(hasActiveMaisFiltrosAvancados(reopened)).toBe(true);
  });
});

describe('Mais Filtros — lógica de filtragem', () => {
  it('Sem Pesagem — apenas animais sem ultimoPeso', () => {
    const params = animaisFiltersToApiParams(makeFilters({ apenasSemPesagem: true }), '');
    const ids = applyAnimaisPostFilters(SAMPLE, params).map(a => a.id);
    expect(ids).toEqual([2]);
  });

  it('Sem Lote — apenas animais sem loteId', () => {
    const params = animaisFiltersToApiParams(makeFilters({ apenasSemLote: true }), '');
    const ids = applyAnimaisPostFilters(SAMPLE, params).map(a => a.id);
    expect(ids).toEqual([2, 4]);
  });

  it('Em Carência — apenas animais em carência', () => {
    const params = animaisFiltersToApiParams(makeFilters({ apenasEmCarencia: true }), '');
    const ids = applyAnimaisPostFilters(SAMPLE, params).map(a => a.id);
    expect(ids).toEqual([2]);
  });

  it('combina Sem Pesagem + Sem Lote + Em Carência', () => {
    const params = animaisFiltersToApiParams(
      makeFilters({ apenasSemPesagem: true, apenasSemLote: true, apenasEmCarencia: true }),
      '',
    );
    const ids = applyAnimaisPostFilters(SAMPLE, params).map(a => a.id);
    expect(ids).toEqual([2]);
  });

  it('Raça — filtra por raça exata', () => {
    const params = animaisFiltersToApiParams(
      makeFilters({ raca: 'Nelore Mocho', statusFiltro: 'todos' }),
      '',
    );
    const ids = applyAnimaisPreFilters(SAMPLE, params).map(a => a.id);
    expect(ids).toEqual([1, 3, 4]);
  });

  it('Peso — mínimo, máximo e faixa', () => {
    const minOnly = animaisFiltersToApiParams(makeFilters({ pesoInicial: '160' }), '');
    expect(applyAnimaisPostFilters(SAMPLE, minOnly).map(a => a.id)).toEqual([1, 3]);

    const maxOnly = animaisFiltersToApiParams(makeFilters({ pesoFinal: '160' }), '');
    expect(applyAnimaisPostFilters(SAMPLE, maxOnly).map(a => a.id)).toEqual([4]);

    const range = animaisFiltersToApiParams(makeFilters({ pesoInicial: '150', pesoFinal: '200' }), '');
    expect(applyAnimaisPostFilters(SAMPLE, range).map(a => a.id)).toEqual([1, 4]);
  });

  it('Idade — mínimo, máximo e faixa', () => {
    const minOnly = animaisFiltersToApiParams(makeFilters({ idadeMesesMin: '12' }), '');
    expect(applyAnimaisPostFilters(SAMPLE, minOnly).map(a => a.id)).toEqual([2, 3]);

    const maxOnly = animaisFiltersToApiParams(makeFilters({ idadeMesesMax: '8' }), '');
    expect(applyAnimaisPostFilters(SAMPLE, maxOnly).map(a => a.id)).toEqual([1, 4]);

    const range = animaisFiltersToApiParams(makeFilters({ idadeMesesMin: '6', idadeMesesMax: '12' }), '');
    expect(applyAnimaisPostFilters(SAMPLE, range).map(a => a.id)).toEqual([1, 2]);
  });

  it('RFID — busca parcial (LIKE)', () => {
    const params = animaisFiltersToApiParams(makeFilters({ rfid: 'RFID-00' }), '');
    const ids = applyAnimaisPreFilters(SAMPLE, params).map(a => a.id);
    expect(ids).toEqual([1, 2, 4]);
  });

  it('Status — ativo e inativo', () => {
    const ativo = animaisFiltersToApiParams(makeFilters({ statusFiltro: 'ativo' }), '');
    expect(applyAnimaisPreFilters(SAMPLE, ativo).map(a => a.id)).toEqual([1, 2, 4]);

    const inativo = animaisFiltersToApiParams(makeFilters({ statusFiltro: 'inativo' }), '');
    expect(applyAnimaisPreFilters(SAMPLE, inativo).map(a => a.id)).toEqual([3]);
  });

  it('Data de Entrada — inicial, final e intervalo', () => {
    const de = animaisFiltersToApiParams(
      makeFilters({ dataEntradaDe: '2024-03-01', statusFiltro: 'todos' }),
      '',
    );
    expect(applyAnimaisPreFilters(SAMPLE, de).map(a => a.id)).toEqual([2, 4]);

    const ate = animaisFiltersToApiParams(
      makeFilters({ dataEntradaAte: '2024-01-31', statusFiltro: 'todos' }),
      '',
    );
    expect(applyAnimaisPreFilters(SAMPLE, ate).map(a => a.id)).toEqual([1, 3]);

    const intervalo = animaisFiltersToApiParams(
      makeFilters({
        dataEntradaDe: '2024-01-01',
        dataEntradaAte: '2024-03-31',
        statusFiltro: 'todos',
      }),
      '',
    );
    expect(applyAnimaisPreFilters(SAMPLE, intervalo).map(a => a.id)).toEqual([1, 2]);
  });

  it('combinação principal + avançado (Fazenda J + Macho + Bezerro + Sem Pesagem)', () => {
    const params = animaisFiltersToApiParams(
      makeFilters({
        fazendaId: '1',
        sexo: 'macho',
        categoria: 'Bezerro',
        apenasSemPesagem: true,
      }),
      '',
    );
    const ids = applyAnimaisPreFilters(SAMPLE, params).map(a => a.id);
    expect(ids).toEqual([2]);
  });
});
