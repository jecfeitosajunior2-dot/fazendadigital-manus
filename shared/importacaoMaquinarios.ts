/**
 * shared/importacaoMaquinarios.ts
 *
 * Definições compartilhadas entre frontend e backend para a
 * importação em massa de maquinários via planilha.
 *
 * Alinhado ao formulário Cadastrar/Editar máquina.
 * A Fazenda de destino vem do filtro da tela (não da planilha).
 */

import { TIPOS_MEDIDOR, type TipoMedidor } from "./maquina-types";
import { parseMoedaBr } from "./parseMoedaBr";

// ─── Fonte única de verdade para tipos ─────────────────────────────────────
export { TIPOS_MAQUINA } from "./maquina-types";

/** Limite de Observações compatível com TEXT do MySQL (~65 KB). */
export const OBSERVACOES_MAX_CHARS = 65535;

export const CONDICOES_AQUISICAO_PLANILHA = ["Nova", "Usada"] as const;

export const TIPOS_MEDIDOR_PLANILHA = ["Horímetro", "Quilometragem", "Sem medidor"] as const;

export const TIPOS_MEDIDOR_LABEL_PARA_CHAVE: Record<
  (typeof TIPOS_MEDIDOR_PLANILHA)[number],
  TipoMedidor
> = {
  Horímetro: "horimetro",
  Quilometragem: "quilometragem",
  "Sem medidor": "sem_medidor",
};

// ─── Colunas da planilha modelo ──────────────────────────────────────────────

export interface ColunaImportacao {
  key: string;
  label: string;
  obrigatorio: boolean;
  descricao: string;
  exemplo: string;
  largura: number;
}

/**
 * Ordem obrigatória das colunas (sem Fazenda / Status / Data de desativação).
 */
export const COLUNAS_IMPORTACAO: ColunaImportacao[] = [
  {
    key: "nome",
    label: "Nome de identificação",
    obrigatorio: true,
    largura: 24,
    descricao: "Nome usado para identificar a máquina na fazenda",
    exemplo: "Trator 01",
  },
  {
    key: "tipo",
    label: "Tipo de máquina",
    obrigatorio: true,
    largura: 22,
    descricao: "Tipo cadastrado no sistema",
    exemplo: "Máquinas",
  },
  {
    key: "marca",
    label: "Marca",
    obrigatorio: true,
    largura: 16,
    descricao: "Marca válida para o Tipo selecionado",
    exemplo: "John Deere",
  },
  {
    key: "modelo",
    label: "Modelo",
    obrigatorio: false,
    largura: 16,
    descricao: "Modelo do equipamento",
    exemplo: "5075E",
  },
  {
    key: "placa",
    label: "Identificação — placa ou número de série",
    obrigatorio: false,
    largura: 28,
    descricao: "Placa, número de série, patrimônio ou outro código",
    exemplo: "ABC-1234",
  },
  {
    key: "ano",
    label: "Ano de fabricação",
    obrigatorio: false,
    largura: 16,
    descricao: "Ano com 4 dígitos (não futuro)",
    exemplo: "2022",
  },
  {
    key: "dataAquisicao",
    label: "Data de aquisição",
    obrigatorio: false,
    largura: 18,
    descricao: "Data no formato DD/MM/AAAA",
    exemplo: "29/08/2025",
  },
  {
    key: "estado",
    label: "Condição de aquisição",
    obrigatorio: false,
    largura: 18,
    descricao: "Nova ou Usada",
    exemplo: "Usada",
  },
  {
    key: "valor",
    label: "Valor de aquisição (R$)",
    obrigatorio: false,
    largura: 18,
    descricao: "Valor numérico em reais",
    exemplo: "345000,00",
  },
  {
    key: "vidaUtil",
    label: "Vida útil estimada (anos)",
    obrigatorio: false,
    largura: 18,
    descricao: "Número inteiro positivo de anos",
    exemplo: "10",
  },
  {
    key: "tipoMedidor",
    label: "Tipo de medidor",
    obrigatorio: true,
    largura: 16,
    descricao: "Horímetro, Quilometragem ou Sem medidor",
    exemplo: "Horímetro",
  },
  {
    key: "leituraInicial",
    label: "Leitura inicial",
    obrigatorio: false,
    largura: 14,
    descricao: "Obrigatória se houver medidor; vazia se Sem medidor",
    exemplo: "1250,5",
  },
  {
    key: "observacoes",
    label: "Observações",
    obrigatorio: false,
    largura: 28,
    descricao: "Texto livre",
    exemplo: "Revisão em dia",
  },
];

// ─── Normalização de cabeçalhos ──────────────────────────────────────────────

/**
 * Normaliza texto de cabeçalho para comparação:
 * - minúsculas, sem acentos, sem parênteses, sem pontuação
 */
export function normalizarCabecalho(texto: string): string {
  return (texto || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Mapa: cabeçalho normalizado → chave interna.
 */
export const CABECALHO_PARA_CHAVE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const col of COLUNAS_IMPORTACAO) {
    map[normalizarCabecalho(col.label)] = col.key;
    map[normalizarCabecalho(col.key)] = col.key;
  }
  // Aliases (incluindo cabeçalhos antigos) para compatibilidade de leitura
  const aliases: Record<string, string> = {
    tipomaquina: "tipo",
    tipomaquinario: "tipo",
    tipodemaquina: "tipo",
    apelido: "nome",
    nomedeidentificacao: "nome",
    nomeidentificacao: "nome",
    nomemaquina: "nome",
    nomemaquinario: "nome",
    valorrs: "valor",
    valorreais: "valor",
    valordeaquisicao: "valor",
    valordeaquisicaors: "valor",
    placaoundedeserie: "placa",
    placaounserie: "placa",
    identificacaoplacaounumerodeserie: "placa",
    identificacao: "placa",
    numeroserie: "placa",
    nserie: "placa",
    anofabricacao: "ano",
    anofab: "ano",
    anodeaquisicao: "dataAquisicao",
    dataaquisicao: "dataAquisicao",
    datadeaquisicao: "dataAquisicao",
    vidautil: "vidaUtil",
    vidautilestimada: "vidaUtil",
    vidautilestimadaanios: "vidaUtil",
    vidautilestimadaanos: "vidaUtil",
    estado: "estado",
    condicaodeaquisicao: "estado",
    condicao: "estado",
    tipodemedidor: "tipoMedidor",
    tipomedidor: "tipoMedidor",
    medidor: "tipoMedidor",
    leiturainicial: "leituraInicial",
    horimetroinicial: "leituraInicial",
    quilometrageminicial: "leituraInicial",
    observacao: "observacoes",
    obs: "observacoes",
    // Colunas removidas: mapeadas só para serem descartadas / ignoradas
    fazendanome: "_ignorado",
    fazenda: "_ignorado",
    status: "_ignorado",
    statusoperacional: "_ignorado",
    datadedesativacao: "_ignorado",
    datadesativacao: "_ignorado",
  };
  for (const [k, v] of Object.entries(aliases)) {
    map[normalizarCabecalho(k)] = v;
  }
  return map;
})();

/**
 * Recebe uma linha lida da planilha (chaves = cabeçalhos originais)
 * e retorna uma linha normalizada com as chaves internas do backend.
 */
export function normalizarLinha(linhaOriginal: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [cabecalho, valor] of Object.entries(linhaOriginal)) {
    const chaveNorm = normalizarCabecalho(cabecalho);
    const chaveInterna = CABECALHO_PARA_CHAVE[chaveNorm];
    if (chaveInterna && chaveInterna !== "_ignorado") {
      out[chaveInterna] = (valor ?? "").toString().trim();
    }
  }
  return out;
}

/** Linha sem nenhum valor útil (após normalizar). */
export function isLinhaVazia(linhaNormalizada: Record<string, string>): boolean {
  return !Object.values(linhaNormalizada).some(v => String(v ?? "").trim() !== "");
}

// ─── Normalização de enums ───────────────────────────────────────────────────

/** Condição de aquisição: Nova/Usada → novo/usado. Retorna null se vazio. */
export function normalizarCondicaoAquisicao(v: string): "novo" | "usado" | null {
  const s = normalizarCabecalho(v);
  if (!s) return null;
  if (s === "novo" || s === "nova" || s === "new") return "novo";
  if (s === "usado" || s === "usada" || s === "used") return "usado";
  return null;
}

/** @deprecated Preferir normalizarCondicaoAquisicao */
export function normalizarEstado(v: string): string {
  const n = normalizarCondicaoAquisicao(v);
  if (n) return n;
  return (v || "").toLowerCase().trim();
}

/** Status nunca vem da planilha; mantido só por compatibilidade de imports legados. */
export function normalizarStatus(_v: string): string {
  return "ativo";
}

export function normalizarTipoMedidor(v: string): TipoMedidor | null {
  const raw = (v || "").trim();
  if (!raw) return null;
  const s = normalizarCabecalho(raw);
  if (s === "horimetro" || s === "horas" || s === "hora") return "horimetro";
  if (s === "quilometragem" || s === "km" || s === "odometro") return "quilometragem";
  if (s === "semmedidor" || s === "sem" || s === "nenhum" || s === "na") return "sem_medidor";
  if ((TIPOS_MEDIDOR as readonly string[]).includes(raw)) return raw as TipoMedidor;
  return null;
}

export function labelTipoMedidor(tipo: TipoMedidor): string {
  if (tipo === "horimetro") return "Horímetro";
  if (tipo === "quilometragem") return "Quilometragem";
  return "Sem medidor";
}

/**
 * Para "Sem medidor", Excel costuma preencher 0 na coluna numérica.
 * Trata vazio / 0 / 0,0 como "sem leitura" (ignorar).
 * Qualquer outro valor continua inválido.
 */
export function leituraInicialEhVaziaParaSemMedidor(raw: string): boolean {
  const s = (raw || "").trim();
  if (!s) return true;
  const parsed = parseLeituraMedidorImportacao(s);
  return parsed != null && parsed === 0;
}

/**
 * Interpreta Leitura inicial (horímetro / km) no padrão brasileiro.
 * Ex.: "100.000" → 100000 | "1250,5" → 1250.5 | "100" → 100
 * Evita o bug de parseFloat("100.000") === 100.
 */
export function parseLeituraMedidorImportacao(raw: string): number | null {
  const s = (raw || "").trim();
  if (!s) return null;
  if (/[a-zA-Z]/.test(s)) return null;

  // Número puro já convertido pelo Excel/SheetJS
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw >= 0 ? raw : null;
  }

  const parsed = parseMoedaBr(s);
  if (!parsed) return null;
  const n = parseFloat(parsed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Formata leitura para gravar (sem zeros à direita desnecessários). */
export function formatLeituraMedidorGravacao(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (Number.isInteger(n)) return String(n);
  // Mantém até 2 casas úteis (ex.: 1250.5)
  return String(parseFloat(n.toFixed(2)));
}

/**
 * Converte valor monetário pt-BR / US para número.
 * Retorna null se vazio; NaN se inválido.
 */
export function parseValorAquisicaoImportacao(raw: string): number | null {
  const valorRaw = (raw || "").trim();
  if (!valorRaw) return null;
  if (/[a-zA-Z$]/.test(valorRaw.replace(/R\$/gi, ""))) {
    // Letras fora de "R$" → inválido
    const semRs = valorRaw.replace(/R\$\s*/gi, "").trim();
    if (/[a-zA-Z]/.test(semRs)) return Number.NaN;
  }
  const limpo = valorRaw.replace(/R\$\s*/gi, "").trim();
  const usaVirgulaCentavos = /,\d{1,2}$/.test(limpo);
  let valorClean: string;
  if (usaVirgulaCentavos) {
    valorClean = limpo.replace(/\./g, "").replace(",", ".");
  } else {
    valorClean = limpo.replace(/,/g, "");
  }
  const parsed = parseFloat(valorClean);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

/**
 * Interpreta Data de aquisição.
 * Aceita DD/MM/AAAA (preferencial) e serial Excel (quando a célula está formatada como data).
 */
export function parseDataAquisicaoImportacao(
  raw: string,
): { ok: true; iso: string } | { ok: false; motivo: string; esperado: string } {
  const s = (raw || "").trim();
  if (!s) {
    return { ok: false, motivo: "vazio", esperado: "DD/MM/AAAA" };
  }

  // Serial Excel (número puro) — comum quando a célula está como Data
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 100000) {
    const serial = Math.floor(Number(s));
    // Epoch Excel: 1899-12-30 (compensa o bug do leap year 1900)
    const utc = Date.UTC(1899, 11, 30) + serial * 86400000;
    const dt = new Date(utc);
    if (Number.isNaN(dt.getTime())) {
      return {
        ok: false,
        motivo: "data inválida (serial de planilha)",
        esperado: "DD/MM/AAAA (ex: 29/08/2025)",
      };
    }
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return { ok: true, iso };
  }

  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const d = parseInt(brMatch[1], 10);
    const m = parseInt(brMatch[2], 10);
    const y = parseInt(brMatch[3], 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      return { ok: false, motivo: "data inválida", esperado: "DD/MM/AAAA" };
    }
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dt = new Date(`${iso}T12:00:00`);
    if (
      Number.isNaN(dt.getTime()) ||
      dt.getFullYear() !== y ||
      dt.getMonth() + 1 !== m ||
      dt.getDate() !== d
    ) {
      return { ok: false, motivo: "data inválida", esperado: "DD/MM/AAAA" };
    }
    return { ok: true, iso };
  }

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    const iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dt = new Date(`${iso}T12:00:00`);
    if (
      Number.isNaN(dt.getTime()) ||
      dt.getFullYear() !== y ||
      dt.getMonth() + 1 !== m ||
      dt.getDate() !== d
    ) {
      return { ok: false, motivo: "data inválida", esperado: "DD/MM/AAAA" };
    }
    return { ok: true, iso };
  }

  return {
    ok: false,
    motivo: "formato não reconhecido",
    esperado: "DD/MM/AAAA (ex: 29/08/2025)",
  };
}

export function hojeISOLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Detecção de linha de exemplo ────────────────────────────────────────────

/** Marcador da linha ilustrativa (modelo antigo e novo) */
export const EXEMPLO_NOME = "Trator 01";
export const EXEMPLO_TIPO = "Máquinas";
export const EXEMPLO_MARCA = "John Deere";
export const EXEMPLO_PLACA = "ABC-1234";

/**
 * Detecta linha de exemplo ilustrativa (não deve ser importada).
 */
export function isLinhaExemplo(linhaNormalizada: Record<string, string>): boolean {
  const nome = (linhaNormalizada.nome ?? "").trim().toLowerCase();
  const tipo = (linhaNormalizada.tipo ?? "").trim().toLowerCase();
  const marca = (linhaNormalizada.marca ?? "").trim().toLowerCase();
  const placa = (linhaNormalizada.placa ?? "").trim().toLowerCase();

  const novoExemplo =
    nome === EXEMPLO_NOME.toLowerCase() &&
    tipo === EXEMPLO_TIPO.toLowerCase() &&
    marca === EXEMPLO_MARCA.toLowerCase() &&
    placa === EXEMPLO_PLACA.toLowerCase();

  // Modelo antigo: Tipo = Trator + John Deere + ABC-1234
  const antigoExemplo =
    tipo === "trator" &&
    marca === EXEMPLO_MARCA.toLowerCase() &&
    placa === EXEMPLO_PLACA.toLowerCase();

  return novoExemplo || antigoExemplo;
}
