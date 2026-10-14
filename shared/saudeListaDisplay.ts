import { saudeRegistroEstaEstornado } from "./saudeEstoque";

export const ROTA_REGISTROS_MANEJO = "/manejo/registros";
export const ROTA_REGISTROS_SANITARIOS = "/saude/registros";
export const ROTA_CADASTRO_SANITARIO = "/manejo/registros/cadastro?tipo=sanitario";

export function destinosAcoesHubSanitario() {
  return {
    verRegistros: ROTA_REGISTROS_SANITARIOS,
    registrar: ROTA_CADASTRO_SANITARIO,
  };
}

export function destinosPaginaRegistrosSanitarios() {
  return {
    voltar: ROTA_REGISTROS_MANEJO,
    novoRegistro: ROTA_CADASTRO_SANITARIO,
  };
}

/** Identificação operacional na lista sanitária — nunca o ID interno como principal. */
export function rotuloAnimalSanitarioLista(input: {
  animalId: number;
  brincoVisual?: string | null;
  rfid?: string | null;
}): string {
  const brinco = String(input.brincoVisual ?? "").trim();
  if (brinco) return `Brinco ${brinco}`;
  const rfid = String(input.rfid ?? "").trim();
  if (rfid) return `RFID ${rfid}`;
  return `Animal #${input.animalId}`;
}

export function podeEstornarRegistroSanitario(status?: string | null): boolean {
  return !saudeRegistroEstaEstornado(status);
}

/** Uma passada só: mapa de animais → registros. Evita N+1 no client. */
export function anexarIdentificacaoAnimalSaude<T extends { animalId: number }>(
  registros: readonly T[],
  animais: ReadonlyArray<{
    id: number;
    brinco?: string | null;
    brincoEletronico?: string | null;
  }>,
): Array<T & { brincoVisual: string | null; rfid: string | null }> {
  const byId = new Map<number, { brinco?: string | null; brincoEletronico?: string | null }>();
  for (const animal of animais) {
    byId.set(animal.id, animal);
  }
  return registros.map((registro) => {
    const animal = byId.get(registro.animalId);
    const brincoVisual = String(animal?.brinco ?? "").trim() || null;
    const rfid = String(animal?.brincoEletronico ?? "").trim() || null;
    return { ...registro, brincoVisual, rfid };
  });
}
