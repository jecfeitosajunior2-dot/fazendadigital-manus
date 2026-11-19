import { TRPCError } from "@trpc/server";
import type { ConsultaAutorizacaoPersistida } from "./cadastroAnimalAutorizado";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import type { LinhaPastoCadastro } from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";

/** Permissão real do catálogo. Não existe uma permissão paralela para este cadastro. */
export const PERMISSAO_CADASTRAR_LOTE = "lotes.criar";

export type MotivoCadastroLote =
  | MotivoOperacional
  | "pasto_inexistente"
  | "pasto_outro_titular"
  | "pasto_incompativel"
  | "dados_invalidos";

export type RecusaCadastroLote = { ok: false; motivo: MotivoCadastroLote; mensagem?: string };

export type LoteFormInput = {
  nome: string;
  sigla?: string;
  dataCriacao?: string;
  descricao?: string;
  localizacao?: string;
  capacidade?: number;
  fazendaId?: number;
  pastoAtualId?: number | null;
};

export type LinhaInsercaoLote = {
  userId: number;
  nome: string;
  sigla?: string;
  dataCriacao: string;
  descricao?: string;
  localizacao?: string;
  capacidade?: number;
  fazendaId: number;
  pastoAtualId?: number;
};

export type ConsultaCadastroLote = ConsultaAutorizacaoPersistida & {
  pasto(id: number): Promise<LinhaPastoCadastro | null>;
  inserirLote(row: LinhaInsercaoLote): Promise<number>;
};

export type IoCadastroLote = {
  emTransacao<T>(fn: (tx: ConsultaCadastroLote) => Promise<T>): Promise<T>;
  /** Chamado depois do insert. Se falhar, a transação desfaz o lote. */
  aposInserirLote?: () => Promise<void>;
};

export type PedidoCadastroLote = {
  executorId: number;
  sessionVersionDaSessao?: number | null;
  input: LoteFormInput;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
};

export type SucessoCadastroLote = {
  ok: true;
  id: number;
  userId: number;
  executorUserId: number;
  row: LinhaInsercaoLote;
};

export type ResultadoCadastroLote = SucessoCadastroLote | RecusaCadastroLote;

export type EspelhoCadastroLote = {
  criar(userId: number, row: LinhaInsercaoLote): Promise<void>;
};

function recusa(motivo: MotivoCadastroLote, mensagem?: string): RecusaCadastroLote {
  return mensagem ? { ok: false, motivo, mensagem } : { ok: false, motivo };
}

function idOpcional(valor: number | null | undefined): number | null {
  if (valor == null) return null;
  if (!Number.isInteger(valor) || valor <= 0) return null;
  return valor;
}

/** Mesma data padrão do cadastro atual: o dia em UTC quando o formulário não envia data. */
export function dataCriacaoPadraoLote(agora = new Date()): string {
  return agora.toISOString().slice(0, 10);
}

export function erroCadastroLote(resultado: RecusaCadastroLote): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para cadastrar lotes." });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    case "fazenda_ausente":
      return new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma fazenda." });
    case "fazenda_inexistente":
    case "outro_titular":
    case "pasto_inexistente":
    case "pasto_outro_titular":
      return new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
    case "pasto_incompativel":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "O pasto precisa pertencer à mesma fazenda do lote.",
      });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? "Cadastro recusado." });
  }
}

function montarLinha(
  titularUserId: number,
  fazendaId: number,
  input: LoteFormInput,
  pastoId: number | null,
): LinhaInsercaoLote {
  const sigla = input.sigla?.trim() || undefined;
  return {
    userId: titularUserId,
    nome: input.nome,
    sigla,
    dataCriacao: input.dataCriacao || dataCriacaoPadraoLote(),
    descricao: input.descricao,
    localizacao: input.localizacao,
    capacidade: input.capacidade,
    fazendaId,
    pastoAtualId: pastoId ?? undefined,
  };
}

/** Autoriza, relê a fazenda e o pasto, e grava o lote na mesma transação. */
export async function cadastrarLoteAutorizado(
  io: IoCadastroLote,
  pedido: PedidoCadastroLote,
): Promise<ResultadoCadastroLote> {
  if (typeof pedido.input.nome !== "string") return recusa("dados_invalidos", "Informe o nome do lote.");
  return io.emTransacao(async (tx) => {
    const deciso = await autorizarOperacaoPersistida(tx, {
      executorId: pedido.executorId,
      sessionVersionDaSessao: pedido.sessionVersionDaSessao,
      permissaoId: PERMISSAO_CADASTRAR_LOTE,
      fazendaId: pedido.input.fazendaId,
      titularInformadoPeloCliente: pedido.titularInformadoPeloCliente,
      papelInformadoPeloCliente: pedido.papelInformadoPeloCliente,
      permissoesInformadasPeloCliente: pedido.permissoesInformadasPeloCliente,
      fazendasInformadasPeloCliente: pedido.fazendasInformadasPeloCliente,
    });
    if (!deciso.ok) return recusa(deciso.motivo);
    const fazendaId = deciso.contexto.fazendaId;
    if (fazendaId == null) return recusa("fazenda_ausente");

    const pastoId = idOpcional(pedido.input.pastoAtualId);
    if (pastoId != null) {
      const pasto = await tx.pasto(pastoId);
      if (!pasto) return recusa("pasto_inexistente");
      if (pasto.userId !== deciso.contexto.titularUserId) return recusa("pasto_outro_titular");
      if (pasto.fazendaId !== fazendaId) return recusa("pasto_incompativel");
    }

    const row = montarLinha(deciso.contexto.titularUserId, fazendaId, pedido.input, pastoId);
    const id = await tx.inserirLote(row);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Falha ao cadastrar lote.");
    if (io.aposInserirLote) await io.aposInserirLote();
    return {
      ok: true as const,
      id,
      userId: row.userId,
      executorUserId: deciso.contexto.executorUserId,
      row,
    };
  });
}

/** O espelho só corre depois da gravação autorizada. */
export async function concluirCadastroLoteNoEspelho(
  espelho: EspelhoCadastroLote,
  resultado: ResultadoCadastroLote,
): Promise<void> {
  if (!resultado.ok) return;
  try {
    await espelho.criar(resultado.userId, resultado.row);
  } catch (erro) {
    console.warn("[lotes.create] Espelho local não gravado:", erro);
  }
}

export async function cadastrarEEspelharLote(
  io: IoCadastroLote,
  pedido: PedidoCadastroLote,
  espelho: EspelhoCadastroLote,
): Promise<ResultadoCadastroLote> {
  const resultado = await cadastrarLoteAutorizado(io, pedido);
  await concluirCadastroLoteNoEspelho(espelho, resultado);
  return resultado;
}
