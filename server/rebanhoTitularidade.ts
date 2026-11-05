import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import type { FazendaConhecida, VinculoFazenda } from "./acessoFazendas";
import { autorizarOperacao, type MotivoOperacional } from "./contextoOperacional";
import { findActiveBrincoConflict } from "../shared/brincoAtivo";
import { MSG_STATUS_ALTERACAO_DIRETA } from "../shared/animalBaixa";
import { buildEntradaInicialLoteMovimentacao, loteIdEfetivoParaHistorico } from "../shared/animalLoteMovimentacaoEntrada";
import { isPesoEntradaInformadoInvalido } from "../shared/pesoEntrada";
import { findRfidConflict } from "../shared/rfidUnicidade";
import { hojeISODateLocal } from "../shared/transferirAnimaisEntreLotes";

/**
 * Serviço isolado de fazenda, animal e lote.
 * O dono gravado é o titular. O executor segue separado.
 * animais não tem coluna de executor: a autoria do ingresso em lote
 * fica em animal_lote_movimentacoes.usuarioNome.
 * Troca de lote, pasto, sexo, desmama e castração continuam nos fluxos próprios.
 */

export const LACUNA_AUTORIA_ANIMAL =
  "A tabela animais não guarda o executor. O nome de quem incluiu o animal no lote fica em usuarioNome.";

export type MotivoRebanho =
  | MotivoOperacional
  | "nao_encontrado"
  | "brinco_duplicado"
  | "rfid_duplicado"
  | "peso_invalido"
  | "lote_incompativel"
  | "titularidade_imutavel"
  | "situacao_preservada"
  | "movimentacao_especifica"
  | "fluxo_especifico"
  | "dados_invalidos";

export type RecusaRebanho = { ok: false; motivo: MotivoRebanho; mensagem?: string };

export type ExtrasCliente = {
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
  sessionVersionDaSessao?: number | null;
};

export type SessaoRebanho = {
  identidade: IdentidadeUsuario;
  permissoes: readonly string[];
  fazendasDoTitular: ReadonlyArray<FazendaConhecida & { nome: string }>;
  vinculos: readonly VinculoFazenda[];
  executorNome: string;
};

export type AnimalPersistido = {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  brinco: string | null;
  brincoEletronico: string | null;
  nome: string | null;
  sexo: "macho" | "femea";
  status: string;
};

export type LotePersistido = {
  id: number;
  userId: number;
  fazendaId: number | null;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  ativo: boolean;
};

export type ConsultaPaginada = {
  titularUserId: number;
  fazendaIds: number[];
  limit: number;
  offset: number;
};

export type RepositorioRebanho = {
  carregar(executorId: number, extras?: ExtrasCliente): Promise<SessaoRebanho | null>;
  obterFazenda(id: number): Promise<FazendaConhecida | null>;
  listarAnimais(consulta: ConsultaPaginada): Promise<{ itens: AnimalPersistido[]; total: number }>;
  obterAnimal(titularId: number, id: number): Promise<AnimalPersistido | null>;
  animaisAtivos(titularId: number): Promise<AnimalPersistido[]>;
  lotesDoTitular(titularId: number): Promise<LotePersistido[]>;
  listarLotes(consulta: ConsultaPaginada): Promise<{ itens: LotePersistido[]; total: number }>;
  obterLote(titularId: number, id: number): Promise<LotePersistido | null>;
  inserirAnimal(row: Omit<AnimalPersistido, "id"> & { pesoEntrada: string | null }): Promise<number>;
  atualizarAnimal(id: number, titularId: number, patch: Partial<AnimalPersistido> & { pesoEntrada?: string | null }): Promise<void>;
  inserirLote(row: Omit<LotePersistido, "id">): Promise<number>;
  atualizarLote(id: number, titularId: number, patch: Partial<Pick<LotePersistido, "nome" | "sigla" | "descricao">>): Promise<void>;
  inserirMovimento(row: {
    userId: number;
    animalId: number;
    loteDestinoId: number;
    fazendaId: number | null;
    usuarioNome: string;
    dataMovimentacao: string;
  }): Promise<number>;
};

export type DepsRebanho = {
  ler: RepositorioRebanho;
  emTransacao<T>(fn: (tx: RepositorioRebanho) => Promise<T>): Promise<T>;
};

export type CadastroAnimalInput = {
  fazendaId: number;
  sexo: "macho" | "femea";
  brinco?: string | null;
  brincoEletronico?: string | null;
  nome?: string | null;
  loteId?: number | null;
  pesoEntrada?: string | null;
  status?: string | null;
  userId?: number | null;
  titularUserId?: number | null;
};

export type AtualizarAnimalInput = {
  id: number;
  nome?: string | null;
  brinco?: string | null;
  brincoEletronico?: string | null;
  pesoEntrada?: string | null;
  fazendaId?: number | null;
  userId?: number | null;
  titularUserId?: number | null;
  status?: string | null;
  loteId?: number | null;
  sexo?: "macho" | "femea" | null;
  castrado?: boolean | null;
  dataDesmama?: string | null;
};

export type CadastroLoteInput = {
  fazendaId: number;
  nome: string;
  sigla?: string | null;
  descricao?: string | null;
  userId?: number | null;
  titularUserId?: number | null;
};

export type AtualizarLoteInput = {
  id: number;
  nome?: string | null;
  sigla?: string | null;
  descricao?: string | null;
  fazendaId?: number | null;
  pastoAtualId?: number | null;
  userId?: number | null;
  titularUserId?: number | null;
};

function recusa(motivo: MotivoRebanho, mensagem?: string): RecusaRebanho {
  return mensagem ? { ok: false, motivo, mensagem } : { ok: false, motivo };
}

function paginaDe(pagina?: number, tamanho?: number) {
  const paginaSegura = Number.isInteger(pagina) && (pagina ?? 0) > 0 ? Number(pagina) : 1;
  const pedido = Number.isInteger(tamanho) && (tamanho ?? 0) > 0 ? Number(tamanho) : 20;
  const limit = Math.min(pedido, 100);
  return { limit, offset: (paginaSegura - 1) * limit };
}

function autorizar(
  sessao: SessaoRebanho,
  permissaoId: string,
  fazendaId: number | null,
  fazenda: FazendaConhecida | null,
  extras?: ExtrasCliente,
) {
  return autorizarOperacao({
    identidade: sessao.identidade,
    permissoes: sessao.permissoes,
    permissaoId,
    fazendasDoTitular: sessao.fazendasDoTitular,
    vinculos: sessao.vinculos,
    fazendaId,
    fazenda,
    titularInformadoPeloCliente: extras?.titularInformadoPeloCliente,
    papelInformadoPeloCliente: extras?.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: extras?.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: extras?.fazendasInformadasPeloCliente,
    sessionVersionDaSessao: extras?.sessionVersionDaSessao,
  });
}

function titularInformadoDiverge(valor: number | null | undefined, titularId: number) {
  return valor != null && valor !== titularId;
}

function nomeExecutor(sessao: SessaoRebanho) {
  const nome = sessao.executorNome.trim();
  return nome || "Usuário";
}

/** Animal com fazenda só entra em lote da mesma fazenda. */
function loteCabeNaFazenda(fazendaId: number, fazendaDoLote: number | null) {
  if (fazendaDoLote == null) return false;
  return fazendaId === fazendaDoLote;
}

export function criarServicoRebanho(deps: DepsRebanho) {
  async function sessaoOuRecusa(executorId: number, extras?: ExtrasCliente) {
    const sessao = await deps.ler.carregar(executorId, extras);
    if (!sessao) return recusa("sem_identidade");
    return sessao;
  }

  async function fazendasPermitidas(sessao: SessaoRebanho, permissaoId: string, extras?: ExtrasCliente) {
    const ids: number[] = [];
    for (const fazenda of sessao.fazendasDoTitular) {
      if (fazenda.userId !== sessao.identidade.titularUserId) continue;
      const decisao = autorizar(sessao, permissaoId, fazenda.id, fazenda, extras);
      if (decisao.ok) ids.push(fazenda.id);
    }
    return ids;
  }

  return {
    async listarFazendas(executorId: number, extras?: ExtrasCliente) {
      const sessao = await sessaoOuRecusa(executorId, extras);
      if ("motivo" in sessao) return sessao;
      const fazendas: Array<{ id: number; nome: string }> = [];
      for (const fazenda of sessao.fazendasDoTitular) {
        if (fazenda.userId !== sessao.identidade.titularUserId) continue;
        const decisao = autorizar(sessao, "fazendas.visualizar", fazenda.id, fazenda, extras);
        if (decisao.ok) fazendas.push({ id: fazenda.id, nome: fazenda.nome });
      }
      return { ok: true as const, fazendas };
    },

    async cadastrarAnimal(
      executorId: number,
      input: CadastroAnimalInput,
      extras?: ExtrasCliente,
      aposInserirAnimal?: () => Promise<void>,
    ) {
      return deps.emTransacao(async (tx) => {
        const sessao = await tx.carregar(executorId, extras);
        if (!sessao) return recusa("sem_identidade");
        if (titularInformadoDiverge(input.userId, sessao.identidade.titularUserId)) return recusa("titularidade_imutavel");
        if (titularInformadoDiverge(input.titularUserId, sessao.identidade.titularUserId)) return recusa("titularidade_imutavel");
        if (input.status != null && input.status !== "ativo") {
          return recusa("situacao_preservada", MSG_STATUS_ALTERACAO_DIRETA);
        }
        if (input.sexo !== "macho" && input.sexo !== "femea") return recusa("dados_invalidos");
        if (isPesoEntradaInformadoInvalido(input.pesoEntrada)) return recusa("peso_invalido");

        const fazenda = await tx.obterFazenda(input.fazendaId);
        const decisao = autorizar(sessao, "animais.criar", input.fazendaId, fazenda, extras);
        if (!decisao.ok) return decisao;

        const loteId = loteIdEfetivoParaHistorico(input.loteId);
        if (loteId != null) {
          const lote = await tx.obterLote(decisao.contexto.titularUserId, loteId);
          if (!lote || lote.ativo === false || !loteCabeNaFazenda(input.fazendaId, lote.fazendaId)) {
            return recusa("lote_incompativel");
          }
        }

        const ativos = await tx.animaisAtivos(decisao.contexto.titularUserId);
        const lotes = await tx.lotesDoTitular(decisao.contexto.titularUserId);
        const loteFazendaById = new Map(lotes.map((lote) => [lote.id, lote.fazendaId]));
        if (findActiveBrincoConflict(ativos, input.brinco, { fazendaId: input.fazendaId, loteFazendaById, effectiveStatus: "ativo" })) {
          return recusa("brinco_duplicado");
        }
        if (findRfidConflict(ativos, input.brincoEletronico)) return recusa("rfid_duplicado");

        const id = await tx.inserirAnimal({
          userId: decisao.contexto.titularUserId,
          fazendaId: input.fazendaId,
          loteId,
          brinco: input.brinco?.trim() || null,
          brincoEletronico: input.brincoEletronico?.trim() || null,
          nome: input.nome?.trim() || null,
          sexo: input.sexo,
          status: "ativo",
          pesoEntrada: input.pesoEntrada?.trim() || null,
        });
        if (aposInserirAnimal) await aposInserirAnimal();
        if (loteId != null) {
          const movimento = buildEntradaInicialLoteMovimentacao({
            userId: decisao.contexto.titularUserId,
            animalId: id,
            loteDestinoId: loteId,
            fazendaId: input.fazendaId,
            dataMovimentacao: hojeISODateLocal(),
            usuarioNome: nomeExecutor(sessao),
          });
          await tx.inserirMovimento(movimento);
        }
        return {
          ok: true as const,
          id,
          userId: decisao.contexto.titularUserId,
          executorUserId: decisao.contexto.executorUserId,
        };
      });
    },

    async listarAnimais(
      executorId: number,
      filtro?: { fazendaId?: number; pagina?: number; tamanho?: number },
      extras?: ExtrasCliente,
    ) {
      const sessao = await sessaoOuRecusa(executorId, extras);
      if ("motivo" in sessao) return sessao;
      const permitidas = await fazendasPermitidas(sessao, "animais.visualizar", extras);
      const fazendaIds = filtro?.fazendaId == null
        ? permitidas
        : permitidas.filter((id) => id === filtro.fazendaId);
      const { limit, offset } = paginaDe(filtro?.pagina, filtro?.tamanho);
      if (fazendaIds.length === 0) return { ok: true as const, itens: [], total: 0 };
      const pagina = await deps.ler.listarAnimais({
        titularUserId: sessao.identidade.titularUserId,
        fazendaIds,
        limit,
        offset,
      });
      return { ok: true as const, ...pagina };
    },

    async obterAnimal(executorId: number, id: number, extras?: ExtrasCliente) {
      const sessao = await sessaoOuRecusa(executorId, extras);
      if ("motivo" in sessao) return sessao;
      const animal = await deps.ler.obterAnimal(sessao.identidade.titularUserId, id);
      if (!animal || animal.fazendaId == null) return recusa("nao_encontrado");
      const fazenda = await deps.ler.obterFazenda(animal.fazendaId);
      const decisao = autorizar(sessao, "animais.visualizar", animal.fazendaId, fazenda, extras);
      if (!decisao.ok) return recusa("nao_encontrado");
      return { ok: true as const, animal };
    },

    async atualizarAnimal(executorId: number, input: AtualizarAnimalInput, extras?: ExtrasCliente) {
      return deps.emTransacao(async (tx) => {
        const sessao = await tx.carregar(executorId, extras);
        if (!sessao) return recusa("sem_identidade");
        const animal = await tx.obterAnimal(sessao.identidade.titularUserId, input.id);
        if (!animal || animal.fazendaId == null) return recusa("nao_encontrado");
        if (titularInformadoDiverge(input.userId, sessao.identidade.titularUserId)) return recusa("titularidade_imutavel");
        if (titularInformadoDiverge(input.titularUserId, sessao.identidade.titularUserId)) return recusa("titularidade_imutavel");

        const fazendaAtual = await tx.obterFazenda(animal.fazendaId);
        const editar = autorizar(sessao, "animais.editar", animal.fazendaId, fazendaAtual, extras);
        if (!editar.ok) return editar.motivo === "sem_fazenda" || editar.motivo === "outro_titular" ? recusa("nao_encontrado") : editar;
        if (input.status != null && input.status !== animal.status) {
          return recusa("situacao_preservada", MSG_STATUS_ALTERACAO_DIRETA);
        }
        if (input.loteId !== undefined && input.loteId !== animal.loteId) return recusa("movimentacao_especifica");
        if (input.sexo != null && input.sexo !== animal.sexo) return recusa("fluxo_especifico");
        if (input.castrado !== undefined || input.dataDesmama !== undefined) return recusa("fluxo_especifico");
        if (isPesoEntradaInformadoInvalido(input.pesoEntrada)) return recusa("peso_invalido");

        let fazendaDestino = animal.fazendaId;
        if (input.fazendaId != null && input.fazendaId !== animal.fazendaId) {
          const destino = await tx.obterFazenda(input.fazendaId);
          const transferir = autorizar(sessao, "animais.transferir", input.fazendaId, destino, extras);
          if (!transferir.ok) return transferir;
          const lotes = await tx.lotesDoTitular(sessao.identidade.titularUserId);
          const lote = animal.loteId == null ? null : lotes.find((item) => item.id === animal.loteId) ?? null;
          if (lote && !loteCabeNaFazenda(input.fazendaId, lote.fazendaId)) {
            return recusa("lote_incompativel");
          }
          fazendaDestino = input.fazendaId;
        }

        const ativos = await tx.animaisAtivos(sessao.identidade.titularUserId);
        const lotes = await tx.lotesDoTitular(sessao.identidade.titularUserId);
        const loteFazendaById = new Map(lotes.map((lote) => [lote.id, lote.fazendaId]));
        const brinco = input.brinco === undefined ? animal.brinco : input.brinco;
        const rfid = input.brincoEletronico === undefined ? animal.brincoEletronico : input.brincoEletronico;
        if (findActiveBrincoConflict(ativos, brinco, {
          excludeAnimalId: animal.id,
          fazendaId: fazendaDestino,
          loteFazendaById,
          effectiveStatus: animal.status,
        })) return recusa("brinco_duplicado");
        if (findRfidConflict(ativos, rfid, { excludeAnimalId: animal.id })) return recusa("rfid_duplicado");

        await tx.atualizarAnimal(animal.id, sessao.identidade.titularUserId, {
          nome: input.nome === undefined ? undefined : input.nome,
          brinco: input.brinco === undefined ? undefined : input.brinco?.trim() || null,
          brincoEletronico: input.brincoEletronico === undefined ? undefined : input.brincoEletronico?.trim() || null,
          fazendaId: fazendaDestino,
          pesoEntrada: input.pesoEntrada === undefined ? undefined : input.pesoEntrada?.trim() || null,
        });
        const gravado = await tx.obterAnimal(sessao.identidade.titularUserId, animal.id);
        return { ok: true as const, animal: gravado, userId: sessao.identidade.titularUserId };
      });
    },

    async cadastrarLote(executorId: number, input: CadastroLoteInput, extras?: ExtrasCliente) {
      return deps.emTransacao(async (tx) => {
        const sessao = await tx.carregar(executorId, extras);
        if (!sessao) return recusa("sem_identidade");
        if (titularInformadoDiverge(input.userId, sessao.identidade.titularUserId)) return recusa("titularidade_imutavel");
        if (titularInformadoDiverge(input.titularUserId, sessao.identidade.titularUserId)) return recusa("titularidade_imutavel");
        const nome = input.nome.trim();
        if (!nome) return recusa("dados_invalidos");
        const fazenda = await tx.obterFazenda(input.fazendaId);
        const decisao = autorizar(sessao, "lotes.criar", input.fazendaId, fazenda, extras);
        if (!decisao.ok) return decisao;
        const id = await tx.inserirLote({
          userId: decisao.contexto.titularUserId,
          fazendaId: input.fazendaId,
          nome,
          sigla: input.sigla?.trim() || null,
          descricao: input.descricao?.trim() || null,
          ativo: true,
        });
        return {
          ok: true as const,
          id,
          userId: decisao.contexto.titularUserId,
          executorUserId: decisao.contexto.executorUserId,
        };
      });
    },

    async listarLotes(
      executorId: number,
      filtro?: { fazendaId?: number; pagina?: number; tamanho?: number },
      extras?: ExtrasCliente,
    ) {
      const sessao = await sessaoOuRecusa(executorId, extras);
      if ("motivo" in sessao) return sessao;
      const permitidas = await fazendasPermitidas(sessao, "lotes.visualizar", extras);
      const fazendaIds = filtro?.fazendaId == null
        ? permitidas
        : permitidas.filter((id) => id === filtro.fazendaId);
      const { limit, offset } = paginaDe(filtro?.pagina, filtro?.tamanho);
      if (fazendaIds.length === 0) return { ok: true as const, itens: [], total: 0 };
      const pagina = await deps.ler.listarLotes({
        titularUserId: sessao.identidade.titularUserId,
        fazendaIds,
        limit,
        offset,
      });
      return { ok: true as const, ...pagina };
    },

    async atualizarLote(executorId: number, input: AtualizarLoteInput, extras?: ExtrasCliente) {
      return deps.emTransacao(async (tx) => {
        const sessao = await tx.carregar(executorId, extras);
        if (!sessao) return recusa("sem_identidade");
        const lote = await tx.obterLote(sessao.identidade.titularUserId, input.id);
        if (!lote || lote.fazendaId == null) return recusa("nao_encontrado");
        if (titularInformadoDiverge(input.userId, sessao.identidade.titularUserId)) return recusa("titularidade_imutavel");
        if (titularInformadoDiverge(input.titularUserId, sessao.identidade.titularUserId)) return recusa("titularidade_imutavel");
        if (input.fazendaId != null && input.fazendaId !== lote.fazendaId) return recusa("movimentacao_especifica");
        if (input.pastoAtualId !== undefined) return recusa("movimentacao_especifica");
        const fazenda = await tx.obterFazenda(lote.fazendaId);
        const decisao = autorizar(sessao, "lotes.editar", lote.fazendaId, fazenda, extras);
        if (!decisao.ok) return decisao.motivo === "sem_fazenda" || decisao.motivo === "outro_titular" ? recusa("nao_encontrado") : decisao;
        const nome = input.nome == null ? undefined : input.nome.trim();
        if (nome !== undefined && !nome) return recusa("dados_invalidos");
        await tx.atualizarLote(lote.id, sessao.identidade.titularUserId, {
          nome,
          sigla: input.sigla === undefined ? undefined : input.sigla.trim() || null,
          descricao: input.descricao === undefined ? undefined : input.descricao.trim() || null,
        });
        const gravado = await tx.obterLote(sessao.identidade.titularUserId, lote.id);
        return { ok: true as const, lote: gravado, userId: sessao.identidade.titularUserId };
      });
    },
  };
}
