/** Desmama do Manejo Pontual — validações puras, sem mover lote/pasto/categoria. */

export const TIPO_EVENTO_DESMAMA = "Desmama";

export const MSG_DESMAMA_FAZENDA = "Selecione uma Fazenda.";
export const MSG_DESMAMA_ANIMAL = "Selecione um animal válido.";
export const MSG_DESMAMA_INATIVO =
  "Não é possível desmamar um animal vendido, morto ou inativo.";
export const MSG_DESMAMA_DUPLICADA = "Este animal já possui uma desmama registrada.";
export const MSG_DESMAMA_DATA = "Data da desmama é obrigatória.";
export const MSG_DESMAMA_DATA_INVALIDA = "Data da desmama inválida.";
export const MSG_DESMAMA_DATA_FUTURA = "A data da desmama não pode ser futura.";
export const MSG_DESMAMA_PESO = "Informe um peso válido maior que zero.";
export const MSG_DESMAMA_IDADE =
  "Este animal não possui idade compatível com a data selecionada para Desmama.";
export const MSG_DESMAMA_GENERICO = "Não foi possível registrar a desmama.";
export const MSG_DESMAMA_SUCESSO = "Desmama registrada com sucesso.";

export const OBS_PESAGEM_ORIGEM_DESMAMA = "Desmama";

/** Faixa etária da Desmama (meses completos na data do evento). */
export const DESMAMA_IDADE_MIN_MESES = 3;
export const DESMAMA_IDADE_MAX_MESES = 12;

/** Fallback só quando não há data de nascimento: cria jovem do cadastro. */
export const CATEGORIAS_FALLBACK_DESMAMA = ["Bezerro", "Bezerra"] as const;

/** Data de Desmama só aparece no Editar (somente leitura). Novo Animal não tem o campo. */
export function deveExibirDataDesmamaNoFormularioAnimal(modo: "create" | "edit"): boolean {
  return modo === "edit";
}

export type MotivoInelegivelDesmama =
  | "INATIVO"
  | "JA_DESMAMADO"
  | "IDADE_ABAIXO_MINIMA"
  | "IDADE_ACIMA_MAXIMA"
  | "SEM_DATA_CONFIAVEL"
  | "FAZENDA_INCOMPATIVEL";

export type ResultadoElegibilidadeDesmama = {
  eligible: boolean;
  reason?: MotivoInelegivelDesmama;
  idadeMeses?: number | null;
};

export function hojeISODateLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isAnimalAtivoDesmama(status?: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "ativo";
}

export function isRegistroDesmama(tipo?: string | null): boolean {
  const n = (tipo ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return n === "desmama";
}

/** Data civil YYYY-MM-DD; vazio/inválido = sem desmama. */
export function toISODateOnly(value?: string | Date | null): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (!s) return null;
  const iso = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function temDataDesmama(value?: string | Date | null): boolean {
  return toISODateOnly(value) != null;
}

export function assertDataDesmamaNaoFutura(
  dataDesmama: string,
  hojeISO = hojeISODateLocal(),
): { ok: true; dataISO: string } | { ok: false; message: string } {
  const data = (dataDesmama ?? "").trim().slice(0, 10);
  if (!data) return { ok: false, message: MSG_DESMAMA_DATA };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, message: MSG_DESMAMA_DATA_INVALIDA };
  }
  if (data > hojeISO) return { ok: false, message: MSG_DESMAMA_DATA_FUTURA };
  return { ok: true, dataISO: data };
}

/**
 * Parser de peso (pt-BR ou US), igual ao da Pesagem pontual.
 * Vazio = omitido (Desmama sem pesagem). Inválido/≤0 = erro.
 */
export function parsePesoKgDesmama(
  raw?: string | null,
): { ok: true; peso?: string } | { ok: false; message: string } {
  const t = (raw ?? "").trim();
  if (!t) return { ok: true };
  let normalized = t;
  if (t.includes(",")) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: MSG_DESMAMA_PESO };
  }
  return { ok: true, peso: (Math.round(n * 100) / 100).toFixed(2) };
}

export function pesosNumericamenteIguais(
  a?: string | number | null,
  b?: string | number | null,
): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.round(na * 100) === Math.round(nb * 100);
}

export function jaPossuiPesagemIgual(
  registros: Array<{ data?: string | Date | null; peso?: string | number | null }>,
  dataISO: string,
  peso: string,
): boolean {
  return registros.some(
    r => toISODateOnly(r.data) === dataISO && pesosNumericamenteIguais(r.peso, peso),
  );
}

function normalizeCategoriaDesmama(categoria?: string | null): string {
  return (categoria ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const FALLBACK_CATEGORIA_SET = new Set(
  CATEGORIAS_FALLBACK_DESMAMA.map(c => normalizeCategoriaDesmama(c)),
);

function partsISODate(value?: string | Date | null): { y: number; m: number; d: number } | null {
  const iso = toISODateOnly(value);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/** Meses civis completos entre nascimento e a data do manejo. Não usa idade de hoje. */
export function idadeMesesNaData(
  dataNascimento?: string | Date | null,
  dataEvento?: string | Date | null,
): number | null {
  const nasc = partsISODate(dataNascimento);
  const evento = partsISODate(dataEvento);
  if (!nasc || !evento) return null;
  let meses = (evento.y - nasc.y) * 12 + (evento.m - nasc.m);
  if (evento.d < nasc.d) meses -= 1;
  return meses;
}

export function categoriaFallbackPermiteDesmama(categoria?: string | null): boolean {
  const n = normalizeCategoriaDesmama(categoria);
  return n.length > 0 && FALLBACK_CATEGORIA_SET.has(n);
}

export function mensagemMotivoDesmama(reason?: MotivoInelegivelDesmama): string {
  switch (reason) {
    case "INATIVO":
      return MSG_DESMAMA_INATIVO;
    case "JA_DESMAMADO":
      return MSG_DESMAMA_DUPLICADA;
    case "FAZENDA_INCOMPATIVEL":
      return "O animal não pertence à Fazenda selecionada.";
    case "IDADE_ABAIXO_MINIMA":
    case "IDADE_ACIMA_MAXIMA":
    case "SEM_DATA_CONFIAVEL":
    default:
      return MSG_DESMAMA_IDADE;
  }
}

export function jaPossuiDesmamaRegistrada(params: {
  dataDesmama?: string | Date | null;
  registrosEvento?: Array<{ tipo?: string | null }>;
}): boolean {
  if (temDataDesmama(params.dataDesmama)) return true;
  return (params.registrosEvento ?? []).some(r => isRegistroDesmama(r.tipo));
}

/**
 * Elegibilidade zootécnica da Desmama.
 * Idade na data do evento prevalece. Lote nunca entra na regra.
 * Categoria só entra como fallback se não houver nascimento.
 */
export function isAnimalElegivelParaDesmama(params: {
  status?: string | null;
  dataDesmama?: string | Date | null;
  dataNascimento?: string | Date | null;
  categoria?: string | null;
  dataEvento?: string | Date | null;
  registrosEvento?: Array<{ tipo?: string | null }>;
  fazendaAnimalId?: number | null;
  fazendaSelecionadaId?: number | null;
}): ResultadoElegibilidadeDesmama {
  if (!isAnimalAtivoDesmama(params.status)) {
    return { eligible: false, reason: "INATIVO" };
  }
  if (
    jaPossuiDesmamaRegistrada({
      dataDesmama: params.dataDesmama,
      registrosEvento: params.registrosEvento,
    })
  ) {
    return { eligible: false, reason: "JA_DESMAMADO" };
  }
  if (
    params.fazendaSelecionadaId != null &&
    params.fazendaSelecionadaId > 0 &&
    params.fazendaAnimalId != null &&
    Number(params.fazendaAnimalId) !== Number(params.fazendaSelecionadaId)
  ) {
    return { eligible: false, reason: "FAZENDA_INCOMPATIVEL" };
  }

  if (!toISODateOnly(params.dataEvento)) {
    return { eligible: false, reason: "SEM_DATA_CONFIAVEL" };
  }

  const idadeMeses = idadeMesesNaData(params.dataNascimento, params.dataEvento);
  if (idadeMeses != null) {
    if (idadeMeses < DESMAMA_IDADE_MIN_MESES) {
      return { eligible: false, reason: "IDADE_ABAIXO_MINIMA", idadeMeses };
    }
    if (idadeMeses > DESMAMA_IDADE_MAX_MESES) {
      return { eligible: false, reason: "IDADE_ACIMA_MAXIMA", idadeMeses };
    }
    return { eligible: true, idadeMeses };
  }

  if (categoriaFallbackPermiteDesmama(params.categoria)) {
    return { eligible: true, idadeMeses: null };
  }
  return { eligible: false, reason: "SEM_DATA_CONFIAVEL", idadeMeses: null };
}

export function validarAnimalParaDesmama(animal: {
  status?: string | null;
  dataDesmama?: string | Date | null;
  dataNascimento?: string | Date | null;
  categoria?: string | null;
  registrosEvento?: Array<{ tipo?: string | null }>;
  fazendaAnimalId?: number | null;
  fazendaSelecionadaId?: number | null;
}, dataEvento?: string | Date | null): { ok: true } | { ok: false; message: string } {
  const r = isAnimalElegivelParaDesmama({ ...animal, dataEvento });
  if (r.eligible) return { ok: true };
  return { ok: false, message: mensagemMotivoDesmama(r.reason) };
}

export function validarDesmamaInput(input: {
  fazendaId?: number | null;
  animalId?: number | null;
  dataDesmama?: string | null;
  pesoKg?: string | null;
}): { ok: true; dataISO: string; peso?: string } | { ok: false; message: string } {
  if (input.fazendaId == null || input.fazendaId <= 0) {
    return { ok: false, message: MSG_DESMAMA_FAZENDA };
  }
  if (input.animalId == null || input.animalId <= 0) {
    return { ok: false, message: MSG_DESMAMA_ANIMAL };
  }
  const dataOk = assertDataDesmamaNaoFutura(input.dataDesmama ?? "");
  if (!dataOk.ok) return dataOk;
  const pesoOk = parsePesoKgDesmama(input.pesoKg);
  if (!pesoOk.ok) return pesoOk;
  return { ok: true, dataISO: dataOk.dataISO, peso: pesoOk.peso };
}

export function podeSalvarDesmama(input: {
  fazendaId?: number | null;
  animalId?: number | null;
  dataDesmama?: string | null;
  pesoKg?: string | null;
}): boolean {
  return validarDesmamaInput(input).ok;
}

export function filtrarAnimaisElegiveisDesmama<
  T extends {
    status?: string | null;
    dataDesmama?: string | Date | null;
    dataNascimento?: string | Date | null;
    categoria?: string | null;
    fazendaId?: number | null;
  },
>(
  animais: T[],
  dataEvento?: string | Date | null,
  opts?: { fazendaSelecionadaId?: number | null },
): T[] {
  return animais.filter(
    a =>
      isAnimalElegivelParaDesmama({
        status: a.status,
        dataDesmama: a.dataDesmama,
        dataNascimento: a.dataNascimento,
        categoria: a.categoria,
        dataEvento,
        fazendaAnimalId: a.fazendaId,
        fazendaSelecionadaId: opts?.fazendaSelecionadaId,
      }).eligible,
  );
}

export function observacaoPesagemDesmama(observacoes?: string | null): string | undefined {
  const t = (observacoes ?? "").trim();
  return t || OBS_PESAGEM_ORIGEM_DESMAMA;
}

function normalizeTextoDesmama(value?: string | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Pesagem gerada pelo Manejo → Desmama (marcador na observação). Não é “última pesagem”. */
export function isObservacaoPesagemOrigemDesmama(observacoes?: string | null): boolean {
  const n = normalizeTextoDesmama(observacoes);
  return n === "desmama" || n.startsWith("desmama");
}

/** Texto do usuário para o bloco; omite o marcador técnico "Desmama". */
export function observacaoDesmamaParaBloco(observacoes?: string | null): string | null {
  const t = (observacoes ?? "").trim();
  if (!t) return null;
  if (normalizeTextoDesmama(t) === "desmama") return null;
  return t;
}

export function formatPesoKgDesmamaFicha(peso?: string | number | null): string {
  const n = Number(peso);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}

export type PesagemParaBlocoDesmama = {
  id?: number;
  data?: string | Date | null;
  peso?: string | number | null;
  observacoes?: string | null;
};

export type BlocoDesmamaFicha = {
  dataISO: string;
  pesoKg: number | null;
  pesoFormatado: string;
  observacoes: string | null;
};

/**
 * Marco zootécnico da ficha. Data = animais.dataDesmama.
 * Peso só se houver pesagem na mesma data com origem Desmama.
 */
export function montarBlocoDesmamaFicha(params: {
  dataDesmama?: string | Date | null;
  pesagens?: PesagemParaBlocoDesmama[];
}): BlocoDesmamaFicha | null {
  const dataISO = toISODateOnly(params.dataDesmama);
  if (!dataISO) return null;

  const associadas = (params.pesagens ?? []).filter(
    p =>
      toISODateOnly(p.data) === dataISO && isObservacaoPesagemOrigemDesmama(p.observacoes),
  );

  let escolhida: PesagemParaBlocoDesmama | undefined;
  if (associadas.length === 1) {
    escolhida = associadas[0];
  } else if (associadas.length > 1) {
    escolhida = associadas.reduce((a, b) => {
      if (a.id != null && b.id != null) return a.id <= b.id ? a : b;
      return a;
    });
  }

  const pesoNum = escolhida == null ? NaN : Number(escolhida.peso);
  const pesoKg = Number.isFinite(pesoNum) && pesoNum > 0 ? pesoNum : null;

  return {
    dataISO,
    pesoKg,
    pesoFormatado: formatPesoKgDesmamaFicha(pesoKg),
    observacoes: observacaoDesmamaParaBloco(escolhida?.observacoes),
  };
}
