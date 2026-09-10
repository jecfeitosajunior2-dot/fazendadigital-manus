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

export function formatMsgMatrizJaCobertaNesteTouro(brinco: string): string {
  return `Matriz ${brinco} já foi registrada neste touro.`;
}

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
