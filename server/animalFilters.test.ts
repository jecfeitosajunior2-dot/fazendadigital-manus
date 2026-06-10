import { describe, it, expect } from 'vitest';
import {
  animaisFiltersToApiParams,
  INITIAL_ANIMAIS_LIST_FILTERS,
  FILTROS_ADICIONAIS_OPCOES,
  type AnimaisListFiltersState,
} from '../shared/animal-filter-types';

function makeFilters(overrides: Partial<AnimaisListFiltersState> = {}): AnimaisListFiltersState {
  return { ...INITIAL_ANIMAIS_LIST_FILTERS, ...overrides };
}

describe('animaisFiltersToApiParams', () => {
  it('mapeia RFID para brincoEletronico', () => {
    const params = animaisFiltersToApiParams(makeFilters({ rfid: '123ABC' }), '');
    expect(params.brincoEletronico).toBe('123ABC');
  });

  it('mapeia apenasInativos para status="inativo"', () => {
    const params = animaisFiltersToApiParams(makeFilters({ apenasInativos: true }), '');
    expect(params.status).toBe('inativo');
  });

  it('não envia status quando apenasInativos é false', () => {
    const params = animaisFiltersToApiParams(makeFilters({ apenasInativos: false }), '');
    expect(params.status).toBeUndefined();
  });

  it('mapeia animalComSisbov para somenteSisbov=true', () => {
    const params = animaisFiltersToApiParams(makeFilters({ animalComSisbov: true }), '');
    expect(params.somenteSisbov).toBe(true);
  });

  it('mapeia somenteSisbov tradicional também para somenteSisbov=true', () => {
    const params = animaisFiltersToApiParams(makeFilters({ somenteSisbov: true }), '');
    expect(params.somenteSisbov).toBe(true);
  });

  it('mapeia idade em meses min/max', () => {
    const params = animaisFiltersToApiParams(makeFilters({ idadeMesesMin: '6', idadeMesesMax: '24' }), '');
    expect(params.idadeMesesMin).toBe(6);
    expect(params.idadeMesesMax).toBe(24);
  });

  it('mapeia RGN e RGD', () => {
    const params = animaisFiltersToApiParams(makeFilters({ rgn: 'RGN-1', rgd: 'RGD-2' }), '');
    expect(params.rgn).toBe('RGN-1');
    expect(params.rgd).toBe('RGD-2');
  });

  it('mapeia peso inicial/final aceitando vírgula decimal', () => {
    const params = animaisFiltersToApiParams(makeFilters({ pesoInicial: '10,5', pesoFinal: '20' }), '');
    expect(params.pesoMin).toBe(10.5);
    expect(params.pesoMax).toBe(20);
  });

  it('usa debouncedPesquisa para o campo search', () => {
    const params = animaisFiltersToApiParams(makeFilters(), '  boi  ');
    expect(params.search).toBe('boi');
  });

  it('retorna undefined para campos vazios', () => {
    const params = animaisFiltersToApiParams(makeFilters(), '');
    expect(params.brincoEletronico).toBeUndefined();
    expect(params.status).toBeUndefined();
    expect(params.somenteSisbov).toBeUndefined();
    expect(params.rgn).toBeUndefined();
    expect(params.rgd).toBeUndefined();
  });
});

describe('FILTROS_ADICIONAIS_OPCOES', () => {
  it('contém exatamente os 12 filtros na sequência especificada', () => {
    const keys = FILTROS_ADICIONAIS_OPCOES.map(o => o.key);
    expect(keys).toEqual([
      'dataNascimento',
      'peso',
      'rfid',
      'subdivisao',
      'raca',
      'categoria',
      'inativos',
      'marcadores',
      'idadeMeses',
      'rgn',
      'rgd',
      'animalComSisbov',
    ]);
  });
});
