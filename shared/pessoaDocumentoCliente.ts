import {
  documentosCpfCnpjIguais,
  isCpfCnpjValido,
  mesmoDocumentoDigitado,
  normalizeCpfCnpj,
} from "./cpfCnpj";

export const MSG_COMPRADOR_DOC_INVALIDO = "Informe um CPF ou CNPJ válido.";
export const MSG_COMPRADOR_DOC_DUPLICADO = "Já existe um comprador cadastrado com este CPF/CNPJ.";
export const MSG_COMPRADOR_DOC_INATIVO =
  "Já existe um comprador inativo com este CPF/CNPJ. Reative o cadastro existente.";

export type PessoaDocumentoRow = {
  id: number;
  userId: number;
  tipo: string;
  documento?: string | null;
  ativo?: boolean | null;
};

export type ResultadoDocumentoCliente = { ok: true } | { ok: false; message: string };

function ehCliente(tipo?: string | null): boolean {
  return tipo === "cliente";
}

export function encontrarCompradorMesmoDocumento(
  existentes: ReadonlyArray<PessoaDocumentoRow>,
  userId: number,
  documento: string | null | undefined,
  excluirId?: number,
): PessoaDocumentoRow | undefined {
  const alvo = normalizeCpfCnpj(documento);
  if (!alvo) return undefined;
  return existentes.find(row => {
    if (row.userId !== userId) return false;
    if (!ehCliente(row.tipo)) return false;
    if (excluirId != null && row.id === excluirId) return false;
    return documentosCpfCnpjIguais(row.documento, alvo);
  });
}

function bloquearDuplicado(existente: PessoaDocumentoRow | undefined): ResultadoDocumentoCliente {
  if (!existente) return { ok: true };
  if (existente.ativo === false) return { ok: false, message: MSG_COMPRADOR_DOC_INATIVO };
  return { ok: false, message: MSG_COMPRADOR_DOC_DUPLICADO };
}

export function avaliarDocumentoClienteCreate(input: {
  userId: number;
  tipo: string;
  documento?: string | null;
  existentes: ReadonlyArray<PessoaDocumentoRow>;
}): ResultadoDocumentoCliente {
  if (!ehCliente(input.tipo)) return { ok: true };
  if (!isCpfCnpjValido(input.documento)) {
    return { ok: false, message: MSG_COMPRADOR_DOC_INVALIDO };
  }
  return bloquearDuplicado(
    encontrarCompradorMesmoDocumento(input.existentes, input.userId, input.documento),
  );
}

export function avaliarDocumentoClienteUpdate(input: {
  userId: number;
  id: number;
  tipoAtual: string;
  tipoNovo?: string;
  documentoAtual?: string | null;
  documentoNovo?: string | null;
  documentoInformado: boolean;
  existentes: ReadonlyArray<PessoaDocumentoRow>;
}): ResultadoDocumentoCliente {
  const tipo = input.tipoNovo ?? input.tipoAtual;
  if (!ehCliente(tipo)) return { ok: true };
  if (!input.documentoInformado) return { ok: true };

  if (mesmoDocumentoDigitado(input.documentoNovo, input.documentoAtual)) {
    return { ok: true };
  }

  if (!isCpfCnpjValido(input.documentoNovo)) {
    return { ok: false, message: MSG_COMPRADOR_DOC_INVALIDO };
  }

  return bloquearDuplicado(
    encontrarCompradorMesmoDocumento(input.existentes, input.userId, input.documentoNovo, input.id),
  );
}

/** Front: novo cadastro exige válido; legado inválido pode permanecer se o usuário não mudar os dígitos. */
export function documentoPodeSalvarComprador(input: {
  documento: string;
  documentoOriginal?: string | null;
  editando: boolean;
}): boolean {
  if (isCpfCnpjValido(input.documento)) return true;
  if (input.editando && mesmoDocumentoDigitado(input.documento, input.documentoOriginal)) {
    return true;
  }
  return false;
}
