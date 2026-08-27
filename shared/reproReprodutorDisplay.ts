import {
  buildSemenReprodutorKey,
  normalizeSemenPartida,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  SEMEN_PARTIDA_SEM_LOTE,
  type SemenOrigemReprodutor,
} from "./semenEstoque";

export const SEMEN_REPRODUTOR_NAO_INFORMADO_KEY = "e:nao-informado";
export const SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL = "Não informado";

export type ReproReprodutorAnimalFonte = {
  brinco?: string | null;
  nome?: string | null;
};

export type ReproReprodutorCadastroFonte = {
  reprodutorTexto?: string | null;
  reprodutorKey?: string | null;
};

export type ResolveReproReprodutorInput = {
  machoId?: number | null;
  reprodutorSemen?: string | null;
  partidaSemen?: string | null;
  macho?: ReproReprodutorAnimalFonte | null;
  cadastro?: ReproReprodutorCadastroFonte | null;
};

export type ResolveReproReprodutorResult = {
  origem: SemenOrigemReprodutor;
  reprodutorKey: string;
  reprodutorDisplay: string;
  machoId: number | null;
  conhecido: boolean;
};

export function formatReprodutorAnimalLabel(
  animal: ReproReprodutorAnimalFonte | null | undefined,
): string {
  const brinco = String(animal?.brinco ?? "").trim();
  if (brinco) return brinco;
  const nome = String(animal?.nome ?? "").trim();
  if (nome) return nome;
  return "—";
}

/** IA antiga às vezes gravou o lote (P-10FAZ) no campo do reprodutor. */
export function reprodutorTextoEhPartida(reprodutor: string, partida: string): boolean {
  const partidaNorm = normalizeSemenPartida(partida);
  if (partidaNorm === SEMEN_PARTIDA_SEM_LOTE) return false;
  return normalizeSemenPartida(reprodutor) === partidaNorm;
}

export function textoReprodutorValido(texto: string, partida: string): boolean {
  const t = texto.trim();
  if (!t || t === "—" || t === SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL) return false;
  return !reprodutorTextoEhPartida(t, partida);
}

/**
 * Identificação segura do reprodutor para IA.
 * Nunca usa partida/lote como fallback do campo Reprodutor.
 */
export function resolveReproReprodutorDisplay(
  input: ResolveReproReprodutorInput,
): ResolveReproReprodutorResult {
  const machoId = Number(input.machoId);
  const temMacho = Number.isInteger(machoId) && machoId > 0;
  const partidaSnap = normalizeSemenPartida(input.partidaSemen ?? "");

  if (temMacho) {
    let reprodutorKey = SEMEN_REPRODUTOR_NAO_INFORMADO_KEY;
    try {
      reprodutorKey = buildSemenReprodutorKey({
        origem: SEMEN_ORIGEM_INTERNO,
        machoId,
      });
    } catch {
      reprodutorKey = `m:${machoId}`;
    }
    const fromAnimal = formatReprodutorAnimalLabel(input.macho);
    const textoBruto = String(input.reprodutorSemen ?? "").trim();
    const reprodutorDisplay =
      fromAnimal !== "—"
        ? fromAnimal
        : textoReprodutorValido(textoBruto, partidaSnap)
          ? textoBruto
          : "—";
    return {
      origem: SEMEN_ORIGEM_INTERNO,
      reprodutorKey,
      reprodutorDisplay,
      machoId,
      conhecido: reprodutorDisplay !== "—" && reprodutorDisplay !== SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL,
    };
  }

  const textoBruto = String(input.reprodutorSemen ?? "").trim();
  const textoCadastro = String(input.cadastro?.reprodutorTexto ?? "").trim();
  const keyCadastro = String(input.cadastro?.reprodutorKey ?? "").trim();
  const brutoValido = textoReprodutorValido(textoBruto, partidaSnap);
  const cadastroValido = textoReprodutorValido(textoCadastro, partidaSnap);

  let textoExterno = "";
  let keyExterno = "";
  if (brutoValido) {
    textoExterno = textoBruto;
  } else if (cadastroValido) {
    textoExterno = textoCadastro;
    keyExterno = keyCadastro;
  }

  if (!textoExterno) {
    return {
      origem: SEMEN_ORIGEM_EXTERNO,
      reprodutorKey: SEMEN_REPRODUTOR_NAO_INFORMADO_KEY,
      reprodutorDisplay: SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL,
      machoId: null,
      conhecido: false,
    };
  }

  let reprodutorKey = SEMEN_REPRODUTOR_NAO_INFORMADO_KEY;
  try {
    reprodutorKey =
      keyExterno && keyExterno.startsWith("e:")
        ? keyExterno
        : buildSemenReprodutorKey({
            origem: SEMEN_ORIGEM_EXTERNO,
            reprodutorTexto: textoExterno,
          });
  } catch {
    return {
      origem: SEMEN_ORIGEM_EXTERNO,
      reprodutorKey: SEMEN_REPRODUTOR_NAO_INFORMADO_KEY,
      reprodutorDisplay: SEMEN_REPRODUTOR_NAO_INFORMADO_LABEL,
      machoId: null,
      conhecido: false,
    };
  }

  return {
    origem: SEMEN_ORIGEM_EXTERNO,
    reprodutorKey,
    reprodutorDisplay: textoExterno,
    machoId: null,
    conhecido: true,
  };
}
