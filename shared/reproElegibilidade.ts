import { CATEGORIAS_POR_SEXO } from "./animal-types";
import { calcularIdadeMeses } from "./lote-faixas-idade";
import {
  getReproTipoOptionsManejoPontual,
  REPRO_TIPOS_MACHO,
} from "./reproRegistroMeta";

/** Mensagem padrão para bloqueio de manejo reprodutivo incompatível. */
export const MSG_REPRO_INELEGIVEL =
  "Este manejo reprodutivo não é compatível com a idade ou categoria do animal.";

/**
 * Idade mínima (meses) para eventos reprodutivos de matriz em fêmeas.
 * Regra inicial centralizada — ajustável sem espalhar números no código.
 */
export const IDADE_MINIMA_MESES_REPRO_FEMEA_ADULTA = 12;

/**
 * Idade mínima (meses) para manejo reprodutivo adulto em machos.
 * Não havia regra prévia no projeto — espelha a abordagem configurável da fêmea.
 */
export const IDADE_MINIMA_MESES_REPRO_MACHO_ADULTO = 12;

export const CATEGORIA_FEMEA_BEZERRA = "Bezerra" as const;

export const CATEGORIAS_FEMEA_REPRO_ADULTA = ["Novilha", "Vaca"] as const;

export const CATEGORIA_MACHO_BEZERRO = "Bezerro" as const;

export const CATEGORIAS_MACHO_REPRO_ADULTA = ["Boi"] as const;

/** Eventos que pressupõem fêmea reprodutivamente madura. */
export const REPRO_TIPOS_EXIGEM_FEMEA_MADURA = [
  "Cio",
  "Cobertura",
  "Inseminação",
  "Diagnóstico de prenhez",
  "Parto",
  "Aborto",
] as const;

/** Eventos masculinos que exigem maturidade reprodutiva (inclui Outro — sem bypass). */
export const REPRO_TIPOS_EXIGEM_MACHO_MADURA = REPRO_TIPOS_MACHO;

const CATEGORIAS_FEMEA_JUVENIL = new Set<string>(
  CATEGORIAS_POR_SEXO["Fêmea"].filter(c => c === CATEGORIA_FEMEA_BEZERRA),
);

const CATEGORIAS_MACHO_JUVENIL = new Set<string>(
  CATEGORIAS_POR_SEXO.Macho.filter(c => c === CATEGORIA_MACHO_BEZERRO),
);

const CATEGORIAS_FEMEA_ADULTA_SET = new Set<string>(CATEGORIAS_FEMEA_REPRO_ADULTA);

const CATEGORIAS_MACHO_ADULTA_SET = new Set<string>(CATEGORIAS_MACHO_REPRO_ADULTA);

const TIPOS_EXIGEM_FEMEA_MADURA_SET = new Set<string>(REPRO_TIPOS_EXIGEM_FEMEA_MADURA);

const TIPOS_EXIGEM_MACHO_MADURA_SET = new Set<string>(REPRO_TIPOS_EXIGEM_MACHO_MADURA);

/** Tipos em que a fêmea é o animal alvo (macho não pode receber). */
const TIPOS_SOMENTE_FEMEA_ALVO = new Set<string>([
  "Cio",
  "Cobertura",
  "Inseminação",
  "Diagnóstico de prenhez",
  "Parto",
  "Aborto",
  "Desmama",
]);

const TIPOS_SOMENTE_MACHO_ALVO = new Set<string>(REPRO_TIPOS_MACHO);

export type ReproAnimalElegibilidadeInput = {
  sexo?: string | null;
  categoria?: string | null;
  idadeMeses?: number | null;
};

export function buildReproAnimalElegibilidadeInput(animal: {
  sexo?: string | null;
  categoria?: string | null;
  dataNascimento?: string | Date | null;
  idadeMeses?: number | null;
}): ReproAnimalElegibilidadeInput {
  const idadeMeses =
    animal.idadeMeses != null && Number.isFinite(Number(animal.idadeMeses))
      ? Number(animal.idadeMeses)
      : calcularIdadeMeses(animal.dataNascimento);
  return {
    sexo: animal.sexo ?? null,
    categoria: animal.categoria ?? null,
    idadeMeses,
  };
}

/**
 * Avalia idade mínima reprodutiva.
 * - true: idade conhecida e atende ao mínimo
 * - false: idade conhecida e abaixo do mínimo
 * - null: idade desconhecida
 */
function idadeAtendeMinimoRepro(
  idadeMeses: number | null | undefined,
  minMeses: number,
): boolean | null {
  if (idadeMeses == null || !Number.isFinite(Number(idadeMeses))) return null;
  return Number(idadeMeses) >= minMeses;
}

/**
 * Maturidade reprodutiva: idade real é o critério objetivo prioritário.
 * Categoria manual só entra como fallback quando a idade não está disponível.
 */
function isMaduroPorIdadeComFallbackCategoria(
  animal: ReproAnimalElegibilidadeInput,
  minMeses: number,
  juvenilSet: Set<string>,
  adultaSet: Set<string>,
): boolean {
  const idadeCheck = idadeAtendeMinimoRepro(animal.idadeMeses, minMeses);

  if (idadeCheck === false) return false;
  if (idadeCheck === true) return true;

  const categoria = (animal.categoria ?? "").trim();
  if (!categoria) return false;
  if (juvenilSet.has(categoria)) return false;
  if (adultaSet.has(categoria)) return true;
  return false;
}

/** Categoria juvenil persistida, mas idade já atinge o mínimo reprodutivo. */
export function hasCategoriaIdadeMismatchRepro(animal: ReproAnimalElegibilidadeInput): boolean {
  const idadeCheck = idadeAtendeMinimoRepro(
    animal.idadeMeses,
    IDADE_MINIMA_MESES_REPRO_FEMEA_ADULTA,
  );
  if (idadeCheck !== true) return false;

  const categoria = (animal.categoria ?? "").trim();
  if (!categoria) return false;

  if (animal.sexo === "macho" && CATEGORIAS_MACHO_JUVENIL.has(categoria)) return true;
  if (animal.sexo === "femea" && CATEGORIAS_FEMEA_JUVENIL.has(categoria)) return true;
  return false;
}

/** Fêmea elegível para manejo reprodutivo adulto (idade prioritária; categoria como fallback). */
export function isFemeaReprodutivamenteMadura(animal: ReproAnimalElegibilidadeInput): boolean {
  if (animal.sexo !== "femea") return false;
  return isMaduroPorIdadeComFallbackCategoria(
    animal,
    IDADE_MINIMA_MESES_REPRO_FEMEA_ADULTA,
    CATEGORIAS_FEMEA_JUVENIL,
    CATEGORIAS_FEMEA_ADULTA_SET,
  );
}

/** Macho elegível para manejo reprodutivo adulto (idade prioritária; categoria como fallback). */
export function isMachoReprodutivamenteMaduro(animal: ReproAnimalElegibilidadeInput): boolean {
  if (animal.sexo !== "macho") return false;
  return isMaduroPorIdadeComFallbackCategoria(
    animal,
    IDADE_MINIMA_MESES_REPRO_MACHO_ADULTO,
    CATEGORIAS_MACHO_JUVENIL,
    CATEGORIAS_MACHO_ADULTA_SET,
  );
}

export function isReproTipoPermitidoParaAnimal(
  animal: ReproAnimalElegibilidadeInput,
  tipo: string,
): boolean {
  const tipoKey = tipo.trim();
  if (!tipoKey) return true;

  if (animal.sexo === "macho") {
    if (TIPOS_SOMENTE_FEMEA_ALVO.has(tipoKey)) return false;
    if (TIPOS_EXIGEM_MACHO_MADURA_SET.has(tipoKey)) {
      return isMachoReprodutivamenteMaduro(animal);
    }
    return true;
  }

  if (animal.sexo === "femea") {
    if (TIPOS_SOMENTE_MACHO_ALVO.has(tipoKey)) return false;
    if (TIPOS_EXIGEM_FEMEA_MADURA_SET.has(tipoKey)) {
      return isFemeaReprodutivamenteMadura(animal);
    }
    return true;
  }

  if (TIPOS_EXIGEM_FEMEA_MADURA_SET.has(tipoKey)) {
    return isFemeaReprodutivamenteMadura(animal);
  }

  return true;
}

/** Tipos de manejo reprodutivo disponíveis para o animal (pós-filtro de elegibilidade). */
export function getReproTipoOptionsElegiveis(
  animal: ReproAnimalElegibilidadeInput,
): readonly string[] {
  return getReproTipoOptionsManejoPontual(animal.sexo).filter(tipo =>
    isReproTipoPermitidoParaAnimal(animal, tipo),
  );
}
