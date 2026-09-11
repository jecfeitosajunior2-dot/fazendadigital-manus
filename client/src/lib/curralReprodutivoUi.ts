/** Resultados principais do DG no curral (toque rápido). */
export const DG_RESULTADOS_CURRAL = ["Prenha", "Vazia"] as const;

/** Resultados avançados do DG quando Prenha/Vazia não se aplicam. */
export const DG_RESULTADOS_AVANCADOS = ["Inconclusivo", "Repetir", "Outro"] as const;

/** Atalhos opcionais de resultado para registro de cio no curral. */
export const CIO_RESULTADOS_CURRAL = ["Observado", "Repetir", "Outro"] as const;

export const PARTO_RESULTADOS_CURRAL = [
  "Normal",
  "Com assistência",
  "Natimorto",
  "Outro",
] as const;

export const ABORTO_RESULTADOS_CURRAL = ["Confirmado", "Suspeito", "Outro"] as const;

/** Resultados principais do exame andrológico (macho). */
export const EXAME_ANDROLOGICO_RESULTADOS_CURRAL = ["Apto", "Inapto"] as const;

/** Reutiliza opções avançadas do DG (Inconclusivo, Repetir, Outro). */
export const EXAME_ANDROLOGICO_AVANCADOS_CURRAL = DG_RESULTADOS_AVANCADOS;

export const COLETA_SEMEN_RESULTADOS_CURRAL = [
  "Coleta realizada",
  "Coleta parcial",
  "Coleta não realizada",
  "Outro",
] as const;

export function isDgResultadoCurralPrincipal(resultado: string): boolean {
  return (DG_RESULTADOS_CURRAL as readonly string[]).includes(resultado);
}

export function isDgResultadoCurralAvancado(resultado: string): boolean {
  return (DG_RESULTADOS_AVANCADOS as readonly string[]).includes(resultado);
}

export function isExameAndrologicoResultadoPrincipal(resultado: string): boolean {
  return (EXAME_ANDROLOGICO_RESULTADOS_CURRAL as readonly string[]).includes(resultado);
}

export function isExameAndrologicoResultadoAvancado(resultado: string): boolean {
  return (EXAME_ANDROLOGICO_AVANCADOS_CURRAL as readonly string[]).includes(resultado);
}

/** Exibe bloco avançado do DG fora de “Mais detalhes” (resultado obrigatório). */
export function showDgResultadoAvancadoCurral(tipo: string, resultado: string): boolean {
  return tipo === "Diagnóstico de prenhez" && !isDgResultadoCurralPrincipal(resultado);
}

/** Exibe bloco avançado do exame andrológico quando Apto/Inapto não se aplicam. */
export function showExameAndrologicoAvancadoCurral(tipo: string, resultado: string): boolean {
  return tipo === "Exame andrológico" && !isExameAndrologicoResultadoPrincipal(resultado);
}

export function showCioResultadoCurral(tipo: string): boolean {
  return tipo === "Cio";
}

export function showExameAndrologicoCurral(tipo: string): boolean {
  return tipo === "Exame andrológico";
}

export function showColetaSemenCurral(tipo: string): boolean {
  return tipo === "Coleta de sêmen";
}

/** Tipos em que o curral permite vários registros no mesmo animal antes de concluir (estilo sanitário). */
export function usesCurralReproMultiRegistro(tipo: string): boolean {
  return tipo === "Cobertura realizada" || tipo === "Estação de monta";
}

export { formatMsgMatrizJaRegistradaNesteTouro as formatMsgMatrizJaCobertaNesteTouro } from "@shared/reproEspelhoDuplicata";

export function isMatrizJaRegistradaCoberturaCurral(
  matrizId: number,
  matrizesRegistradasIds: ReadonlySet<number> | readonly number[],
): boolean {
  if (matrizesRegistradasIds instanceof Set) {
    return matrizesRegistradasIds.has(matrizId);
  }
  return matrizesRegistradasIds.includes(matrizId);
}

export function usesCurralResultadoToggle(tipo: string): boolean {
  return (
    tipo === "Parto" ||
    tipo === "Aborto" ||
    tipo === "Coleta de sêmen"
  );
}

export function getCurralResultadoToggleOptions(tipo: string): readonly string[] {
  switch (tipo) {
    case "Cio":
      return CIO_RESULTADOS_CURRAL;
    case "Parto":
      return PARTO_RESULTADOS_CURRAL;
    case "Aborto":
      return ABORTO_RESULTADOS_CURRAL;
    case "Diagnóstico de prenhez":
      return DG_RESULTADOS_AVANCADOS;
    case "Coleta de sêmen":
      return COLETA_SEMEN_RESULTADOS_CURRAL;
    case "Exame andrológico":
      return EXAME_ANDROLOGICO_AVANCADOS_CURRAL;
    default:
      return [];
  }
}

/** Colunas do grid de botões conforme quantidade de opções. */
export function curralResultadoToggleGridClass(optionCount: number): string {
  if (optionCount <= 2) return "grid-cols-2";
  if (optionCount === 3) return "grid-cols-3";
  return "grid-cols-2";
}

/** Resumo do conteúdo recolhido em “Mais detalhes”. */
export function maisDetalhesResumoCurral(tipo: string): string {
  if (tipo === "Inseminação") return "Inseminador, ECC, observações…";
  return "Observações…";
}

/** Dica curta ao escolher tipo masculino (curral ou manejo pontual). */
export function getReproMachoTipoHint(tipo: string): string | null {
  if (tipo === "Estação de monta") {
    return "Touro no Lote/Piquete — Registrar exposição à monta nas matrizes (Fluxo: IATF - Monta - DG) ou (Monta - DG).";
  }
  if (tipo === "Cobertura realizada") {
    return "Touro - matriz no brete - Registrar quando souber quem cobriu quem.";
  }
  return null;
}

/** Estação de monta primeiro na lista do curral (fluxo mais comum pós-IATF). */
export function orderReproTipoOptionsMachoCurral(options: readonly string[]): string[] {
  const preferidos = ["Estação de monta", "Cobertura realizada"];
  const cabeca = preferidos.filter(p => options.includes(p));
  const cauda = options.filter(o => !cabeca.includes(o));
  return [...cabeca, ...cauda];
}

export function getCurralReproRegistrarButtonLabel(tipo: string, isSaving: boolean): string {
  if (isSaving) return "Salvando…";
  if (tipo === "Estação de monta") return "Registrar estação";
  if (tipo === "Cobertura realizada") return "Registrar cobertura";
  if (usesCurralReproMultiRegistro(tipo)) return "Registrar cobertura";
  return "Registrar reprodutivo";
}

export function getCurralReproRegistrosContadorTexto(
  tipo: string,
  qtd: number,
): string | null {
  if (qtd <= 0) return null;
  if (tipo === "Estação de monta") {
    return qtd === 1
      ? "1 matriz em estação neste touro."
      : `${qtd} matrizes em estação neste touro.`;
  }
  if (tipo === "Cobertura realizada") {
    return qtd === 1
      ? "1 cobertura registrada neste touro."
      : `${qtd} coberturas registradas neste touro.`;
  }
  return null;
}

export function getCurralReproRodape(
  tipo: string,
  coberturaSelecaoModo: string,
  qtdRegistrada: number,
): string {
  if (tipo === "Estação de monta") {
    return "Alocar touro ao lote registra exposição à monta nas matrizes. Conclua o touro ao terminar.";
  }
  if (tipo === "Cobertura realizada" && coberturaSelecaoModo === "lote") {
    return "Registre as matrizes cobertas do lote. Conclua o touro ao terminar — ou conclua sem registrar se não houve cobertura.";
  }
  if (tipo === "Cobertura realizada" || qtdRegistrada > 0) {
    return "Registre cada matriz coberta. Ao terminar, conclua o touro — ou conclua sem registrar se não houve cobertura nesta passagem.";
  }
  return "Registre o manejo reprodutivo. Ao terminar, conclua o animal — ou conclua sem registrar se não houve manejo nesta passagem.";
}

/** Toast após registro único no curral — mantém o animal na tela. */
export function getCurralReproPosRegistroUnicoToast(
  resumo: string,
  animalSexo: string | null | undefined,
): string {
  const concluir =
    animalSexo === "macho" ? "conclua o touro" : "conclua o animal";
  return `${resumo} · registre outro manejo ou ${concluir}.`;
}

export function getCurralReproMultiRegistroPendingError(tipo: string): string {
  if (tipo === "Estação de monta") {
    return "Há dados não registrados. Registre a estação ou limpe o formulário.";
  }
  if (tipo === "Cobertura realizada") {
    return "Há dados não registrados. Registre a cobertura ou limpe o formulário.";
  }
  return "Há dados não registrados. Registre o manejo ou limpe o formulário.";
}
