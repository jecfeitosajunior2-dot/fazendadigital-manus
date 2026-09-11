/** Cadastro superficial de animal no curral (JetBov). */

export const MSG_CURRAL_CADASTRO_BRINCO = "Informe o brinco visual.";
export const MSG_CURRAL_CADASTRO_SEXO = "Selecione o sexo.";
export const MSG_CURRAL_CADASTRO_CATEGORIA = "Selecione a categoria.";
export const MSG_CURRAL_CADASTRO_SUCESSO = "Animal cadastrado.";

export type SexoCadastroCurral = "macho" | "femea";

export function categoriaPadraoCadastroCurral(sexo: SexoCadastroCurral): string {
  return sexo === "macho" ? "Bezerro" : "Bezerra";
}

export function validarCadastroSuperficialCurral(input: {
  brinco?: string | null;
  sexo?: SexoCadastroCurral | null;
  categoria?: string | null;
  fazendaId?: number | null;
}): { ok: true } | { ok: false; message: string } {
  if (input.fazendaId == null || input.fazendaId <= 0) {
    return { ok: false, message: "Selecione a fazenda da sessão." };
  }
  if (!(input.brinco ?? "").trim()) {
    return { ok: false, message: MSG_CURRAL_CADASTRO_BRINCO };
  }
  if (!input.sexo) {
    return { ok: false, message: MSG_CURRAL_CADASTRO_SEXO };
  }
  if (!(input.categoria ?? "").trim()) {
    return { ok: false, message: MSG_CURRAL_CADASTRO_CATEGORIA };
  }
  return { ok: true };
}

export function buildPayloadCadastroSuperficialCurral(input: {
  fazendaId: number;
  dataEntrada: string;
  brinco: string;
  sexo: SexoCadastroCurral;
  categoria: string;
  brincoEletronico?: string | null;
  loteId?: number | null;
  pesoEntrada?: string | null;
  dataNascimento?: string | null;
  observacoes?: string | null;
}) {
  const brinco = input.brinco.trim();
  const rfid = (input.brincoEletronico ?? "").trim();
  const peso = (input.pesoEntrada ?? "").trim();
  const nasc = (input.dataNascimento ?? "").trim();
  const obs = (input.observacoes ?? "").trim();
  return {
    fazendaId: input.fazendaId,
    nome: brinco,
    brinco,
    brincoEletronico: rfid || undefined,
    sexo: input.sexo,
    categoria: input.categoria.trim(),
    loteId: input.loteId != null && input.loteId > 0 ? input.loteId : undefined,
    dataEntrada: input.dataEntrada,
    dataNascimento: nasc || undefined,
    pesoEntrada: peso || undefined,
    observacoes: obs ? `Cadastro curral. ${obs}` : "Cadastro curral.",
  };
}
