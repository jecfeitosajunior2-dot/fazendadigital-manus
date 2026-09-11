import { describe, expect, it } from "vitest";
import { filtrarMachosElegiveisCastracao } from "../shared/castracaoManejo";
import {
  buildReproAnimalElegibilidadeInput,
  getReproTipoOptionsElegiveis,
  isMachoBloqueadoReproPorCastracao,
  MSG_REPRO_MACHO_CASTRADO,
} from "../shared/reproElegibilidade";
import {
  filterMachosReprodutoresCandidatos,
  isMachoReprodutorCandidato,
} from "../shared/reproMachoSelect";

/** Cenário operacional: macho ativo antes da castração → bloqueado depois. */
describe("integração castração × reprodutivo", () => {
  const machoAntes = {
    id: 77,
    brinco: "77",
    sexo: "macho" as const,
    status: "ativo" as const,
    categoria: "Boi",
    idadeMeses: 24,
    fazendaId: 1,
    castrado: false as boolean | null,
  };

  const machoDepois = { ...machoAntes, castrado: true };

  it("antes da castração: elegível para castrar e para repro", () => {
    expect(filtrarMachosElegiveisCastracao([machoAntes]).map(a => a.id)).toEqual([77]);
    expect(isMachoReprodutorCandidato(machoAntes, { fazendaId: 1 })).toBe(true);
    expect(getReproTipoOptionsElegiveis(buildReproAnimalElegibilidadeInput(machoAntes)).length).toBeGreaterThan(0);
  });

  it("depois da castração: some da castração e do reprodutivo", () => {
    expect(filtrarMachosElegiveisCastracao([machoDepois]).map(a => a.id)).toEqual([]);
    expect(isMachoReprodutorCandidato(machoDepois, { fazendaId: 1 })).toBe(false);
    expect(filterMachosReprodutoresCandidatos([machoDepois], { fazendaId: 1 })).toHaveLength(0);
    expect(isMachoBloqueadoReproPorCastracao(buildReproAnimalElegibilidadeInput(machoDepois))).toBe(true);
    expect(getReproTipoOptionsElegiveis(buildReproAnimalElegibilidadeInput(machoDepois))).toEqual([]);
  });

  it("mensagem de bloqueio reprodutivo é específica para castrado", () => {
    const eleg = buildReproAnimalElegibilidadeInput(machoDepois);
    expect(isMachoBloqueadoReproPorCastracao(eleg)).toBe(true);
    expect(MSG_REPRO_MACHO_CASTRADO).toContain("castrado");
  });
});
