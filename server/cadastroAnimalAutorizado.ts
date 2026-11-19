import { TRPCError } from "@trpc/server";
import type { IdentidadeUsuario, PapelConta, SituacaoUsuario } from "./_core/identidadeSessao";
import { loginPermitido } from "./_core/identidadeSessao";
import type { VinculoFazenda } from "./acessoFazendas";
import { buildAnimalInsertRow, type AnimalFormInput, type LinhaInsercaoAnimal } from "./animalInsertRow";
import { autorizarOperacao, type MotivoOperacional, type ResultadoOperacional } from "./contextoOperacional";
import { buildBrincoAtivoConflitoMessage } from "../shared/brincoAtivo";
import { findActiveBrincoConflict } from "../shared/brincoAtivo";
import { buildEntradaInicialLoteMovimentacao, loteIdEfetivoParaHistorico } from "../shared/animalLoteMovimentacaoEntrada";
import { MSG_PESO_ENTRADA_INVALIDO, isPesoEntradaInformadoInvalido } from "../shared/pesoEntrada";
import { buildRfidConflitoMessage, findRfidConflict } from "../shared/rfidUnicidade";
import { hojeISODateLocal } from "../shared/transferirAnimaisEntreLotes";

/** Permissão real do catálogo. Não existe uma permissão paralela para este cadastro. */
export const PERMISSAO_CADASTRAR_ANIMAL = "animais.criar";

export type MotivoCadastro =
  | MotivoOperacional
  | "lote_inexistente"
  | "lote_outro_titular"
  | "lote_incompativel"
  | "pasto_inexistente"
  | "pasto_outro_titular"
  | "pasto_incompativel"
  | "peso_invalido"
  | "brinco_duplicado"
  | "rfid_duplicado"
  | "dados_invalidos";

export type RecusaCadastro = { ok: false; motivo: MotivoCadastro; mensagem?: string };

export type LinhaUsuarioCadastro = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "admin" | "user";
  papel: PapelConta;
  titularUserId: number | null;
  situacao: SituacaoUsuario;
  sessionVersion: number;
};

export type LinhaFazendaCadastro = { id: number; userId: number };
export type LinhaLoteCadastro = { id: number; userId: number; fazendaId: number | null; ativo: boolean };
export type LinhaPastoCadastro = { id: number; userId: number; fazendaId: number | null };
export type LinhaAnimalAtivo = {
  id: number;
  brinco: string | null;
  brincoEletronico: string | null;
  status: string | null;
  fazendaId: number | null;
  loteId: number | null;
};

export type MovimentoEntradaLote = ReturnType<typeof buildEntradaInicialLoteMovimentacao>;

/**
 * Leituras e gravações da mesma transação.
 * A ordem das chamadas trava primeiro o usuário, depois permissões, vínculos,
 * fazenda, lote e pasto.
 */
export type ConsultaCadastroAnimal = {
  usuario(id: number): Promise<LinhaUsuarioCadastro | null>;
  permissoes(userId: number, titularUserId: number): Promise<string[]>;
  vinculos(userId: number, titularUserId: number): Promise<VinculoFazenda[]>;
  fazendasDoTitular(titularUserId: number): Promise<LinhaFazendaCadastro[]>;
  fazenda(id: number): Promise<LinhaFazendaCadastro | null>;
  lote(id: number): Promise<LinhaLoteCadastro | null>;
  pasto(id: number): Promise<LinhaPastoCadastro | null>;
  animaisAtivos(titularUserId: number): Promise<LinhaAnimalAtivo[]>;
  lotesDoTitular(titularUserId: number): Promise<Array<{ id: number; fazendaId: number | null }>>;
  inserirAnimal(row: LinhaInsercaoAnimal): Promise<number>;
  inserirMovimento(row: MovimentoEntradaLote): Promise<void>;
};

export type IoCadastroAnimal = {
  emTransacao<T>(fn: (tx: ConsultaCadastroAnimal) => Promise<T>): Promise<T>;
  /** Chamado depois do animal e antes do histórico. Se falhar, a transação desfaz os dois. */
  aposInserirAnimal?: () => Promise<void>;
};

export type PedidoCadastroAnimal = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  input: AnimalFormInput;
  /** Ignorado. O titular vem da identidade relida no banco. */
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type SucessoCadastroAnimal = {
  ok: true;
  id: number;
  userId: number;
  executorUserId: number;
  row: LinhaInsercaoAnimal;
  loteDestinoId: number | null;
  dataMovimentacao: string;
  usuarioNome: string;
};

export type ResultadoCadastroAnimal = SucessoCadastroAnimal | RecusaCadastro;

export type EspelhoCadastroAnimal = {
  atualizar(userId: number, id: number, row: LinhaInsercaoAnimal): Promise<void>;
  historico(entrada: MovimentoEntradaLote): Promise<void>;
};

function recusa(motivo: MotivoCadastro, mensagem?: string): RecusaCadastro {
  return mensagem ? { ok: false, motivo, mensagem } : { ok: false, motivo };
}

function nomeExecutor(usuario: LinhaUsuarioCadastro): string {
  const nome = (usuario.name ?? "").trim();
  if (nome) return nome;
  const email = (usuario.email ?? "").trim();
  return email || "Usuário";
}

function idOpcional(valor: number | null | undefined): number | null {
  if (valor == null) return null;
  if (!Number.isInteger(valor) || valor <= 0) return null;
  return valor;
}

function identidadeDe(usuario: LinhaUsuarioCadastro): IdentidadeUsuario | null {
  if (!Number.isInteger(usuario.id) || usuario.id <= 0) return null;
  if (!Number.isInteger(usuario.titularUserId) || (usuario.titularUserId ?? 0) <= 0) return null;
  if (!loginPermitido(usuario.situacao)) return null;
  return {
    id: usuario.id,
    openId: usuario.openId,
    name: usuario.name,
    email: usuario.email,
    role: usuario.role,
    papel: usuario.papel,
    titularUserId: Number(usuario.titularUserId),
    situacao: usuario.situacao,
    sessionVersion: usuario.sessionVersion,
  };
}

export function erroCadastroAnimal(resultado: RecusaCadastro): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para cadastrar animais." });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    case "fazenda_ausente":
      return new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma fazenda." });
    case "fazenda_inexistente":
    case "outro_titular":
    case "lote_inexistente":
    case "lote_outro_titular":
    case "pasto_inexistente":
    case "pasto_outro_titular":
      return new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
    case "lote_incompativel":
    case "pasto_incompativel":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "O lote e o pasto precisam pertencer à mesma fazenda do animal.",
      });
    case "peso_invalido":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? MSG_PESO_ENTRADA_INVALIDO });
    case "brinco_duplicado":
    case "rfid_duplicado":
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? "Cadastro recusado." });
    default:
      return new TRPCError({ code: "FORBIDDEN", message: "Cadastro recusado." });
  }
}

export type PedidoAutorizacaoPersistida = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  permissaoId: string;
  fazendaId?: number | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

/** Leituras que a autorização precisa. O cadastro de animal e o de lote usam as mesmas. */
export type ConsultaAutorizacaoPersistida = Pick<
  ConsultaCadastroAnimal,
  "usuario" | "permissoes" | "vinculos" | "fazendasDoTitular" | "fazenda"
>;

/**
 * Relê a identidade no banco, ignora titular e permissões vindos do cliente
 * e chama autorizarOperacao. Não grava nada.
 */
export async function autorizarOperacaoPersistida(
  tx: ConsultaAutorizacaoPersistida,
  pedido: PedidoAutorizacaoPersistida,
): Promise<ResultadoOperacional> {
  const usuario = await tx.usuario(pedido.executorId);
  const identidade = usuario ? identidadeDe(usuario) : null;
  if (!identidade) return { ok: false, motivo: "sem_identidade" };
  const fazendaId = idOpcional(pedido.fazendaId);
  const permissoes = await tx.permissoes(identidade.id, identidade.titularUserId);
  const vinculos = await tx.vinculos(identidade.id, identidade.titularUserId);
  const fazenda = fazendaId == null ? null : await tx.fazenda(fazendaId);
  const fazendasDoTitular = await tx.fazendasDoTitular(identidade.titularUserId);
  return autorizarOperacao({
    identidade,
    permissoes,
    permissaoId: pedido.permissaoId,
    fazendasDoTitular,
    vinculos,
    fazendaId,
    fazenda,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
  });
}

export async function autorizarOperacaoDoExecutor(
  io: IoCadastroAnimal,
  pedido: PedidoAutorizacaoPersistida,
): Promise<ResultadoOperacional> {
  return io.emTransacao((tx) => autorizarOperacaoPersistida(tx, pedido));
}

async function decidir(tx: ConsultaCadastroAnimal, pedido: PedidoCadastroAnimal): Promise<
  | RecusaCadastro
  | {
      ok: true;
      row: LinhaInsercaoAnimal;
      loteDestinoId: number | null;
      dataMovimentacao: string;
      usuarioNome: string;
      executorUserId: number;
    }
> {
  const usuario = await tx.usuario(pedido.executorId);
  const identidade = usuario ? identidadeDe(usuario) : null;
  if (!usuario || !identidade) return recusa("sem_identidade");

  const fazendaId = idOpcional(pedido.input.fazendaId);
  if (fazendaId == null) return recusa("fazenda_ausente");
  if (pedido.input.sexo !== "macho" && pedido.input.sexo !== "femea") return recusa("dados_invalidos");

  const deciso = await autorizarOperacaoPersistida(tx, {
    executorId: pedido.executorId,
    sessionVersionDaSessao: pedido.sessionVersionDaSessao,
    permissaoId: PERMISSAO_CADASTRAR_ANIMAL,
    fazendaId,
    titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
    papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
  });
  if (!deciso.ok) return recusa(deciso.motivo);

  const loteId = loteIdEfetivoParaHistorico(pedido.input.loteId);
  let lote: LinhaLoteCadastro | null = null;
  if (loteId != null) {
    lote = await tx.lote(loteId);
    if (!lote) return recusa("lote_inexistente");
    if (lote.userId !== deciso.contexto.titularUserId) return recusa("lote_outro_titular");
    if (!lote.ativo || lote.fazendaId !== fazendaId) return recusa("lote_incompativel");
  }

  const pastoId = idOpcional(pedido.input.pastoId);
  let pasto: LinhaPastoCadastro | null = null;
  if (pastoId != null) {
    pasto = await tx.pasto(pastoId);
    if (!pasto) return recusa("pasto_inexistente");
    if (pasto.userId !== deciso.contexto.titularUserId) return recusa("pasto_outro_titular");
    if (pasto.fazendaId !== fazendaId) return recusa("pasto_incompativel");
  }

  const ativos = await tx.animaisAtivos(deciso.contexto.titularUserId);
  const lotes = await tx.lotesDoTitular(deciso.contexto.titularUserId);
  const loteFazendaById = new Map(lotes.map((item) => [item.id, item.fazendaId]));
  const brinco = findActiveBrincoConflict(ativos, pedido.input.brinco, {
    fazendaId,
    loteFazendaById,
    effectiveStatus: "ativo",
  });
  if (brinco) {
    return recusa("brinco_duplicado", buildBrincoAtivoConflitoMessage(pedido.input.brinco ?? "", brinco));
  }
  const rfid = findRfidConflict(ativos, pedido.input.brincoEletronico);
  if (rfid) return recusa("rfid_duplicado", buildRfidConflitoMessage(rfid));

  const row = buildAnimalInsertRow(deciso.contexto.titularUserId, {
    ...pedido.input,
    fazendaId,
    loteId: lote ? lote.id : undefined,
    pastoId: pasto ? pasto.id : undefined,
  });
  return {
    ok: true,
    row,
    loteDestinoId: lote ? lote.id : null,
    dataMovimentacao: hojeISODateLocal(),
    usuarioNome: nomeExecutor(usuario),
    executorUserId: deciso.contexto.executorUserId,
  };
}

/** Autoriza, relê fazenda, lote e pasto, e grava animal e histórico na mesma transação. */
export async function cadastrarAnimalAutorizado(
  io: IoCadastroAnimal,
  pedido: PedidoCadastroAnimal,
): Promise<ResultadoCadastroAnimal> {
  if (isPesoEntradaInformadoInvalido(pedido.input.pesoEntrada)) {
    return recusa("peso_invalido", MSG_PESO_ENTRADA_INVALIDO);
  }
  return io.emTransacao(async (tx) => {
    const deciso = await decidir(tx, pedido);
    if (!deciso.ok) return deciso;
    const id = await tx.inserirAnimal(deciso.row);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("Falha ao cadastrar animal.");
    }
    if (io.aposInserirAnimal) await io.aposInserirAnimal();
    if (deciso.loteDestinoId != null) {
      await tx.inserirMovimento(buildEntradaInicialLoteMovimentacao({
        userId: deciso.row.userId,
        animalId: id,
        loteDestinoId: deciso.loteDestinoId,
        pastoOrigemId: null,
        pastoDestinoId: deciso.row.pastoId ?? null,
        fazendaId: deciso.row.fazendaId ?? null,
        dataMovimentacao: deciso.dataMovimentacao,
        usuarioNome: deciso.usuarioNome,
      }));
    }
    const sucesso: SucessoCadastroAnimal = {
      ok: true,
      id,
      userId: deciso.row.userId,
      executorUserId: deciso.executorUserId,
      row: deciso.row,
      loteDestinoId: deciso.loteDestinoId,
      dataMovimentacao: deciso.dataMovimentacao,
      usuarioNome: deciso.usuarioNome,
    };
    return sucesso;
  });
}

/** O espelho só corre depois da gravação autorizada. Recusa não grava nada localmente. */
export async function concluirCadastroNoEspelho(
  espelho: EspelhoCadastroAnimal,
  resultado: ResultadoCadastroAnimal,
): Promise<void> {
  if (!resultado.ok) return;
  try {
    await espelho.atualizar(resultado.userId, resultado.id, resultado.row);
    if (resultado.loteDestinoId != null) {
      await espelho.historico(buildEntradaInicialLoteMovimentacao({
        userId: resultado.userId,
        animalId: resultado.id,
        loteDestinoId: resultado.loteDestinoId,
        pastoOrigemId: null,
        pastoDestinoId: resultado.row.pastoId ?? null,
        fazendaId: resultado.row.fazendaId ?? null,
        dataMovimentacao: resultado.dataMovimentacao,
        usuarioNome: resultado.usuarioNome,
      }));
    }
  } catch (erro) {
    console.warn("[animais.create] Espelho local não gravado:", erro);
  }
}

export async function cadastrarEEspelhar(
  io: IoCadastroAnimal,
  pedido: PedidoCadastroAnimal,
  espelho: EspelhoCadastroAnimal,
): Promise<ResultadoCadastroAnimal> {
  const resultado = await cadastrarAnimalAutorizado(io, pedido);
  await concluirCadastroNoEspelho(espelho, resultado);
  return resultado;
}
