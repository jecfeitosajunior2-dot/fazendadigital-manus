/** Castração do Manejo Pontual — mensagens, métodos e validações puras. */

export const TIPO_SAUDE_CASTRACAO = "Castração";

export const MSG_CASTRACAO_FAZENDA = "Selecione uma Fazenda.";
export const MSG_CASTRACAO_ANIMAL = "Selecione um animal válido.";
export const MSG_CASTRACAO_MACHO = "Selecione um animal macho.";
export const MSG_CASTRACAO_INATIVO =
  "Não é possível castrar um animal vendido, morto ou inativo.";
export const MSG_CASTRACAO_DUPLICADA = "Este animal já está registrado como castrado.";
export const MSG_CASTRACAO_DATA = "Data da castração é obrigatória.";
export const MSG_CASTRACAO_DATA_INVALIDA = "Data da castração inválida.";
export const MSG_CASTRACAO_DATA_FUTURA = "A data da castração não pode ser futura.";
export const MSG_CASTRACAO_METODO = "Informe o método da castração.";
export const MSG_CASTRACAO_DESCRICAO = "Descreva o método utilizado.";
export const MSG_CASTRACAO_GENERICO = "Não foi possível registrar a castração.";
export const MSG_CASTRACAO_SUCESSO = "Castração registrada com sucesso.";

export const METODOS_CASTRACAO = [
  { value: "cirurgica", label: "Cirúrgica" },
  { value: "burdizzo", label: "Burdizzo" },
  { value: "elastrador", label: "Elastrador / anel" },
  { value: "outro", label: "Outro" },
] as const;

export type MetodoCastracao = (typeof METODOS_CASTRACAO)[number]["value"];

const METODO_SET = new Set<string>(METODOS_CASTRACAO.map(m => m.value));

export function hojeISODateLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isSexoMacho(sexo?: string | null): boolean {
  const v = (sexo ?? "").trim().toLowerCase();
  return v === "macho";
}

export function isAnimalAtivo(status?: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "ativo";
}

export function isCastradoFlag(castrado?: boolean | number | null): boolean {
  return castrado === true || castrado === 1;
}

export const CONDICOES_CASTRACAO_CADASTRO = [
  { value: "nao_informado", label: "Não informado" },
  { value: "nao_castrado", label: "Não castrado" },
  { value: "castrado", label: "Castrado" },
] as const;

export type CondicaoCastracaoCadastro = (typeof CONDICOES_CASTRACAO_CADASTRO)[number]["value"];

export type CondicaoCastracaoAtual = "castrado" | "nao_castrado" | "nao_informado";

/** Flag inicial explícita de “não castrado” (false/0). null/undefined não conta. */
export function isNaoCastradoFlag(castrado?: boolean | number | null): boolean {
  return castrado === false || castrado === 0;
}

/**
 * Condição atual do macho.
 * 1) evento válido de Castração → castrado
 * 2) estado inicial explícito (true/false)
 * 3) nada conhecido → nao_informado
 * Fêmea: null (não se aplica).
 */
export function condicaoCastracaoAtual(params: {
  sexo?: string | null;
  castrado?: boolean | number | null;
  temEventoCastracao?: boolean;
}): CondicaoCastracaoAtual | null {
  if (!isSexoMacho(params.sexo)) return null;
  if (params.temEventoCastracao || isCastradoFlag(params.castrado)) return "castrado";
  if (isNaoCastradoFlag(params.castrado)) return "nao_castrado";
  return "nao_informado";
}

/** Só macho no cadastro inicial. */
export function deveMostrarCondicaoCastracaoCadastro(sexo?: string | null): boolean {
  return isSexoMacho(sexo);
}

/**
 * Persistência do cadastro inicial.
 * Fêmea e “Não informado” → null (não envia confirmação artificial).
 */
export function resolverCastradoCadastroInicial(params: {
  sexo?: string | null;
  condicao?: CondicaoCastracaoCadastro | null;
}): boolean | null {
  if (!isSexoMacho(params.sexo)) return null;
  if (params.condicao === "castrado") return true;
  if (params.condicao === "nao_castrado") return false;
  return null;
}

/** Trocar Sexo no formulário sempre volta ao default, sem recuperar valor oculto. */
export function condicaoCastracaoAposTrocaSexo(): CondicaoCastracaoCadastro {
  return "nao_informado";
}

export function isMetodoCastracao(value?: string | null): value is MetodoCastracao {
  return Boolean(value && METODO_SET.has(value));
}

export function labelMetodoCastracao(value?: string | null): string {
  const found = METODOS_CASTRACAO.find(m => m.value === value);
  if (found) return found.label;
  const byLabel = METODOS_CASTRACAO.find(
    m => m.label.toLowerCase() === (value ?? "").trim().toLowerCase(),
  );
  return byLabel?.label || (value ?? "").trim();
}

export function exigeDescricaoMetodo(metodo?: string | null): boolean {
  return metodo === "outro";
}

export function isRegistroCastracao(tipo?: string | null): boolean {
  const n = (tipo ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return n === "castracao";
}

export function assertDataCastracaoNaoFutura(
  dataCastracao: string,
  hojeISO = hojeISODateLocal(),
): { ok: true } | { ok: false; message: string } {
  const data = dataCastracao.trim().slice(0, 10);
  if (!data) return { ok: false, message: MSG_CASTRACAO_DATA };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, message: MSG_CASTRACAO_DATA_INVALIDA };
  }
  if (data > hojeISO) return { ok: false, message: MSG_CASTRACAO_DATA_FUTURA };
  return { ok: true };
}

export function validarCastracaoInput(input: {
  fazendaId?: number | null;
  animalId?: number | null;
  dataCastracao?: string | null;
  metodo?: string | null;
  descricaoMetodo?: string | null;
}): { ok: true } | { ok: false; message: string } {
  if (input.fazendaId == null || input.fazendaId <= 0) {
    return { ok: false, message: MSG_CASTRACAO_FAZENDA };
  }
  if (input.animalId == null || input.animalId <= 0) {
    return { ok: false, message: MSG_CASTRACAO_ANIMAL };
  }
  const dataOk = assertDataCastracaoNaoFutura(input.dataCastracao ?? "");
  if (!dataOk.ok) return dataOk;
  if (!isMetodoCastracao(input.metodo)) {
    return { ok: false, message: MSG_CASTRACAO_METODO };
  }
  if (exigeDescricaoMetodo(input.metodo) && !(input.descricaoMetodo ?? "").trim()) {
    return { ok: false, message: MSG_CASTRACAO_DESCRICAO };
  }
  return { ok: true };
}

export function validarAnimalParaCastracao(animal: {
  sexo?: string | null;
  status?: string | null;
  castrado?: boolean | number | null;
}): { ok: true } | { ok: false; message: string } {
  if (!isSexoMacho(animal.sexo)) return { ok: false, message: MSG_CASTRACAO_MACHO };
  if (!isAnimalAtivo(animal.status)) return { ok: false, message: MSG_CASTRACAO_INATIVO };
  if (isCastradoFlag(animal.castrado)) return { ok: false, message: MSG_CASTRACAO_DUPLICADA };
  return { ok: true };
}

export function jaPossuiCastracaoRegistrada(
  registros: Array<{ tipo?: string | null }>,
): boolean {
  return registros.some(r => isRegistroCastracao(r.tipo));
}

export function filtrarMachosElegiveisCastracao<
  T extends {
    sexo?: string | null;
    status?: string | null;
    castrado?: boolean | number | null;
  },
>(animais: T[]): T[] {
  return animais.filter(
    a => isSexoMacho(a.sexo) && isAnimalAtivo(a.status) && !isCastradoFlag(a.castrado),
  );
}

export function podeSalvarCastracao(input: {
  fazendaId?: number | null;
  animalId?: number | null;
  dataCastracao?: string | null;
  metodo?: string | null;
  descricaoMetodo?: string | null;
}): boolean {
  return validarCastracaoInput(input).ok;
}

export function montarPersistenciaCastracao(input: {
  metodo: MetodoCastracao;
  descricaoMetodo?: string | null;
  observacoes?: string | null;
}): { tipo: string; medicamento: string; descricao?: string; observacoes?: string } {
  const medicamento = labelMetodoCastracao(input.metodo);
  const descricao = exigeDescricaoMetodo(input.metodo)
    ? input.descricaoMetodo?.trim() || undefined
    : undefined;
  const observacoes = observacaoPersistivel(input.observacoes);
  return { tipo: TIPO_SAUDE_CASTRACAO, medicamento, descricao, observacoes };
}

export function formatHistoricoCastracao(reg: {
  dataRegistro?: string | Date | null;
  medicamento?: string | null;
  descricao?: string | null;
  observacoes?: string | null;
}): {
  titulo: string;
  metodoLinha: string;
  descricaoLinha?: string;
  observacoesLinha?: string;
} {
  const metodo = (reg.medicamento ?? "").trim() || "—";
  const extra = (reg.descricao ?? "").trim();
  const obs = observacaoPersistivel(reg.observacoes);
  return {
    titulo: TIPO_SAUDE_CASTRACAO,
    metodoLinha: `Método: ${metodo}`,
    descricaoLinha: extra ? extra : undefined,
    observacoesLinha: obs ? `Observações: ${obs}` : undefined,
  };
}

const PLACEHOLDERS_HISTORICO = new Set([
  "opcional",
  "selecione",
  "digite...",
  "não informado",
  "nao informado",
]);

/** Observação gravável: vazio e placeholder de formulário não entram no histórico. */
export function observacaoPersistivel(raw?: string | null): string | undefined {
  const t = (raw ?? "").trim();
  if (!t) return undefined;
  if (PLACEHOLDERS_HISTORICO.has(t.toLowerCase())) return undefined;
  return t;
}

/** Ausência no histórico sanitário: sempre "—". Nunca placeholder de formulário. */
export function textoHistoricoOuTraco(raw?: string | null): string {
  return observacaoPersistivel(raw) ?? "—";
}

/** Texto da coluna Detalhes na tabela Sanitário (método, não produto). */
export function detalheCastracaoSanitario(reg: {
  medicamento?: string | null;
  descricao?: string | null;
}): { texto: string; titulo?: string } {
  const metodo = (reg.medicamento ?? "").trim();
  const extra = (reg.descricao ?? "").trim();
  if (!metodo && !extra) return { texto: "" };
  const ehOutro = metodo.toLowerCase() === "outro";
  const texto =
    extra && ehOutro
      ? `Método: Outro\nTécnica: ${extra}`
      : extra
        ? `Método: ${metodo}\nTécnica: ${extra}`
        : `Método: ${metodo}`;
  return {
    texto,
    titulo: extra ? `Método: ${metodo} — ${extra}` : `Método: ${metodo}`,
  };
}

/** Coluna Detalhes: método na Castração; produto nos demais registros. */
export function formatDetalhesColunaSanitario(reg: {
  tipo?: string | null;
  medicamento?: string | null;
  descricao?: string | null;
}): string {
  if (isRegistroCastracao(reg.tipo)) {
    return detalheCastracaoSanitario(reg).texto || "—";
  }
  const produto =
    (reg.medicamento && String(reg.medicamento).trim()) ||
    (reg.descricao && String(reg.descricao).trim()) ||
    "";
  return textoHistoricoOuTraco(produto);
}

/** Células da Castração na tabela Sanitário: Dose/Via/Custo/obs vazia = —. */
export function celulasCastracaoNaTabelaSanitario(reg: {
  medicamento?: string | null;
  descricao?: string | null;
  observacoes?: string | null;
}): {
  detalhes: string;
  dose: string;
  via: string;
  custo: string;
  observacoes: string;
} {
  return {
    detalhes: detalheCastracaoSanitario(reg).texto || "—",
    dose: "—",
    via: "—",
    custo: "—",
    observacoes: textoHistoricoOuTraco(reg.observacoes),
  };
}

/** Resumo da ficha: só macho. Sim / Não / — . Fêmea: null (ocultar). */
export function estadoCastradoResumo(params: {
  sexo?: string | null;
  castrado?: boolean | number | null;
  temEventoCastracao?: boolean;
}): "Sim" | "Não" | "—" | null {
  const condicao = condicaoCastracaoAtual(params);
  if (condicao == null) return null;
  if (condicao === "castrado") return "Sim";
  if (condicao === "nao_castrado") return "Não";
  return "—";
}

/** Somente leitura (Editar Animal). Mesma regra da ficha. Fêmea: null (ocultar). */
export function textoCastradoSomenteLeitura(params: {
  sexo?: string | null;
  castrado?: boolean | number | null;
  temEventoCastracao?: boolean;
}): "Sim" | "Não" | "—" | null {
  return estadoCastradoResumo(params);
}
