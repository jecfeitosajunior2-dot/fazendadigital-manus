/**
 * Presets de balança — Tru-Test (Datamars).
 * S3: SCP via USB (COM virtual). EziWeigh 6/7: {RO}/{RP} em DB9 serial.
 */

export type ScaleBrandPresetId = "trutest-s3" | "trutest-eziweigh" | "generica";

export type ScaleBrandPreset = {
  id: ScaleBrandPresetId;
  label: string;
  baudRate: number;
  /** Comando SCP/serial para solicitar peso. */
  pollCommand?: string;
  /** Intervalo de consulta quando pollCommand está definido. */
  pollIntervalMs: number;
  setupNotes: readonly string[];
};

/**
 * Tru-Test S3 Weigh — protocolo SCP (Serial Commands Protocol).
 * Ref.: integração ACBr balWeighTRUTest, manual SCP, 9600 8N1 via USB.
 */
export const TRUTEST_S3_SCALE_PRESET: ScaleBrandPreset = {
  id: "trutest-s3",
  label: "Tru-Test S3",
  baudRate: 9600,
  pollCommand: "{RW}",
  pollIntervalMs: 450,
  setupNotes: [
    "Conecte o cabo USB da S3 no PC (aparece como porta COM virtual).",
    "9600 bps, 8 bits, sem paridade, 1 stop bit (padrão da COM virtual).",
    "Unidade em kg no indicador (menu/app Data Link ou Datamars Pro).",
    "LED vermelho aceso = peso estável na plataforma.",
    "O sistema envia {RW} e lê resposta [425.5] — [U425.5] é instável e ignorado.",
    "Use Edge ou Chrome no desktop para Web Serial.",
  ],
};

/** Tru-Test EziWeigh 6/7 e linha 3000/5000 com DB9 serial. */
export const TRUTEST_EZIWEIGH_SCALE_PRESET: ScaleBrandPreset = {
  id: "trutest-eziweigh",
  label: "Tru-Test EziWeigh",
  baudRate: 9600,
  pollCommand: "{RO}\r",
  pollIntervalMs: 450,
  setupNotes: [
    "Cabo serial DB9 na porta CON → adaptador USB no PC.",
    "Menu Setup → Serial: 9600 bps, 8N1.",
    "Comando {RO} para peso estável; {RP} para estável + gravado.",
  ],
};

/** @deprecated Use TRUTEST_S3_SCALE_PRESET ou TRUTEST_EZIWEIGH_SCALE_PRESET. */
export const TRUTEST_SCALE_PRESET = TRUTEST_S3_SCALE_PRESET;

export const GENERIC_SCALE_PRESET: ScaleBrandPreset = {
  id: "generica",
  label: "Genérica",
  baudRate: 9600,
  pollIntervalMs: 0,
  setupNotes: [
    "9600 bps, 8N1 — balança envia peso contínuo quando estabiliza.",
  ],
};

export function getScalePreset(id: ScaleBrandPresetId = "trutest-s3"): ScaleBrandPreset {
  switch (id) {
    case "generica":
      return GENERIC_SCALE_PRESET;
    case "trutest-eziweigh":
      return TRUTEST_EZIWEIGH_SCALE_PRESET;
    default:
      return TRUTEST_S3_SCALE_PRESET;
  }
}
