/** Causa estruturada da Morte. Persistida no campo textual `animal_baixas.motivo`. */

export const CAUSAS_MORTE = [
  "acidente",
  "doenca",
  "problema_parto",
  "intoxicacao",
  "ataque_animal",
  "desconhecida",
  "outro",
] as const;

export type CausaMorte = (typeof CAUSAS_MORTE)[number];

export const CAUSA_MORTE_LABEL: Record<CausaMorte, string> = {
  acidente: "Acidente",
  doenca: "Doença",
  problema_parto: "Problema no parto",
  intoxicacao: "Intoxicação",
  ataque_animal: "Ataque de animal",
  desconhecida: "Causa desconhecida",
  outro: "Outro",
};

export const MSG_CAUSA_MORTE_INVALIDA = "Selecione uma causa válida.";
export const MSG_CAUSA_MORTE_OUTRO_OBRIGATORIA = "Informe a descrição da causa.";

const CAUSA_SET = new Set<string>(CAUSAS_MORTE);
const OUTRO_PREFIX = "outro:";

export function isCausaMorte(value?: string | null): value is CausaMorte {
  return CAUSA_SET.has((value ?? "").trim());
}

export function montarMotivoMorte(input: {
  codigo?: string | null;
  descricaoOutro?: string | null;
}): { ok: true; motivo: string | null } | { ok: false; message: string } {
  const codigo = (input.codigo ?? "").trim();
  if (!codigo) return { ok: true, motivo: null };
  if (!isCausaMorte(codigo)) return { ok: false, message: MSG_CAUSA_MORTE_INVALIDA };
  if (codigo !== "outro") return { ok: true, motivo: codigo };
  const descricao = (input.descricaoOutro ?? "").trim();
  if (!descricao) return { ok: false, message: MSG_CAUSA_MORTE_OUTRO_OBRIGATORIA };
  return { ok: true, motivo: `${OUTRO_PREFIX}${descricao}`.slice(0, 255) };
}

export function validarMotivoMortePersistido(
  motivo?: string | null,
): { ok: true; motivo: string | null } | { ok: false; message: string } {
  const raw = (motivo ?? "").trim();
  if (!raw) return { ok: true, motivo: null };
  if (isCausaMorte(raw) && raw !== "outro") return { ok: true, motivo: raw };
  if (raw.startsWith(OUTRO_PREFIX)) {
    const descricao = raw.slice(OUTRO_PREFIX.length).trim();
    if (!descricao) return { ok: false, message: MSG_CAUSA_MORTE_OUTRO_OBRIGATORIA };
    return { ok: true, motivo: `${OUTRO_PREFIX}${descricao}`.slice(0, 255) };
  }
  if (raw === "outro") return { ok: false, message: MSG_CAUSA_MORTE_OUTRO_OBRIGATORIA };
  return { ok: false, message: MSG_CAUSA_MORTE_INVALIDA };
}

export type CausaMorteExibicao = {
  codigo: CausaMorte | null;
  descricaoOutro: string | null;
  texto: string | null;
  legado: boolean;
};

export function parseCausaMorte(motivo?: string | null): CausaMorteExibicao {
  const raw = (motivo ?? "").trim();
  if (!raw) {
    return { codigo: null, descricaoOutro: null, texto: null, legado: false };
  }
  if (isCausaMorte(raw) && raw !== "outro") {
    return { codigo: raw, descricaoOutro: null, texto: CAUSA_MORTE_LABEL[raw], legado: false };
  }
  if (raw.startsWith(OUTRO_PREFIX)) {
    const descricao = raw.slice(OUTRO_PREFIX.length).trim();
    return {
      codigo: "outro",
      descricaoOutro: descricao || null,
      texto: descricao || CAUSA_MORTE_LABEL.outro,
      legado: false,
    };
  }
  return { codigo: null, descricaoOutro: null, texto: raw, legado: true };
}

export function formatarCausaMorteExibicao(motivo?: string | null): string | null {
  return parseCausaMorte(motivo).texto;
}

export const TITULO_CONFIRMAR_MORTE = "Confirmar morte do animal";
export const BOTAO_CONFIRMAR_MORTE = "Confirmar morte";

export function montarConfirmacaoMorte(input: {
  identificacao: string;
  dataISO: string;
  motivo?: string | null;
}): {
  title: string;
  confirmText: string;
  texto: string;
  causa: string | null;
} {
  const identificacao = input.identificacao.trim() || "animal";
  const iso = input.dataISO.trim().slice(0, 10);
  const [y, m, d] = iso.split("-");
  const dataBr = y && m && d ? `${d}/${m}/${y}` : iso;
  return {
    title: TITULO_CONFIRMAR_MORTE,
    confirmText: BOTAO_CONFIRMAR_MORTE,
    texto: `O animal ${identificacao} será marcado como Morto em ${dataBr}. Essa ação ficará registrada no histórico.`,
    causa: formatarCausaMorteExibicao(input.motivo),
  };
}
