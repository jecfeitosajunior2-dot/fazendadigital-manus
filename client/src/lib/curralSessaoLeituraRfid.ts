import { normalizeRfidKey } from "@shared/rfidUnicidade";

/**
 * Ciclo da Sessão no Curral — um animal por vez.
 * Receber RFID não registra manejo. Identidade do atendimento: animalId.
 * Equipamentos pertencem à sessão, não à etapa.
 */
export type DecisaoRfidSessaoCurral =
  | "capturar_novo_rfid"
  | "identificar_animal"
  | "manter_contexto_animal"
  | "avisar_animal_em_atendimento";

export type EstadoAtendimentoSessaoCurral = "aguardando_animal" | "animal_em_atendimento";

export type EfeitosLeituraRfidSessao = {
  trocaAnimal: boolean;
  criaRegistro: boolean;
  mostraErro: boolean;
  mostraAviso: boolean;
  reiniciaSessao: false;
  permaneceNoManejoAtual: boolean;
};

export function identidadeAtendimentoSessao(
  animalId: number | null | undefined,
): number | null {
  return animalId != null && Number.isFinite(animalId) && animalId > 0 ? animalId : null;
}

export function estadoAtendimentoSessaoCurral(
  animalId: number | null | undefined,
): EstadoAtendimentoSessaoCurral {
  return identidadeAtendimentoSessao(animalId) != null
    ? "animal_em_atendimento"
    : "aguardando_animal";
}

export function rotuloAguardandoAnimal(jaAtendeuAlgum: boolean): string {
  return jaAtendeuAlgum ? "Aguardando próximo animal" : "Aguardando animal";
}

export function leituraRfidEhDoAnimalAtual(
  rfidLido: string | null | undefined,
  rfidAnimalAtual: string | null | undefined,
): boolean {
  const lido = normalizeRfidKey(rfidLido);
  const atual = normalizeRfidKey(rfidAnimalAtual);
  return Boolean(lido && atual && lido === atual);
}

export function decidirLeituraRfidSessaoCurral(input: {
  temAnimalAtual: boolean;
  capturaNovoRfidAtiva: boolean;
  rfidLido?: string | null;
  rfidAnimalAtual?: string | null;
}): DecisaoRfidSessaoCurral {
  if (input.capturaNovoRfidAtiva) return "capturar_novo_rfid";
  if (!input.temAnimalAtual) return "identificar_animal";
  if (!input.rfidLido) return "manter_contexto_animal";
  if (leituraRfidEhDoAnimalAtual(input.rfidLido, input.rfidAnimalAtual)) {
    return "manter_contexto_animal";
  }
  return "avisar_animal_em_atendimento";
}

export function efeitosLeituraRfidSessaoCurral(
  decisao: DecisaoRfidSessaoCurral,
): EfeitosLeituraRfidSessao {
  if (decisao === "manter_contexto_animal") {
    return {
      trocaAnimal: false,
      criaRegistro: false,
      mostraErro: false,
      mostraAviso: false,
      reiniciaSessao: false,
      permaneceNoManejoAtual: true,
    };
  }
  if (decisao === "avisar_animal_em_atendimento") {
    return {
      trocaAnimal: false,
      criaRegistro: false,
      mostraErro: false,
      mostraAviso: true,
      reiniciaSessao: false,
      permaneceNoManejoAtual: true,
    };
  }
  return {
    trocaAnimal: decisao === "identificar_animal",
    criaRegistro: false,
    mostraErro: false,
    mostraAviso: false,
    reiniciaSessao: false,
    permaneceNoManejoAtual: decisao !== "identificar_animal",
  };
}

export function textoAvisoAnimalEmAtendimento(labelAnimalAtual: string): string {
  const label = labelAnimalAtual.trim() || "atual";
  return `Existe um animal em atendimento. Finalize o animal ${label} antes de iniciar outro.`;
}

export function deveFinalizarAnimalAposManejo(
  manejoAtualIdx: number,
  totalManejos: number,
): boolean {
  return totalManejos > 0 && manejoAtualIdx + 1 >= totalManejos;
}

/** Após troca de RFID confirmada, o atendimento continua no mesmo animalId. */
export function contextoAposTrocaRfid(
  animalId: number,
  novoRfid: string,
): { animalId: number; rfidAtual: string } {
  return { animalId, rfidAtual: normalizeRfidKey(novoRfid) };
}

/** Após registrar Pesagem, finalizar animal ou trocar de animal, o campo não herda o peso. */
export function estadoFormularioPesoAposAvancar(): {
  novoPeso: "";
  pesoFonteBalanca: null;
} {
  return { novoPeso: "", pesoFonteBalanca: null };
}

export function contextoAposFinalizarAnimal(): {
  animalId: null;
  manejoAtualIdx: 0;
  novoPeso: "";
  pesoFonteBalanca: null;
} {
  return {
    animalId: null,
    manejoAtualIdx: 0,
    ...estadoFormularioPesoAposAvancar(),
  };
}
