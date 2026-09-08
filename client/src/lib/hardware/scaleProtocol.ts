/**
 * Parser de peso para balanças industriais via serial (ASCII).
 * Tru-Test S3 SCP [425.5], EziWeigh [WS]/[WR], formatos genéricos.
 */

/** Faixa plausível de peso bovino em kg (curral). */
export const SCALE_KG_MIN = 1;
export const SCALE_KG_MAX = 2000;

/** Tempo com o mesmo candidato antes de considerar estável. */
export const SCALE_STABLE_MS = 700;

/** Ignora reenvio do mesmo peso dentro deste intervalo. */
export const SCALE_DEDUP_MS = 1500;

/** Tru-Test S3 SCP — instável (não usar). */
const TRUTEST_SCP_UNSTABLE_RE = /\[U[+-]?\d+(?:[.,]\d+)?\]/i;

/** Tru-Test S3 SCP — estável: [425.5] */
const TRUTEST_SCP_STABLE_RE = /\[([+-]?\d+(?:[.,]\d+)?)\]/;

/** Tags Tru-Test EziWeigh: [WS] peso estável, [WR] peso gravado. */
const TRUTEST_TAG_RE = /\[(?:WS|WR)\]\s*([+-]?\d+(?:[.,]\d+)?)/i;

export function isPlausibleScaleKg(n: number): boolean {
  return Number.isFinite(n) && n >= SCALE_KG_MIN && n <= SCALE_KG_MAX;
}

function normalizeWeightToken(token: string): number | null {
  let normalized = token.replace(/^\+/, "").trim();
  if (!normalized) return null;
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(normalized);
  if (!isPlausibleScaleKg(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Extrai peso em kg de uma linha/chunk serial.
 * Retorna null se não encontrar valor plausível.
 */
export function parseScaleWeightKgFromText(raw: string): number | null {
  const line = raw.trim();
  if (!line) return null;

  if (TRUTEST_SCP_UNSTABLE_RE.test(line)) return null;

  const trutestTag = line.match(TRUTEST_TAG_RE);
  if (trutestTag?.[1]) {
    return normalizeWeightToken(trutestTag[1]);
  }

  const scpStable = line.match(TRUTEST_SCP_STABLE_RE);
  if (scpStable?.[1]) {
    return normalizeWeightToken(scpStable[1]);
  }

  const tokens = line.match(/[+-]?\d{1,5}(?:[.,]\d{1,3})?/g);
  if (!tokens?.length) return null;

  let best: number | null = null;
  for (const token of tokens) {
    const n = normalizeWeightToken(token);
    if (n != null) best = n;
  }
  return best;
}

/** Formata kg para campo pt-BR (ex.: 425,5). */
export function formatPesoKgParaCampo(kg: number): string {
  const fixed = (Math.round(kg * 100) / 100).toFixed(2);
  return fixed.replace(".", ",");
}

export type ScaleRxProcessorOptions = {
  onWeightCandidate: (kg: number) => void;
};

export function createScaleRxProcessor(options: ScaleRxProcessorOptions) {
  let buffer = "";

  function emitFromText(text: string) {
    const kg = parseScaleWeightKgFromText(text);
    if (kg != null) options.onWeightCandidate(kg);
  }

  function pushChunk(chunk: string) {
    if (!chunk) return;
    buffer += chunk;

    const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const parts = normalized.split("\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      emitFromText(part);
    }

    // Balanças contínuas sem newline: tenta parse parcial do buffer.
    if (buffer.length >= 3) {
      const kg = parseScaleWeightKgFromText(buffer);
      if (kg != null) {
        options.onWeightCandidate(kg);
        buffer = "";
      } else if (buffer.length > 48) {
        buffer = buffer.slice(-24);
      }
    }
  }

  function reset() {
    buffer = "";
  }

  return { pushChunk, reset };
}

export type ScaleStabilizerOptions = {
  stableMs?: number;
  dedupMs?: number;
  onStableWeight: (kg: number) => void;
};

/** Aguarda repetição do mesmo peso antes de emitir (peso estável na plataforma). */
export function createScaleStabilizer(options: ScaleStabilizerOptions) {
  const stableMs = options.stableMs ?? SCALE_STABLE_MS;
  const dedupMs = options.dedupMs ?? SCALE_DEDUP_MS;

  let pendingKg: number | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let lastDelivered: number | null = null;
  let lastDeliveredAt = 0;

  function reset() {
    pendingKg = null;
    if (stableTimer) {
      clearTimeout(stableTimer);
      stableTimer = null;
    }
  }

  function pushCandidate(kg: number) {
    if (!isPlausibleScaleKg(kg)) return;

    if (pendingKg === kg && stableTimer) return;

    pendingKg = kg;
    if (stableTimer) clearTimeout(stableTimer);

    stableTimer = setTimeout(() => {
      stableTimer = null;
      const now = Date.now();
      if (lastDelivered === kg && now - lastDeliveredAt < dedupMs) return;
      lastDelivered = kg;
      lastDeliveredAt = now;
      options.onStableWeight(kg);
    }, stableMs);
  }

  /** Entrega imediata (simulação / teste sem hardware). */
  function deliverImmediate(kg: number) {
    if (!isPlausibleScaleKg(kg)) return;
    reset();
    lastDelivered = kg;
    lastDeliveredAt = Date.now();
    options.onStableWeight(kg);
  }

  return { pushCandidate, deliverImmediate, reset };
}
