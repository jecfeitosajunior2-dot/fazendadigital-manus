import type { Pool, RowDataPacket } from "mysql2/promise";
import { loginPermitido, type IdentidadeUsuario, type PapelConta, type SituacaoUsuario } from "./_core/identidadeSessao";
import { montarAcesso, type FazendaConhecida, type VinculoFazenda } from "./acessoFazendas";
import {
  consultarFazendasDoUsuario,
  consultarPerfis,
  consultarPermissoesEfetivas,
  consultarUsuario,
  consultarUsuarios,
  fazendasDoExecutor,
  type ContextoAdministracao,
  type MotivoAdministracao,
  type PerfilConhecido,
  type UsuarioAdministravel,
  type UsuarioVisivel,
} from "./administracao";
import { OPERACOES_USUARIO_AFETADO, projetarEventoAdministrativo } from "./auditoriaProjecao";
import { CATALOGO_PERMISSOES, permissaoPorId } from "./catalogoPermissoes";
import { afirmarBancoDescartavel, type AlvoMysql } from "./isolamentoMysql";
import type { LinhaPermissaoUsuario } from "./perfisAcesso";
import {
  podeAdministrarUsuario,
  podeConcederFazenda,
  podeConcederPermissao,
  podeDelegarPermissao,
  podeExecutarOperacao,
  type PedidoAutorizacao,
} from "./autorizacao";

/**
 * Consultas administrativas. Só leem o banco isolado.
 * O titular sai da identidade gravada. O navegador não escolhe a conta.
 * Auditoria administrativa não entra: o catálogo não tem permissão de leitura.
 */

const TAMANHO_MAXIMO = 100;
const SITUACOES = new Set(["convidado", "ativo", "inativo"]);
const PAPEIS = new Set(["principal", "secundario", "comum"]);

export type FalhaConsulta = {
  ok: false;
  motivo: MotivoAdministracao | "AUDITORIA_HISTORICA_INDISPONIVEL";
  permissao?: string;
  fazendaId?: number;
};

export type EventoAdministrativoVisivel = {
  id: number;
  criadoEm: string;
  executorUserId: number;
  executorNome: string;
  titularUserId: number;
  fazendaId: number | null;
  modulo: string;
  operacao: string;
  registroTipo: string | null;
  registroId: number | null;
  anterior: Record<string, unknown> | null;
  posterior: Record<string, unknown> | null;
  conteudoOculto: boolean;
};

export type PaginaConsulta<T> = {
  ok: true;
  itens: T[];
  total: number;
  pagina: number;
  tamanho: number;
};

type LinhaUsuario = RowDataPacket & {
  id: number;
  name: string;
  email: string | null;
  papel: PapelConta;
  titularUserId: number;
  situacao: SituacaoUsuario;
  sessionVersion: number;
};

function falha(motivo: FalhaConsulta["motivo"], extra?: { permissao?: string; fazendaId?: number }): FalhaConsulta {
  return extra ? { ok: false, motivo, ...extra } : { ok: false, motivo };
}

function paginaDe(entrada?: { pagina?: number; tamanho?: number }) {
  const tamanhoPedido = entrada?.tamanho ?? 20;
  const tamanho = Math.min(TAMANHO_MAXIMO, Math.max(1, Math.floor(tamanhoPedido) || 20));
  const pagina = Math.max(1, Math.floor(entrada?.pagina ?? 1) || 1);
  return { pagina, tamanho, offset: (pagina - 1) * tamanho };
}

function afirmarSqlDeLeitura(sql: string): void {
  const texto = sql.trim().replace(/\s+/g, " ").toLowerCase();
  if (!texto.startsWith("select ")) throw new Error("Consulta recusada: esta fase só lê.");
  if (texto.includes(";")) throw new Error("Consulta recusada: um comando por vez.");
}

function visivel(usuario: UsuarioAdministravel): UsuarioVisivel {
  return {
    id: usuario.id,
    name: usuario.name.trim(),
    email: usuario.email,
    papel: usuario.papel,
    role: usuario.papel === "principal" ? "admin" : "user",
    titularUserId: usuario.titularUserId,
    situacao: usuario.situacao,
    sessionVersion: usuario.sessionVersion,
  };
}

function usuarioDe(linha: LinhaUsuario): UsuarioAdministravel {
  return {
    id: Number(linha.id),
    name: String(linha.name),
    email: linha.email == null ? null : String(linha.email),
    role: linha.papel === "principal" ? "admin" : "user",
    papel: linha.papel,
    titularUserId: Number(linha.titularUserId),
    situacao: linha.situacao,
    sessionVersion: Number(linha.sessionVersion),
  };
}

function pedidoDe(ctx: ContextoAdministracao): PedidoAutorizacao {
  return { acesso: ctx.acesso, permissoes: ctx.permissoes };
}

function irregular(permissao: string): boolean {
  const definicao = permissaoPorId(permissao);
  return !definicao || definicao.exclusivaDoPrincipal;
}

function instanteFiltro(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(valor)) return null;
  const [data, hora] = valor.split(/[ T]/);
  const [ano, mes, dia] = data.split("-").map(Number);
  const [horas, minutos, segundos] = hora.split(":").map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || horas > 23 || minutos > 59 || segundos > 59 || ano < 2000) return null;
  return `${data} ${hora}`;
}

function eventoVisivel(linha: RowDataPacket): EventoAdministrativoVisivel {
  const operacao = String(linha.operacao);
  const projetado = projetarEventoAdministrativo(operacao, linha.dadosAnteriores, linha.dadosPosteriores);
  const criado = linha.criadoEm instanceof Date ? linha.criadoEm.toISOString() : String(linha.criadoEm);
  return {
    id: Number(linha.id),
    criadoEm: criado,
    executorUserId: Number(linha.executorUserId),
    executorNome: String(linha.executorNome),
    titularUserId: Number(linha.titularUserId),
    fazendaId: linha.fazendaId == null ? null : Number(linha.fazendaId),
    modulo: String(linha.modulo),
    operacao,
    registroTipo: linha.registroTipo == null ? null : String(linha.registroTipo),
    registroId: linha.registroId == null ? null : Number(linha.registroId),
    anterior: projetado.anterior,
    posterior: projetado.posterior,
    conteudoOculto: projetado.conteudoOculto,
  };
}

export function criarConsultasDaAplicacao(pool: Pool) {
  return criarConsultasAdministrativas(pool, { host: "127.0.0.1", port: 9, database: "aplicacao" }, "aplicacao");
}

export function criarConsultasAdministrativas(
  pool: Pool,
  alvo: AlvoMysql,
  modo: "descartavel" | "aplicacao" = "descartavel",
) {
  if (modo === "descartavel") afirmarBancoDescartavel(alvo);

  async function ler<T extends RowDataPacket[]>(sql: string, params: readonly unknown[] = []): Promise<T> {
    if (modo === "descartavel") afirmarBancoDescartavel(alvo);
    afirmarSqlDeLeitura(sql);
    const [banco] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS nome");
    const nome = String(banco[0]?.nome ?? "");
    if (nome.toLowerCase() === "fazenda_digital" || (modo === "descartavel" && nome.toLowerCase() !== alvo.database.toLowerCase())) {
      throw new Error("Conexão recusada: banco inesperado.");
    }
    const [linhas] = await pool.query<T>(sql, params as unknown[]);
    return linhas;
  }

  async function contexto(executorId: number): Promise<ContextoAdministracao | FalhaConsulta> {
    if (!Number.isInteger(executorId) || executorId <= 0) return falha("sem_identidade");
    const linhas = await ler<LinhaUsuario[]>(
      `SELECT id, name, email, papel, titularUserId, situacao, sessionVersion
       FROM users WHERE id = ?`,
      [executorId],
    );
    const linha = linhas[0];
    if (!linha || linha.titularUserId == null || !loginPermitido(linha.situacao)) return falha("sem_identidade");
    const identidade: IdentidadeUsuario = {
      id: Number(linha.id),
      openId: "",
      name: String(linha.name),
      email: linha.email == null ? null : String(linha.email),
      role: linha.papel === "principal" ? "admin" : "user",
      papel: linha.papel,
      titularUserId: Number(linha.titularUserId),
      situacao: linha.situacao,
      sessionVersion: Number(linha.sessionVersion),
    };
    const permissoes = (await permissoesDe(identidade.id, identidade.titularUserId)).map((item) => item.permissao);
    const fazendas = await fazendasDaConta(identidade.titularUserId);
    const vinculos = identidade.papel === "principal" ? [] : await vinculosDe(identidade.id, identidade.titularUserId);
    return {
      identidade,
      acesso: montarAcesso({ identidade, fazendasDoTitular: fazendas, vinculos }),
      permissoes,
    };
  }

  async function permissoesDe(userId: number, titularUserId: number): Promise<LinhaPermissaoUsuario[]> {
    const linhas = await ler<RowDataPacket[]>(
      `SELECT userId, titularUserId, permissao, concedidoPorUserId, origemPerfilId
       FROM usuario_permissoes
       WHERE userId = ? AND titularUserId = ?
       ORDER BY permissao`,
      [userId, titularUserId],
    );
    return linhas.map((linha) => ({
      userId: Number(linha.userId),
      titularUserId: Number(linha.titularUserId),
      permissao: String(linha.permissao),
      concedidoPorUserId: Number(linha.concedidoPorUserId),
      origemPerfilId: linha.origemPerfilId == null ? null : Number(linha.origemPerfilId),
    }));
  }

  async function fazendasDaConta(titularUserId: number): Promise<FazendaConhecida[]> {
    const linhas = await ler<RowDataPacket[]>(
      "SELECT id, userId FROM fazendas WHERE userId = ? ORDER BY id",
      [titularUserId],
    );
    return linhas.map((linha) => ({ id: Number(linha.id), userId: Number(linha.userId) }));
  }

  async function vinculosDe(userId: number, titularUserId: number): Promise<VinculoFazenda[]> {
    const linhas = await ler<RowDataPacket[]>(
      `SELECT uf.userId, uf.fazendaId
       FROM usuario_fazendas uf
       JOIN users u ON u.id = uf.userId
       WHERE uf.userId = ? AND u.titularUserId = ?
       ORDER BY uf.fazendaId`,
      [userId, titularUserId],
    );
    return linhas.map((linha) => ({ userId: Number(linha.userId), fazendaId: Number(linha.fazendaId) }));
  }

  async function usuarioDaConta(id: number, titularUserId: number): Promise<UsuarioAdministravel | null> {
    const linhas = await ler<LinhaUsuario[]>(
      `SELECT id, name, email, papel, titularUserId, situacao, sessionVersion
       FROM users WHERE id = ? AND titularUserId = ?`,
      [id, titularUserId],
    );
    return linhas[0] ? usuarioDe(linhas[0]) : null;
  }

  function teto(ctx: ContextoAdministracao) {
    const pedido = pedidoDe(ctx);
    const delegaveis = CATALOGO_PERMISSOES
      .filter((item) => podeDelegarPermissao(pedido, item.id) === "permitido")
      .map((item) => item.id);
    const alterarPapel = podeDelegarPermissao(pedido, "usuarios.alterar_papel");
    return {
      delegaveis,
      alterarPapelDelegavel: false,
      motivoAlterarPapel: alterarPapel,
      possuirNaoAutorizaConcessao: true as const,
    };
  }

  return {
    async listarUsuarios(
      executorId: number,
      filtro?: { situacao?: string; papel?: string; pagina?: number; tamanho?: number },
    ): Promise<PaginaConsulta<UsuarioVisivel> | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const porta = consultarUsuarios(ctx, []);
      if (!porta.ok) return porta;
      if (filtro?.situacao != null && !SITUACOES.has(filtro.situacao)) return falha("alvo_invalido");
      if (filtro?.papel != null && !PAPEIS.has(filtro.papel)) return falha("alvo_invalido");
      const { pagina, tamanho, offset } = paginaDe(filtro);
      const where = ["titularUserId = ?"];
      const params: unknown[] = [ctx.identidade.titularUserId];
      if (ctx.identidade.papel !== "principal") where.push("papel = 'comum'");
      if (filtro?.situacao) {
        where.push("situacao = ?");
        params.push(filtro.situacao);
      }
      if (filtro?.papel) {
        where.push("papel = ?");
        params.push(filtro.papel);
      }
      const clausula = where.join(" AND ");
      const totais = await ler<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM users WHERE ${clausula}`,
        params,
      );
      const linhas = await ler<LinhaUsuario[]>(
        `SELECT id, name, email, papel, titularUserId, situacao, sessionVersion
         FROM users WHERE ${clausula}
         ORDER BY id
         LIMIT ? OFFSET ?`,
        [...params, tamanho, offset],
      );
      const consulta = consultarUsuarios(ctx, linhas.map(usuarioDe));
      if (!consulta.ok) return consulta;
      return { ok: true, itens: consulta.usuarios, total: Number(totais[0]?.total ?? 0), pagina, tamanho };
    },

    async detalharUsuario(executorId: number, alvoId: number): Promise<{ ok: true; usuario: UsuarioVisivel } | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const porta = consultarUsuarios(ctx, []);
      if (!porta.ok) return porta;
      const usuario = await usuarioDaConta(alvoId, ctx.identidade.titularUserId);
      if (!usuario) return falha("alvo_invalido");
      if (usuario.id !== ctx.identidade.id) {
        const administracao = podeAdministrarUsuario(pedidoDe(ctx), usuario);
        if (administracao !== "permitido") return falha(administracao);
      }
      const consulta = consultarUsuario(ctx, usuario);
      if (!consulta.ok) return consulta;
      return { ok: true, usuario: visivel(usuario) };
    },

    async listarPerfis(
      executorId: number,
      filtro?: { pagina?: number; tamanho?: number },
    ): Promise<PaginaConsulta<PerfilConhecido> | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const porta = consultarPerfis(ctx, []);
      if (!porta.ok) return porta;
      const { pagina, tamanho, offset } = paginaDe(filtro);
      const totais = await ler<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM perfis_acesso WHERE titularUserId = ?",
        [ctx.identidade.titularUserId],
      );
      const ids = await ler<RowDataPacket[]>(
        "SELECT id FROM perfis_acesso WHERE titularUserId = ? ORDER BY id LIMIT ? OFFSET ?",
        [ctx.identidade.titularUserId, tamanho, offset],
      );
      const carregados = await perfisDaConta(ctx.identidade.titularUserId, ids.map((linha) => Number(linha.id)));
      const consulta = consultarPerfis(ctx, carregados);
      if (!consulta.ok) return consulta;
      return { ok: true, itens: consulta.perfis, total: Number(totais[0]?.total ?? 0), pagina, tamanho };
    },

    async detalharPerfil(executorId: number, perfilId: number): Promise<{ ok: true; perfil: PerfilConhecido } | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const porta = consultarPerfis(ctx, []);
      if (!porta.ok) return porta;
      const linhas = await ler<RowDataPacket[]>(
        `SELECT id, titularUserId, nome, descricao, situacao, criadoPorUserId
         FROM perfis_acesso WHERE id = ? AND titularUserId = ?`,
        [perfilId, ctx.identidade.titularUserId],
      );
      const linha = linhas[0];
      if (!linha) return falha("alvo_invalido");
      const permissoes = await ler<RowDataPacket[]>(
        `SELECT pp.permissao
         FROM perfil_permissoes pp
         JOIN perfis_acesso p ON p.id = pp.perfilId
         WHERE pp.perfilId = ? AND p.titularUserId = ?
         ORDER BY pp.permissao`,
        [perfilId, ctx.identidade.titularUserId],
      );
      const perfil: PerfilConhecido = {
        id: Number(linha.id),
        titularUserId: Number(linha.titularUserId),
        nome: String(linha.nome),
        descricao: linha.descricao == null ? null : String(linha.descricao),
        situacao: linha.situacao === "inativo" ? "inativo" : "ativo",
        criadoPorUserId: Number(linha.criadoPorUserId),
        permissoes: permissoes.map((item) => String(item.permissao)),
      };
      const consulta = consultarPerfis(ctx, [perfil]);
      if (!consulta.ok) return consulta;
      const achado = consulta.perfis[0];
      if (!achado) return falha("alvo_invalido");
      return { ok: true, perfil: achado };
    },

    async consultarDelegacao(executorId: number): Promise<{
      ok: true;
      delegaveis: string[];
      alterarPapelDelegavel: false;
      motivoAlterarPapel: string;
      possuirNaoAutorizaConcessao: true;
      catalogo: { id: string; descricao: string; exclusivaDoPrincipal: boolean }[];
    } | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const gestao = podeExecutarOperacao(pedidoDe(ctx), "usuarios.gerenciar_permissoes");
      if (gestao !== "permitido") return falha(gestao);
      return {
        ok: true,
        ...teto(ctx),
        catalogo: CATALOGO_PERMISSOES.map((item) => ({
          id: item.id,
          descricao: item.descricao,
          exclusivaDoPrincipal: item.exclusivaDoPrincipal,
        })),
      };
    },

    async consultarPermissoes(
      executorId: number,
      alvoId: number,
    ): Promise<{
      ok: true;
      implicitas: boolean;
      individuais: { permissao: string; origemPerfilId: number | null }[];
      efetivas: string[];
      possuirNaoAutorizaConcessao: true;
    } | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const usuario = await usuarioDaConta(alvoId, ctx.identidade.titularUserId);
      if (!usuario) return falha("alvo_invalido");
      const proprio = usuario.id === ctx.identidade.id;
      if (!proprio) {
        const administracao = podeAdministrarUsuario(pedidoDe(ctx), usuario);
        if (administracao !== "permitido") return falha(administracao);
      }
      const linhas = await permissoesDe(usuario.id, usuario.titularUserId);
      if (proprio) {
        const gestao = podeExecutarOperacao(pedidoDe(ctx), "usuarios.gerenciar_permissoes");
        if (gestao !== "permitido") return falha(gestao);
        if (ctx.identidade.papel === "principal") {
          return {
            ok: true,
            implicitas: true,
            individuais: linhas.map((linha) => ({ permissao: linha.permissao, origemPerfilId: linha.origemPerfilId })),
            efetivas: CATALOGO_PERMISSOES.map((item) => item.id),
            possuirNaoAutorizaConcessao: true,
          };
        }
        return {
          ok: true,
          implicitas: false,
          individuais: linhas.map((linha) => ({ permissao: linha.permissao, origemPerfilId: linha.origemPerfilId })),
          efetivas: linhas.map((linha) => linha.permissao),
          possuirNaoAutorizaConcessao: true,
        };
      }
      const efetivas = consultarPermissoesEfetivas(ctx, usuario, linhas);
      if (!efetivas.ok) return efetivas;
      return {
        ok: true,
        implicitas: false,
        individuais: linhas.map((linha) => ({ permissao: linha.permissao, origemPerfilId: linha.origemPerfilId })),
        efetivas: efetivas.permissoes,
        possuirNaoAutorizaConcessao: true,
      };
    },

    async consultarFazendasDoExecutor(executorId: number): Promise<{
      ok: true;
      origem: "implicita" | "concedida";
      fazendaIds: number[];
      acessoOperacional: true;
    } | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const fazendas = fazendasDoExecutor(ctx);
      if (!fazendas.ok) return fazendas;
      return { ok: true, origem: fazendas.origem, fazendaIds: fazendas.fazendaIds, acessoOperacional: true };
    },

    async consultarFazendasDoUsuario(executorId: number, alvoId: number): Promise<{
      ok: true;
      fazendaIds: number[];
      acessoOperacional: true;
    } | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const usuario = await usuarioDaConta(alvoId, ctx.identidade.titularUserId);
      if (!usuario) return falha("alvo_invalido");
      if (usuario.id !== ctx.identidade.id) {
        const administracao = podeAdministrarUsuario(pedidoDe(ctx), usuario);
        if (administracao !== "permitido") return falha(administracao);
      }
      const conhecidas = await fazendasDaConta(ctx.identidade.titularUserId);
      const vinculos = await vinculosDe(usuario.id, usuario.titularUserId);
      const consulta = consultarFazendasDoUsuario(ctx, usuario, conhecidas, vinculos);
      if (!consulta.ok) return consulta;
      const autorizadas = ctx.identidade.papel === "principal"
        ? consulta.fazendaIds
        : consulta.fazendaIds.filter((id) => ctx.acesso?.fazendasAutorizadas.includes(id));
      return { ok: true, fazendaIds: autorizadas, acessoOperacional: true };
    },

    async consultarFazendasParaConcessao(executorId: number, alvoId: number): Promise<{
      ok: true;
      fazendas: { fazendaId: number; jaVinculada: boolean }[];
    } | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const usuario = await usuarioDaConta(alvoId, ctx.identidade.titularUserId);
      if (!usuario) return falha("alvo_invalido");
      const administracao = podeAdministrarUsuario(pedidoDe(ctx), usuario);
      if (administracao !== "permitido") return falha(administracao);
      const conhecidas = await fazendasDaConta(ctx.identidade.titularUserId);
      const vinculos = await vinculosDe(usuario.id, usuario.titularUserId);
      const pedido = pedidoDe(ctx);
      const fazendas = conhecidas
        .filter((fazenda) => podeConcederFazenda(pedido, usuario, fazenda) === "permitido")
        .map((fazenda) => ({
          fazendaId: fazenda.id,
          jaVinculada: vinculos.some((vinculo) => vinculo.fazendaId === fazenda.id),
        }));
      return { ok: true, fazendas };
    },

    async consultarVinculosInconsistentes(executorId: number, alvoId: number): Promise<{
      ok: true;
      vinculos: { fazendaId: number; acessoOperacional: false }[];
    } | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const usuario = await usuarioDaConta(alvoId, ctx.identidade.titularUserId);
      if (!usuario) return falha("alvo_invalido");
      if (ctx.identidade.papel !== "principal") return falha("reservado_ao_principal");
      const linhas = await ler<RowDataPacket[]>(
        `SELECT uf.fazendaId
         FROM usuario_fazendas uf
         JOIN users u ON u.id = uf.userId AND u.titularUserId = ?
         JOIN fazendas f ON f.id = uf.fazendaId
         WHERE uf.userId = ? AND f.userId <> u.titularUserId
         ORDER BY uf.fazendaId`,
        [ctx.identidade.titularUserId, usuario.id],
      );
      return {
        ok: true,
        vinculos: linhas.map((linha) => ({ fazendaId: Number(linha.fazendaId), acessoOperacional: false as const })),
      };
    },

    async preRevisaoReativacao(executorId: number, alvoId: number): Promise<{
      ok: true;
      altera: false;
      confirmacaoRevalidaNaTransacao: true;
      usuario: UsuarioVisivel;
      permissoesAtuais: { permissao: string; origemPerfilId: number | null }[];
      fazendasAtuais: { fazendaId: number; acessoOperacional: true }[];
      irregulares: string[];
      inconsistentes: { fazendaId: number; acessoOperacional: false }[];
      podeManter: { permissoes: string[]; fazendas: number[] };
      podeConceder: { permissoes: string[]; fazendas: number[] };
    } | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      const usuario = await usuarioDaConta(alvoId, ctx.identidade.titularUserId);
      if (!usuario) return falha("alvo_invalido");
      const administracao = podeAdministrarUsuario(pedidoDe(ctx), usuario);
      if (administracao !== "permitido") return falha(administracao);
      const operacao = podeExecutarOperacao(pedidoDe(ctx), "usuarios.inativar");
      if (operacao !== "permitido") return falha(operacao);
      if (usuario.situacao !== "inativo") return falha(usuario.situacao === "ativo" ? "nao_inativo" : "alvo_invalido");
      const principal = ctx.identidade.papel === "principal";
      const linhas = await permissoesDe(usuario.id, usuario.titularUserId);
      const conhecidas = await fazendasDaConta(ctx.identidade.titularUserId);
      const vinculos = await vinculosDe(usuario.id, usuario.titularUserId);
      const pedido = pedidoDe(ctx);
      const regulares = linhas.filter((linha) => !irregular(linha.permissao));
      const irregulares = linhas.filter((linha) => irregular(linha.permissao)).map((linha) => linha.permissao);
      const daConta = vinculos.filter((vinculo) => conhecidas.some((fazenda) => fazenda.id === vinculo.fazendaId));
      const fora = vinculos.filter((vinculo) => !conhecidas.some((fazenda) => fazenda.id === vinculo.fazendaId));
      const fazendasVisiveis = principal
        ? daConta
        : daConta.filter((vinculo) => ctx.acesso?.fazendasAutorizadas.includes(vinculo.fazendaId));
      const podeManterPermissoes = (principal ? linhas : regulares)
        .filter((linha) => !irregular(linha.permissao))
        .filter((linha) => podeConcederPermissao(pedido, usuario, linha.permissao) === "permitido")
        .map((linha) => linha.permissao);
      const podeConcederPermissoes = CATALOGO_PERMISSOES
        .filter((item) => podeConcederPermissao(pedido, usuario, item.id) === "permitido")
        .map((item) => item.id);
      return {
        ok: true,
        altera: false,
        confirmacaoRevalidaNaTransacao: true,
        usuario: visivel(usuario),
        permissoesAtuais: (principal ? linhas : regulares).map((linha) => ({
          permissao: linha.permissao,
          origemPerfilId: linha.origemPerfilId,
        })),
        fazendasAtuais: fazendasVisiveis.map((vinculo) => ({ fazendaId: vinculo.fazendaId, acessoOperacional: true as const })),
        irregulares: principal ? irregulares : [],
        inconsistentes: principal
          ? fora.map((vinculo) => ({ fazendaId: vinculo.fazendaId, acessoOperacional: false as const }))
          : [],
        podeManter: {
          permissoes: podeManterPermissoes,
          fazendas: fazendasVisiveis.map((vinculo) => vinculo.fazendaId),
        },
        podeConceder: {
          permissoes: podeConcederPermissoes,
          fazendas: conhecidas
            .filter((fazenda) => podeConcederFazenda(pedido, usuario, fazenda) === "permitido")
            .map((fazenda) => fazenda.id),
        },
      };
    },

    /**
     * Só o principal lê os eventos da própria conta.
     * O secundário, mesmo com auditoria.visualizar, não lê: falta o histórico da autoridade.
     */
    async consultarEventos(
      executorId: number,
      filtro?: {
        de?: string;
        ate?: string;
        operacao?: string;
        usuarioAfetadoId?: number;
        pagina?: number;
        tamanho?: number;
      },
    ): Promise<PaginaConsulta<EventoAdministrativoVisivel> | FalhaConsulta> {
      const ctx = await contexto(executorId);
      if ("motivo" in ctx) return ctx;
      if (ctx.identidade.papel === "comum") return falha("sem_permissao");
      if (ctx.identidade.papel !== "principal") {
        const possuiLeitura = ctx.permissoes.includes("auditoria.visualizar");
        return falha(possuiLeitura ? "AUDITORIA_HISTORICA_INDISPONIVEL" : "sem_permissao");
      }
      const de = filtro?.de == null ? null : instanteFiltro(filtro.de);
      const ate = filtro?.ate == null ? null : instanteFiltro(filtro.ate);
      if (filtro?.de != null && !de) return falha("alvo_invalido");
      if (filtro?.ate != null && !ate) return falha("alvo_invalido");
      if (de && ate && de > ate) return falha("alvo_invalido");
      if (filtro?.operacao != null && !/^[a-z][a-z0-9_.]{0,79}$/.test(filtro.operacao)) return falha("alvo_invalido");
      if (filtro?.usuarioAfetadoId != null && (!Number.isInteger(filtro.usuarioAfetadoId) || filtro.usuarioAfetadoId <= 0)) {
        return falha("alvo_invalido");
      }
      const { pagina, tamanho, offset } = paginaDe(filtro);
      const where = ["titularUserId = ?"];
      const params: unknown[] = [ctx.identidade.titularUserId];
      if (de) {
        where.push("criadoEm >= ?");
        params.push(de);
      }
      if (ate) {
        where.push("criadoEm <= ?");
        params.push(ate);
      }
      if (filtro?.operacao) {
        where.push("operacao = ?");
        params.push(filtro.operacao);
      }
      if (filtro?.usuarioAfetadoId) {
        const marcasUsuario = OPERACOES_USUARIO_AFETADO.users.map(() => "?").join(",");
        const marcasPermissao = OPERACOES_USUARIO_AFETADO.usuario_permissoes.map(() => "?").join(",");
        const marcasFazenda = OPERACOES_USUARIO_AFETADO.usuario_fazendas.map(() => "?").join(",");
        where.push(
          `((registroTipo = 'users' AND registroId = ? AND operacao IN (${marcasUsuario}))
            OR (registroTipo = 'usuario_permissoes' AND registroId = ? AND operacao IN (${marcasPermissao}))
            OR (registroTipo = 'usuario_fazendas' AND registroId = ? AND operacao IN (${marcasFazenda})))`,
        );
        params.push(
          filtro.usuarioAfetadoId,
          ...OPERACOES_USUARIO_AFETADO.users,
          filtro.usuarioAfetadoId,
          ...OPERACOES_USUARIO_AFETADO.usuario_permissoes,
          filtro.usuarioAfetadoId,
          ...OPERACOES_USUARIO_AFETADO.usuario_fazendas,
        );
      }
      const clausula = where.join(" AND ");
      const totais = await ler<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM auditoria_eventos WHERE ${clausula}`,
        params,
      );
      const linhas = await ler<RowDataPacket[]>(
        `SELECT id, criadoEm, executorUserId, executorNome, titularUserId, fazendaId, modulo, operacao, registroTipo, registroId, dadosAnteriores, dadosPosteriores
         FROM auditoria_eventos
         WHERE ${clausula}
         ORDER BY criadoEm DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, tamanho, offset],
      );
      return {
        ok: true,
        itens: linhas.map((linha) => eventoVisivel(linha)),
        total: Number(totais[0]?.total ?? 0),
        pagina,
        tamanho,
      };
    },
  };

  async function perfisDaConta(titularUserId: number, ids: readonly number[]): Promise<PerfilConhecido[]> {
    if (ids.length === 0) return [];
    const marcas = ids.map(() => "?").join(",");
    const linhas = await ler<RowDataPacket[]>(
      `SELECT p.id, p.titularUserId, p.nome, p.descricao, p.situacao, p.criadoPorUserId, pp.permissao
       FROM perfis_acesso p
       LEFT JOIN perfil_permissoes pp ON pp.perfilId = p.id
       WHERE p.titularUserId = ? AND p.id IN (${marcas})
       ORDER BY p.id, pp.permissao`,
      [titularUserId, ...ids],
    );
    const mapa = new Map<number, Omit<PerfilConhecido, "permissoes"> & { permissoes: string[] }>();
    for (const linha of linhas) {
      const id = Number(linha.id);
      let perfil = mapa.get(id);
      if (!perfil) {
        perfil = {
          id,
          titularUserId: Number(linha.titularUserId),
          nome: String(linha.nome),
          descricao: linha.descricao == null ? null : String(linha.descricao),
          situacao: linha.situacao === "inativo" ? "inativo" : "ativo",
          criadoPorUserId: Number(linha.criadoPorUserId),
          permissoes: [],
        };
        mapa.set(id, perfil);
      }
      if (linha.permissao != null) perfil.permissoes = [...perfil.permissoes, String(linha.permissao)];
    }
    return [...mapa.values()];
  }
}
