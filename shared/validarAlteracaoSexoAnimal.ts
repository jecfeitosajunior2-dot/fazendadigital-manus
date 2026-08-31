/**
 * Correção cadastral de Sexo no Editar Animal.
 *
 * Não cria Manejo nem histórico artificial.
 * Bloqueia só quando já existe fato estrutural biologicamente incompatível.
 */

import { getCategoriasPorSexo, todasAsCategorias } from "./animal-types";
import { isCastradoFlag, isRegistroCastracao } from "./castracaoManejo";
import { unpackReproObservacoes } from "./reproRegistroMeta";

export const SEXO_MACHO = "macho" as const;
export const SEXO_FEMEA = "femea" as const;

export type SexoPersistido = typeof SEXO_MACHO | typeof SEXO_FEMEA;

/** Tipos femininos reais do projeto que tornam Fêmea → Macho incompatível. */
export const REPRO_TIPOS_BLOQUEIAM_FEMEA_PARA_MACHO = [
  "Cio",
  "Cobertura",
  "Inseminação",
  "Diagnóstico de prenhez",
  "Parto",
  "Aborto",
] as const;

/** Tipos masculinos reais do projeto que tornam Macho → Fêmea incompatível. */
export const REPRO_TIPOS_BLOQUEIAM_MACHO_PARA_FEMEA = [
  "Exame andrológico",
  "Coleta de sêmen",
  "Cobertura realizada",
  "Uso como reprodutor",
  "Retirada da reprodução",
] as const;

/** Neutros: Desmama, Outro, pesagem, sanitário comum, identificação, lote, etc. */

export type CodigoBloqueioAlteracaoSexo =
  | "HISTORICO_CASTRACAO"
  | "ESTADO_INICIAL_CASTRADO"
  | "PATERNIDADE"
  | "REPRO_EXAME_ANDROLOGICO"
  | "REPRO_COLETA_SEMEN"
  | "REPRO_COBERTURA_REALIZADA"
  | "REPRO_USO_REPRODUTOR"
  | "REPRO_RETIRADA_REPRODUCAO"
  | "REPRODUTOR_ESTRUTURAL"
  | "MATERNIDADE"
  | "REPRO_PARTO"
  | "REPRO_ABORTO"
  | "REPRO_DIAGNOSTICO_PRENHEZ"
  | "REPRO_INSEMINACAO"
  | "REPRO_COBERTURA"
  | "REPRO_CIO"
  | "COBERTURA_ALVO_FEMEA"
  | "HISTORICO_INCOMPATIVEL";

export type ResultadoValidacaoAlteracaoSexo =
  | { permitido: true }
  | { permitido: false; codigo: CodigoBloqueioAlteracaoSexo; mensagem: string };

export type EvidenciasAlteracaoSexo = {
  temEventoCastracao: boolean;
  castradoInicialExplicito: boolean;
  vinculadoComoPai: boolean;
  vinculadoComoMae: boolean;
  tiposReproComoAlvo: readonly string[];
  vinculadoComoMachoEstrutural: boolean;
  vinculadoComoFemeaEmCoberturaAlvo: boolean;
};

export type ReproEvidenciaRow = {
  tipo?: string | null;
  femeaId?: number | null;
  machoId?: number | null;
  observacoes?: string | null;
};

const FEMEA_TIPO_SET = new Set<string>(REPRO_TIPOS_BLOQUEIAM_FEMEA_PARA_MACHO);
const MACHO_TIPO_SET = new Set<string>(REPRO_TIPOS_BLOQUEIAM_MACHO_PARA_FEMEA);

export const MSG_BLOQUEIO_SEXO_GENERICA =
  "Não é possível alterar o sexo deste animal porque existem registros históricos incompatíveis com a alteração.";

export const MSG_CAMPOS_OBRIGATORIOS_DESTAQUE =
  "Preencha os campos obrigatórios em destaque.";

const MSG_GENERICA = MSG_BLOQUEIO_SEXO_GENERICA;

export function normalizarSexoAnimal(sexo?: string | null): SexoPersistido | null {
  const v = (sexo ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (v === "macho") return SEXO_MACHO;
  if (v === "femea") return SEXO_FEMEA;
  return null;
}

export function precisaValidarAlteracaoSexo(
  sexoAtual?: string | null,
  novoSexo?: string | null,
): boolean {
  if (novoSexo == null || novoSexo === "") return false;
  const atual = normalizarSexoAnimal(sexoAtual);
  const novo = normalizarSexoAnimal(novoSexo);
  if (!atual || !novo) return false;
  return atual !== novo;
}

export function evidenciasVazias(): EvidenciasAlteracaoSexo {
  return {
    temEventoCastracao: false,
    castradoInicialExplicito: false,
    vinculadoComoPai: false,
    vinculadoComoMae: false,
    tiposReproComoAlvo: [],
    vinculadoComoMachoEstrutural: false,
    vinculadoComoFemeaEmCoberturaAlvo: false,
  };
}

function temTipoAlvo(tipos: readonly string[], tipo: string): boolean {
  return tipos.some(t => (t ?? "").trim() === tipo);
}

function animalEstaEmCoberturaAlvoEstrutural(
  animalId: number,
  observacoes?: string | null,
): boolean {
  const ids = unpackReproObservacoes(observacoes).coberturaAlvo?.animalIds ?? [];
  return ids.some(id => Number(id) === animalId);
}

/**
 * Monta evidências a partir de linhas já carregadas (sem I/O).
 * Genealogia textual (`pai`/`mae`) é ignorada de propósito.
 */
export function coletarEvidenciasAlteracaoSexo(input: {
  animalId: number;
  castradoAtual?: boolean | number | null;
  saudeTipos?: readonly string[];
  descendentes?: readonly { paiId?: number | null; maeId?: number | null }[];
  reproRegistros?: readonly ReproEvidenciaRow[];
}): EvidenciasAlteracaoSexo {
  const animalId = Number(input.animalId);
  const tiposAlvo: string[] = [];
  let vinculadoComoMachoEstrutural = false;
  let vinculadoComoFemeaEmCoberturaAlvo = false;

  for (const reg of input.reproRegistros ?? []) {
    const tipo = (reg.tipo ?? "").trim();
    const femeaId = reg.femeaId == null ? null : Number(reg.femeaId);
    const machoId = reg.machoId == null ? null : Number(reg.machoId);
    if (femeaId === animalId && tipo) tiposAlvo.push(tipo);
    if (machoId === animalId && femeaId !== animalId) {
      vinculadoComoMachoEstrutural = true;
    }
    if (tipo === "Cobertura realizada" && animalEstaEmCoberturaAlvoEstrutural(animalId, reg.observacoes)) {
      vinculadoComoFemeaEmCoberturaAlvo = true;
    }
  }

  return {
    temEventoCastracao: (input.saudeTipos ?? []).some(t => isRegistroCastracao(t)),
    castradoInicialExplicito: isCastradoFlag(input.castradoAtual),
    vinculadoComoPai: (input.descendentes ?? []).some(d => Number(d.paiId) === animalId),
    vinculadoComoMae: (input.descendentes ?? []).some(d => Number(d.maeId) === animalId),
    tiposReproComoAlvo: tiposAlvo,
    vinculadoComoMachoEstrutural,
    vinculadoComoFemeaEmCoberturaAlvo,
  };
}

function bloquear(
  codigo: CodigoBloqueioAlteracaoSexo,
  mensagem: string,
): ResultadoValidacaoAlteracaoSexo {
  return { permitido: false, codigo, mensagem };
}

function validarMachoParaFemea(
  ev: EvidenciasAlteracaoSexo,
): ResultadoValidacaoAlteracaoSexo {
  if (ev.temEventoCastracao) {
    return bloquear(
      "HISTORICO_CASTRACAO",
      "Não é possível alterar o sexo para Fêmea porque este animal possui registro de castração.",
    );
  }
  if (ev.castradoInicialExplicito) {
    return bloquear(
      "ESTADO_INICIAL_CASTRADO",
      "Não é possível alterar o sexo para Fêmea porque este animal já está registrado como castrado.",
    );
  }
  if (ev.vinculadoComoPai) {
    return bloquear(
      "PATERNIDADE",
      "Não é possível alterar o sexo para Fêmea porque este animal está vinculado como pai de descendentes.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Exame andrológico")) {
    return bloquear(
      "REPRO_EXAME_ANDROLOGICO",
      "Não é possível alterar o sexo para Fêmea porque este animal possui registro de exame andrológico.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Coleta de sêmen")) {
    return bloquear(
      "REPRO_COLETA_SEMEN",
      "Não é possível alterar o sexo para Fêmea porque este animal possui registro de coleta de sêmen.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Cobertura realizada")) {
    return bloquear(
      "REPRO_COBERTURA_REALIZADA",
      "Não é possível alterar o sexo para Fêmea porque este animal foi vinculado como reprodutor em um registro de cobertura.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Uso como reprodutor")) {
    return bloquear(
      "REPRO_USO_REPRODUTOR",
      "Não é possível alterar o sexo para Fêmea porque este animal possui registro de uso como reprodutor.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Retirada da reprodução")) {
    return bloquear(
      "REPRO_RETIRADA_REPRODUCAO",
      "Não é possível alterar o sexo para Fêmea porque este animal possui registro de retirada da reprodução.",
    );
  }
  if (ev.vinculadoComoMachoEstrutural) {
    return bloquear(
      "REPRODUTOR_ESTRUTURAL",
      "Não é possível alterar o sexo para Fêmea porque este animal foi vinculado como reprodutor em um registro reprodutivo.",
    );
  }
  return { permitido: true };
}

function validarFemeaParaMacho(
  ev: EvidenciasAlteracaoSexo,
): ResultadoValidacaoAlteracaoSexo {
  if (ev.vinculadoComoMae) {
    return bloquear(
      "MATERNIDADE",
      "Não é possível alterar o sexo para Macho porque este animal está vinculado como mãe de descendentes.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Parto")) {
    return bloquear(
      "REPRO_PARTO",
      "Não é possível alterar o sexo para Macho porque este animal possui registro de parto.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Aborto")) {
    return bloquear(
      "REPRO_ABORTO",
      "Não é possível alterar o sexo para Macho porque este animal possui registro de aborto.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Diagnóstico de prenhez")) {
    return bloquear(
      "REPRO_DIAGNOSTICO_PRENHEZ",
      "Não é possível alterar o sexo para Macho porque este animal possui registro de diagnóstico de gestação.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Inseminação")) {
    return bloquear(
      "REPRO_INSEMINACAO",
      "Não é possível alterar o sexo para Macho porque este animal possui registro de inseminação.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Cobertura")) {
    return bloquear(
      "REPRO_COBERTURA",
      "Não é possível alterar o sexo para Macho porque este animal possui registro de cobertura.",
    );
  }
  if (temTipoAlvo(ev.tiposReproComoAlvo, "Cio")) {
    return bloquear(
      "REPRO_CIO",
      "Não é possível alterar o sexo para Macho porque este animal possui registro de cio.",
    );
  }
  if (ev.vinculadoComoFemeaEmCoberturaAlvo) {
    return bloquear(
      "COBERTURA_ALVO_FEMEA",
      "Não é possível alterar o sexo para Macho porque este animal foi vinculado como fêmea em um registro de cobertura.",
    );
  }
  return { permitido: true };
}

export function validarAlteracaoSexoAnimal(params: {
  sexoAtual?: string | null;
  novoSexo?: string | null;
  evidencias?: EvidenciasAlteracaoSexo;
}): ResultadoValidacaoAlteracaoSexo {
  if (!precisaValidarAlteracaoSexo(params.sexoAtual, params.novoSexo)) {
    return { permitido: true };
  }

  const atual = normalizarSexoAnimal(params.sexoAtual);
  const novo = normalizarSexoAnimal(params.novoSexo);
  const ev = params.evidencias ?? evidenciasVazias();

  if (atual === SEXO_MACHO && novo === SEXO_FEMEA) {
    return validarMachoParaFemea(ev);
  }
  if (atual === SEXO_FEMEA && novo === SEXO_MACHO) {
    return validarFemeaParaMacho(ev);
  }

  return bloquear("HISTORICO_INCOMPATIVEL", MSG_GENERICA);
}

/** No Editar Animal a categoria não pode ser apagada só porque o sexo mudou. */
export function categoriaAposTrocaSexoNoFormulario(params: {
  modo: "create" | "edit";
  categoriaAtual: string;
}): string {
  if (params.modo === "edit") return params.categoriaAtual;
  return "";
}

/** Mantém o valor atual visível se ele ainda não estiver na lista do novo sexo. */
export function opcoesCategoriaComValorAtual(sexoLabel: string, categoriaAtual: string): string[] {
  const base = sexoLabel ? getCategoriasPorSexo(sexoLabel) : todasAsCategorias();
  const atual = categoriaAtual.trim();
  if (atual && !base.includes(atual)) return [atual, ...base];
  return [...base];
}

export function isMensagemBloqueioAlteracaoSexo(message?: string | null): boolean {
  const m = (message ?? "").trim();
  return m.startsWith("Não é possível alterar o sexo");
}

/**
 * Precedência do aviso ao salvar o Editar Animal.
 * Required local ganha se o formulário estiver incompleto.
 * Bloqueio de Sexo do backend nunca vira o toast genérico.
 */
export function toastErroSalvarEditarAnimal(params: {
  temErroRequired: boolean;
  mensagemBackend?: string | null;
}): { tipo: "required" | "sexo" | "backend"; mensagem: string } {
  if (params.temErroRequired) {
    return { tipo: "required", mensagem: MSG_CAMPOS_OBRIGATORIOS_DESTAQUE };
  }
  const backend = (params.mensagemBackend ?? "").trim();
  if (isMensagemBloqueioAlteracaoSexo(backend)) {
    return { tipo: "sexo", mensagem: backend };
  }
  if (backend) {
    return { tipo: "backend", mensagem: backend };
  }
  return { tipo: "sexo", mensagem: MSG_BLOQUEIO_SEXO_GENERICA };
}

export function isTipoReproBloqueiaMachoParaFemea(tipo?: string | null): boolean {
  return MACHO_TIPO_SET.has((tipo ?? "").trim());
}

export function isTipoReproBloqueiaFemeaParaMacho(tipo?: string | null): boolean {
  return FEMEA_TIPO_SET.has((tipo ?? "").trim());
}
