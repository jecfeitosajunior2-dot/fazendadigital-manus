import type { CurralManejoId } from "./curralManejoJetBovMap";

/** Ordem JetBov: pesagem → desmama → apartação (troca de lote). */
export const CURRAL_DESMAMA_ORDEM_JETBOV = [
  "pesagem",
  "desmama",
  "troca-lote",
] as const satisfies readonly CurralManejoId[];

export const CURRAL_DESMAMA_HUB_SUBTITULO =
  "Desmama no curral: peso, registro e apartação (troca de Lote) na mesma lida.";

export const CURRAL_DESMAMA_ORDEM_JETBOV_LABEL = "Pesagem → Desmama → Troca de Lote";

const BLOCO_SET = new Set<string>(CURRAL_DESMAMA_ORDEM_JETBOV);

export function manejosDesmamaJetBovFaltando(ordem: readonly string[]): CurralManejoId[] {
  const set = new Set(ordem);
  return CURRAL_DESMAMA_ORDEM_JETBOV.filter(id => !set.has(id));
}

/** Reorganiza a sessão mantendo outros manejos e inserindo o bloco JetBov onde estava a desmama. */
export function aplicarOrdemDesmamaJetBov(ordem: readonly string[]): CurralManejoId[] {
  if (!ordem.includes("desmama")) return [...ordem] as CurralManejoId[];

  const outros = ordem.filter(id => !BLOCO_SET.has(id));
  const desmamaIdx = ordem.indexOf("desmama");

  let outrosBefore = 0;
  for (let i = 0; i < desmamaIdx; i++) {
    if (!BLOCO_SET.has(ordem[i]!)) outrosBefore++;
  }

  const antes = outros.slice(0, outrosBefore);
  const depois = outros.slice(outrosBefore);
  return [...antes, ...CURRAL_DESMAMA_ORDEM_JETBOV, ...depois];
}
