export const NUTRICAO_COCHO_STATUS = ["ativo", "inativo"] as const;
export type NutricaoCochoStatus = (typeof NUTRICAO_COCHO_STATUS)[number];

export const NUTRICAO_COCHO_TIPOS = [
  { value: "mineral", label: "Mineral" },
  { value: "suplementacao", label: "Suplementação" },
  { value: "racao_dieta", label: "Ração / Dieta" },
  { value: "creep_feeding", label: "Creep-feeding" },
  { value: "outro", label: "Outro" },
] as const;
export type NutricaoCochoTipo = (typeof NUTRICAO_COCHO_TIPOS)[number]["value"];

export const NUTRICAO_COCHO_LADOS = [1, 2] as const;
export type NutricaoCochoLados = (typeof NUTRICAO_COCHO_LADOS)[number];

export const MSG_COCHO_FAZENDA = "Selecione a fazenda do cocho.";
export const MSG_COCHO_NOME = "Informe o nome do cocho.";
export const MSG_COCHO_TIPO = "Selecione o tipo do cocho.";
export const MSG_COCHO_PASTO = "O pasto selecionado não pertence a esta fazenda.";
export const MSG_COCHO_COMPRIMENTO = "O comprimento deve ser maior que zero.";
export const MSG_COCHO_LARGURA = "A largura deve ser maior que zero.";
export const MSG_COCHO_CAPACIDADE = "A capacidade estimada deve ser maior que zero.";
export const MSG_COCHO_LADOS = "Informe 1 ou 2 lados de acesso.";
export const MSG_COCHO_CODIGO = "Já existe um cocho com este código nesta fazenda.";
export const MSG_COCHO_FAZENDA_FIXA = "A fazenda do cocho não pode ser alterada.";
export const MSG_COCHO_NAO_ENCONTRADO = "Cocho não encontrado.";
export const MSG_COCHO_JA_INATIVO = "Este cocho já está inativo.";
export const MSG_COCHO_JA_ATIVO = "Este cocho já está ativo.";

export const MSG_FORN_COCHO = "Selecione um cocho ativo desta fazenda.";
export const MSG_FORN_COCHO_INATIVO = "Este cocho está inativo e não pode ser usado em um novo fornecimento.";
export const MSG_FORN_COCHO_FAZENDA = "Este cocho não pertence à fazenda selecionada.";

export type NutricaoCochoInput = {
  fazendaId: number;
  nome: string;
  codigo?: string | null;
  tipo: string;
  pastoId?: number | null;
  localizacaoDescricao?: string | null;
  comprimentoMetros?: number | null;
  larguraMetros?: number | null;
  capacidadeKg?: number | null;
  ladosAcesso?: number | null;
  coberto?: boolean;
  observacoes?: string | null;
};

export type NutricaoCochoPastoRef = {
  id: number;
  userId: number;
  fazendaId: number;
  nome: string;
};

export type NutricaoCochoRef = {
  id: number;
  userId: number;
  fazendaId: number;
  nome: string;
  codigo?: string | null;
  status: string;
};

export function labelTipoCocho(tipo: string | null | undefined): string {
  return NUTRICAO_COCHO_TIPOS.find(t => t.value === tipo)?.label ?? tipo ?? "—";
}

export function formatarIdentificacaoCocho(nome: string, codigo?: string | null): string {
  const n = String(nome ?? "").trim() || "Cocho";
  const c = String(codigo ?? "").trim();
  return c ? `${n} (${c})` : n;
}

export function formatarLocalizacaoCocho(
  pastoNome?: string | null,
  descricao?: string | null,
): string {
  const pasto = String(pastoNome ?? "").trim();
  const ref = String(descricao ?? "").trim();
  if (pasto && ref) return `${pasto} — ${ref}`;
  return pasto || ref || "—";
}

/** Detalhe do Cocho: linha cinza do Pasto só se o secundário for diferente do nome. */
export function textoSecundarioPastoCochoDetalhe(
  nome?: string | null,
  secundario?: string | null,
): string | null {
  const principal = String(nome ?? "").trim();
  const extra = String(secundario ?? "").trim();
  if (!extra) return null;
  if (principal && extra === principal) return null;
  return extra;
}

export function parseMedidaOpcional(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function validarCochoInput(
  input: NutricaoCochoInput,
  ctx: {
    pasto?: NutricaoCochoPastoRef | null;
    codigoEmUso?: boolean;
  } = {},
): { ok: true } | { ok: false; message: string } {
  if (!(input.fazendaId > 0)) return { ok: false, message: MSG_COCHO_FAZENDA };
  if (!String(input.nome ?? "").trim()) return { ok: false, message: MSG_COCHO_NOME };
  if (!NUTRICAO_COCHO_TIPOS.some(t => t.value === input.tipo)) {
    return { ok: false, message: MSG_COCHO_TIPO };
  }

  const pastoId = Number(input.pastoId) > 0 ? Number(input.pastoId) : null;
  if (pastoId) {
    if (!ctx.pasto || ctx.pasto.id !== pastoId || ctx.pasto.fazendaId !== input.fazendaId) {
      return { ok: false, message: MSG_COCHO_PASTO };
    }
  }

  const comprimento = parseMedidaOpcional(input.comprimentoMetros);
  if (comprimento != null && !(comprimento > 0)) return { ok: false, message: MSG_COCHO_COMPRIMENTO };
  const largura = parseMedidaOpcional(input.larguraMetros);
  if (largura != null && !(largura > 0)) return { ok: false, message: MSG_COCHO_LARGURA };
  const capacidade = parseMedidaOpcional(input.capacidadeKg);
  if (capacidade != null && !(capacidade > 0)) return { ok: false, message: MSG_COCHO_CAPACIDADE };

  if (input.ladosAcesso != null) {
    if (!NUTRICAO_COCHO_LADOS.includes(input.ladosAcesso as NutricaoCochoLados)) {
      return { ok: false, message: MSG_COCHO_LADOS };
    }
  }

  if (String(input.codigo ?? "").trim() && ctx.codigoEmUso) {
    return { ok: false, message: MSG_COCHO_CODIGO };
  }

  return { ok: true };
}

export function validarCochoNoFornecimento(
  input: { fazendaId: number; cochoId?: number | null },
  cocho?: NutricaoCochoRef | null,
): { ok: true } | { ok: false; message: string } {
  if (!(Number(input.cochoId) > 0)) return { ok: true };
  if (!cocho || cocho.id !== input.cochoId) return { ok: false, message: MSG_FORN_COCHO };
  if (cocho.fazendaId !== input.fazendaId) return { ok: false, message: MSG_FORN_COCHO_FAZENDA };
  if (cocho.status !== "ativo") return { ok: false, message: MSG_FORN_COCHO_INATIVO };
  return { ok: true };
}

export function normalizarCodigoCocho(value?: string | null): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}
