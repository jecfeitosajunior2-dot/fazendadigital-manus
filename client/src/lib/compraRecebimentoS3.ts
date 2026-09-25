/**
 * Captura de peso da Tru-Test S3 no Recebimento da Compra.
 *
 * Reutiliza só a infra BLE já existente (useTruTestBleReader + truTestBle):
 * GATT 0x181D / indicação 0x2A9D. Não cria segundo driver.
 *
 * Não copia regra de Venda (pesoBalancaVendaNaIdentificacao) nem de Curral.
 * 0x2A9D não tem flag de estabilidade — o driver já entrega cada medição válida.
 * Peso de animal: kg >= 1 (mesmo critério de acceptLiveKg). Abaixo disso é tara/zero.
 */

/** Mesma faixa mínima do driver BLE (acceptLiveKg / SCALE_KG_MIN). */
export const PESO_S3_RECEBIMENTO_MIN_KG = 1;
export const PESO_S3_RECEBIMENTO_MAX_KG = 2000;

export type OrigemPesoRecebimento = "manual" | "s3" | null;
export type FasePesoS3Recebimento = "livre" | "capturado" | "aguardando_zero";

export type EstadoPesoS3Recebimento = {
  fase: FasePesoS3Recebimento;
  origem: OrigemPesoRecebimento;
  pesoCampo: string;
  ultimoKgS3: number | null;
};

export type MotivoPesoS3Recusado =
  | "invalida"
  | "zero"
  | "nao_aceitando"
  | "aguardando_zero"
  | "ciclo_capturado";

export type DecisaoPesoS3Recebimento =
  | { aplicar: true; kg: number; textoCampo: string; estado: EstadoPesoS3Recebimento }
  | { aplicar: false; motivo: MotivoPesoS3Recusado; estado: EstadoPesoS3Recebimento };

export function estadoInicialPesoS3Recebimento(): EstadoPesoS3Recebimento {
  return { fase: "livre", origem: null, pesoCampo: "", ultimoKgS3: null };
}

export function rotuloStatusS3Recebimento(input: {
  sessionActive: boolean;
  connecting: boolean;
}): string {
  if (input.connecting) return "Conectando à balança...";
  if (input.sessionActive) return "Balança conectada";
  return "";
}

export function formatarPesoRecebimentoCampo(kg: number): string {
  const n = Math.round(kg * 10) / 10;
  return String(n);
}

export function pesoRecebimentoParaPayload(pesoCampo: string): string | null {
  const trimmed = pesoCampo.trim();
  return trimmed ? trimmed : null;
}

export function classificarLeituraPesoS3(
  kg: number,
): { kind: "invalida" } | { kind: "zero" } | { kind: "peso"; kg: number } {
  if (!Number.isFinite(kg)) return { kind: "invalida" };
  if (kg < PESO_S3_RECEBIMENTO_MIN_KG) return { kind: "zero" };
  if (kg > PESO_S3_RECEBIMENTO_MAX_KG) return { kind: "invalida" };
  return { kind: "peso", kg };
}

export function aplicarEdicaoManualPesoRecebimento(
  estado: EstadoPesoS3Recebimento,
  valor: string,
): EstadoPesoS3Recebimento {
  return {
    ...estado,
    pesoCampo: valor,
    origem: valor.trim() ? "manual" : null,
  };
}

/**
 * Depois de confirmar: campo vazio. Se a S3 ainda mostra peso de animal,
 * espera retorno a zero antes da próxima captura automática.
 */
export function consumirPesoS3AposConfirmar(
  estado: EstadoPesoS3Recebimento,
): EstadoPesoS3Recebimento {
  const residual = estado.ultimoKgS3 != null && estado.ultimoKgS3 >= PESO_S3_RECEBIMENTO_MIN_KG;
  return {
    fase: residual ? "aguardando_zero" : "livre",
    origem: null,
    pesoCampo: "",
    ultimoKgS3: estado.ultimoKgS3,
  };
}

/**
 * Destino da leitura no recebimento: só o campo Peso de entrada.
 * Não confirma animal. Não cria pesagem. Não avança o formulário.
 */
export function aplicarLeituraPesoS3Recebimento(input: {
  kg: number;
  aceitandoLeituras: boolean;
  estado: EstadoPesoS3Recebimento;
}): DecisaoPesoS3Recebimento {
  const classe = classificarLeituraPesoS3(input.kg);
  if (classe.kind === "invalida") {
    return { aplicar: false, motivo: "invalida", estado: input.estado };
  }

  if (classe.kind === "zero") {
    const estado: EstadoPesoS3Recebimento = {
      ...input.estado,
      ultimoKgS3: 0,
      fase: input.estado.fase === "aguardando_zero" ? "livre" : input.estado.fase,
    };
    return { aplicar: false, motivo: "zero", estado };
  }

  const comUltimo: EstadoPesoS3Recebimento = {
    ...input.estado,
    ultimoKgS3: classe.kg,
  };

  if (!input.aceitandoLeituras) {
    return { aplicar: false, motivo: "nao_aceitando", estado: comUltimo };
  }
  if (comUltimo.fase === "aguardando_zero") {
    return { aplicar: false, motivo: "aguardando_zero", estado: comUltimo };
  }
  if (comUltimo.fase === "capturado") {
    return { aplicar: false, motivo: "ciclo_capturado", estado: comUltimo };
  }

  const textoCampo = formatarPesoRecebimentoCampo(classe.kg);
  return {
    aplicar: true,
    kg: classe.kg,
    textoCampo,
    estado: {
      ...comUltimo,
      fase: "capturado",
      origem: "s3",
      pesoCampo: textoCampo,
    },
  };
}
