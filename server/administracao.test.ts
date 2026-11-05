import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { montarAcesso, type FazendaConhecida } from "./acessoFazendas";
import {
  consultarFazendasDoUsuario,
  consultarPermissoesEfetivas,
  consultarUsuarios,
  emitirRevisaoReativacao,
  fazendasDoExecutor,
  OPERACOES_QUE_INVALIDAM_SESSAO,
  planejarAlteracaoPapel,
  planejarAplicacaoPerfil,
  planejarConcessaoFazenda,
  planejarConcessaoPermissao,
  planejarConjuntoPermissoes,
  planejarCriacaoPerfil,
  planejarCriacaoUsuario,
  planejarEdicaoPerfil,
  planejarEdicaoUsuario,
  planejarInativacaoPerfil,
  planejarInativacaoUsuario,
  planejarReativacao,
  planejarRevogacaoFazenda,
  planejarRevogacaoPermissao,
  planejarSaneamentoFazenda,
  planejarSaneamentoPermissao,
  preverSessao,
  type ContextoAdministracao,
  type PerfilConhecido,
  type UsuarioAdministravel,
} from "./administracao";
import { CATALOGO_PERMISSOES } from "./catalogoPermissoes";
import type { LinhaPermissaoUsuario } from "./perfisAcesso";

const FAZENDA_J: FazendaConhecida = { id: 10, userId: 1 };
const FAZENDA_B: FazendaConhecida = { id: 20, userId: 1 };
const FAZENDA_ALHEIA: FazendaConhecida = { id: 30, userId: 9 };
const FAZENDAS = [FAZENDA_J, FAZENDA_B, FAZENDA_ALHEIA];
const here = dirname(fileURLToPath(import.meta.url));

function pessoa(parcial: Partial<IdentidadeUsuario> & Pick<IdentidadeUsuario, "id" | "papel">): IdentidadeUsuario {
  return {
    openId: `segredo-openid-${parcial.id}`,
    name: `Pessoa ${parcial.id}`,
    email: `pessoa-${parcial.id}@isolado.local`,
    role: parcial.papel === "principal" ? "admin" : "user",
    titularUserId: 1,
    situacao: "ativo",
    sessionVersion: 0,
    ...parcial,
  };
}

function usuarioDe(identidade: IdentidadeUsuario, extra?: Partial<UsuarioAdministravel>): UsuarioAdministravel {
  return {
    id: identidade.id,
    name: identidade.name || "",
    email: identidade.email,
    papel: identidade.papel,
    role: identidade.role,
    titularUserId: identidade.titularUserId,
    situacao: identidade.situacao,
    sessionVersion: identidade.sessionVersion,
    openId: identidade.openId,
    passwordHash: "hash-secreto",
    ...extra,
  };
}

function contexto(
  identidade: IdentidadeUsuario,
  permissoes: string[] = [],
  vinculos: Array<{ userId: number; fazendaId: number }> = [],
): ContextoAdministracao {
  return {
    identidade,
    acesso: montarAcesso({ identidade, fazendasDoTitular: [FAZENDA_J, FAZENDA_B], vinculos }),
    permissoes,
    permissoesInformadasPeloCliente: CATALOGO_PERMISSOES.map((item) => item.id),
    papelInformadoPeloCliente: "principal",
    executorInformadoPeloCliente: 99,
    titularInformadoPeloCliente: 9,
  };
}

function linha(userId: number, permissao: string): LinhaPermissaoUsuario {
  return { userId, titularUserId: 1, permissao, concedidoPorUserId: 1, origemPerfilId: null };
}

const principal = pessoa({ id: 1, papel: "principal", titularUserId: 1 });
const secundario = pessoa({ id: 3, papel: "secundario" });
const comum = pessoa({ id: 2, papel: "comum" });
const alvo = usuarioDe(pessoa({ id: 4, papel: "comum" }));
const alvoSecundario = usuarioDe(secundario);
const inativo = usuarioDe(pessoa({ id: 4, papel: "comum", situacao: "inativo" }));
const perfilCurral: PerfilConhecido = {
  id: 30,
  titularUserId: 1,
  nome: "Curral",
  descricao: null,
  situacao: "ativo",
  criadoPorUserId: 1,
  permissoes: ["animais.visualizar", "pesagens.criar"],
};

describe("hierarquia administrativa", () => {
  it("o principal administra usuário comum", () => {
    const plano = planejarInativacaoUsuario(contexto(principal), alvo);
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.plano.usuario.situacao).toBe("inativo");
    expect(plano.plano.permissoesPreservadas).toBe(true);
    expect(plano.plano.sessao.invalidar).toBe(true);
  });

  it("o principal administra o secundário e não cria outro principal", () => {
    const papel = planejarAlteracaoPapel(contexto(principal), alvoSecundario, "comum");
    expect(papel.ok).toBe(true);
    if (!papel.ok) return;
    expect(papel.plano.usuario.papel).toBe("comum");
    expect(papel.plano.usuario.role).toBe("user");
    expect(papel.plano.titularPreservado).toBe(true);
    const outroPrincipal = planejarCriacaoUsuario(contexto(principal), {
      name: "Outro dono",
      email: "outro@isolado.local",
      papel: "principal",
      senha: "segredo-senha",
      titularUserId: 9,
    }, []);
    expect(outroPrincipal).toMatchObject({ ok: false, motivo: "hierarquia_recusada" });
  });

  it("o secundário administra o comum quando tem a permissão", () => {
    const plano = planejarInativacaoUsuario(contexto(secundario, ["usuarios.inativar"]), alvo);
    expect(plano.ok).toBe(true);
  });

  it("o secundário sem a permissão da operação é recusado", () => {
    expect(planejarInativacaoUsuario(contexto(secundario, ["usuarios.criar"]), alvo)).toMatchObject({
      ok: false,
      motivo: "sem_permissao",
    });
    expect(planejarEdicaoUsuario(contexto(secundario, ["usuarios.inativar"]), alvo, { name: "Novo nome" }, [])).toMatchObject({
      ok: false,
      motivo: "sem_permissao",
    });
  });

  it("o secundário não administra outro secundário nem cria administrador", () => {
    const outro = usuarioDe(pessoa({ id: 5, papel: "secundario" }));
    expect(planejarInativacaoUsuario(contexto(secundario, ["usuarios.inativar"]), outro)).toMatchObject({
      ok: false,
      motivo: "reservado_ao_principal",
    });
    expect(planejarCriacaoUsuario(contexto(secundario, ["usuarios.criar"]), {
      name: "Novo admin",
      email: "novo-admin@isolado.local",
      papel: "secundario",
    }, [])).toMatchObject({ ok: false, motivo: "reservado_ao_principal" });
  });

  it("o comum não administra mesmo enviando identificadores", () => {
    const ctx = contexto(comum, ["usuarios.criar", "usuarios.inativar", "usuarios.gerenciar_permissoes", "usuarios.gerenciar_acessos"]);
    expect(planejarInativacaoUsuario(ctx, alvo)).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(planejarConcessaoPermissao(ctx, alvo, [], "animais.visualizar")).toMatchObject({ ok: false, motivo: "sem_permissao" });
    expect(consultarUsuarios(ctx, [alvo]).ok).toBe(false);
  });

  it("autoalteração de papel, permissão e fazenda é recusada", () => {
    const ctx = contexto(secundario, ["usuarios.gerenciar_permissoes", "usuarios.gerenciar_acessos", "usuarios.criar"], [{ userId: 3, fazendaId: 10 }]);
    expect(planejarConcessaoPermissao(ctx, alvoSecundario, [], "animais.visualizar")).toMatchObject({
      ok: false,
      motivo: "auto_modificacao",
    });
    expect(planejarAlteracaoPapel(ctx, alvoSecundario, "comum")).toMatchObject({ ok: false, motivo: "auto_modificacao" });
    expect(planejarConcessaoFazenda(ctx, alvoSecundario, FAZENDA_J, [])).toMatchObject({ ok: false, motivo: "auto_modificacao" });
    expect(planejarInativacaoUsuario(contexto(principal), usuarioDe(principal))).toMatchObject({
      ok: false,
      motivo: "alvo_protegido",
    });
  });

  it("outra conta é recusada e o titular informado pelo navegador não entra", () => {
    const alheio = usuarioDe(pessoa({ id: 8, papel: "comum", titularUserId: 9 }));
    expect(planejarEdicaoUsuario(contexto(principal), alheio, { name: "Troca" }, [])).toMatchObject({
      ok: false,
      motivo: "outro_titular",
    });
    const criado = planejarCriacaoUsuario(contexto(principal), {
      name: "Funcionário",
      email: "funcionario@isolado.local",
      papel: "comum",
      senha: "segredo-senha",
      passwordHash: "hash-secreto",
      openId: "segredo-openid-novo",
      token: "segredo-token",
      titularUserId: 9,
      role: "admin",
    }, [{ id: 4, email: "Funcionario@Isolado.local" }]);
    expect(criado).toMatchObject({ ok: false, motivo: "email_duplicado" });
    const novo = planejarCriacaoUsuario(contexto(principal), {
      name: "Funcionário",
      email: "curral@isolado.local",
      papel: "secundario",
      senha: "segredo-senha",
      openId: "segredo-openid-novo",
      titularUserId: 9,
    }, []);
    expect(novo.ok).toBe(true);
    if (!novo.ok) return;
    expect(novo.plano.usuario.titularUserId).toBe(1);
    expect(novo.plano.usuario.papel).toBe("secundario");
    expect(novo.plano.usuario.role).toBe("user");
    const texto = JSON.stringify(novo.plano);
    expect(texto).not.toContain("segredo-senha");
    expect(texto).not.toContain("segredo-openid");
    expect(texto).not.toContain("hash-secreto");
  });
});

describe("permissões e perfis", () => {
  const ctx = contexto(secundario, ["usuarios.gerenciar_permissoes", "animais.visualizar"], [{ userId: 3, fazendaId: 10 }]);

  it("concede permissão dentro do teto", () => {
    const plano = planejarConcessaoPermissao(ctx, alvo, [], "animais.visualizar");
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.plano.novas.map((item) => item.permissao)).toEqual(["animais.visualizar"]);
    expect(plano.plano.sessao.sessionVersionPrevista).toBe(1);
    expect(plano.plano.auditoria.evento.executorUserId).toBe(3);
    expect(plano.plano.auditoria.evento.titularUserId).toBe(1);
  });

  it("recusa concessão acima do teto, desconhecida e duplicada", () => {
    expect(planejarConcessaoPermissao(ctx, alvo, [], "animais.editar")).toMatchObject({
      ok: false,
      motivo: "acima_do_teto",
    });
    expect(planejarConcessaoPermissao(contexto(principal), alvo, [], "vendas.estornar")).toMatchObject({
      ok: false,
      motivo: "permissao_invalida",
    });
    expect(planejarConcessaoPermissao(contexto(principal), alvo, [linha(4, "animais.visualizar")], "animais.visualizar")).toMatchObject({
      ok: false,
      motivo: "concessao_duplicada",
    });
    expect(planejarConcessaoPermissao(contexto(principal), alvo, [], "usuarios.alterar_papel")).toMatchObject({
      ok: false,
      motivo: "reservado_ao_principal",
    });
  });

  it("revoga dentro do teto e recusa revogação acima dele", () => {
    const atual = [linha(4, "animais.visualizar"), linha(4, "pesagens.criar")];
    const plano = planejarRevogacaoPermissao(contexto(principal), alvo, atual, "pesagens.criar");
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.plano.revogada).toBe("pesagens.criar");
    expect(plano.plano.restantes).toEqual(["animais.visualizar"]);
    expect(plano.plano.sessao.invalidar).toBe(true);
    expect(planejarRevogacaoPermissao(ctx, alvo, [linha(4, "animais.editar")], "animais.editar")).toMatchObject({
      ok: false,
      motivo: "acima_do_teto",
      permissao: "animais.editar",
    });
  });

  it("aplica o perfil inteiro e recusa aplicação parcial", () => {
    const plano = planejarAplicacaoPerfil(contexto(principal), alvo, [], perfilCurral);
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.plano.novas.map((item) => item.permissao)).toEqual(["animais.visualizar", "pesagens.criar"]);
    expect(plano.plano.perfilInalterado).toBe(true);
    expect(plano.plano.operacao).toBe("perfil.aplicar");
    const parcial = planejarAplicacaoPerfil(ctx, alvo, [], perfilCurral);
    expect(parcial).toMatchObject({ ok: false, motivo: "acima_do_teto", permissao: "pesagens.criar" });
    expect(parcial).not.toHaveProperty("plano");
    const duplicada = planejarAplicacaoPerfil(contexto(principal), alvo, [linha(4, "animais.visualizar")], perfilCurral);
    expect(duplicada).toMatchObject({ ok: false, motivo: "concessao_duplicada" });
    expect(duplicada).not.toHaveProperty("plano");
  });

  it("recusa conjunto parcial e não grava a permissão que cabia", () => {
    const conjunto = planejarConjuntoPermissoes(ctx, alvo, [], ["animais.visualizar", "animais.editar"]);
    expect(conjunto).toMatchObject({ ok: false, motivo: "acima_do_teto", permissao: "animais.editar" });
    expect(conjunto).not.toHaveProperty("plano");
  });

  it("o secundário só grava no perfil permissão que poderia conceder", () => {
    const recusado = planejarCriacaoPerfil(ctx, {
      nome: "Curral",
      permissoes: ["animais.visualizar", "animais.editar"],
      titularUserId: 9,
    }, []);
    expect(recusado).toMatchObject({ ok: false, motivo: "acima_do_teto" });
    const criado = planejarCriacaoPerfil(ctx, { nome: "Curral", permissoes: ["animais.visualizar"] }, []);
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;
    expect(criado.plano.perfil.titularUserId).toBe(1);
    expect(criado.plano.sessao.invalidar).toBe(false);
  });

  it("editar ou inativar o perfil não mexe nas cópias já entregues", () => {
    const editado = planejarEdicaoPerfil(contexto(principal), perfilCurral, {
      nome: "Curral novo",
      permissoes: ["animais.visualizar"],
    }, [perfilCurral]);
    expect(editado.ok).toBe(true);
    if (!editado.ok) return;
    expect(editado.plano.copiasExistentes).toBe("preservadas");
    expect(editado.plano.perfil.permissoes).toEqual(["animais.visualizar"]);
    expect(editado.plano.sessao.invalidar).toBe(false);
    const inativado = planejarInativacaoPerfil(contexto(principal), perfilCurral);
    expect(inativado.ok).toBe(true);
    if (!inativado.ok) return;
    expect(inativado.plano.perfil.permissoes).toEqual(["animais.visualizar", "pesagens.criar"]);
    expect(inativado.plano.copiasExistentes).toBe("preservadas");
    expect(planejarAplicacaoPerfil(contexto(principal), alvo, [], inativado.plano.perfil)).toMatchObject({
      ok: false,
      motivo: "perfil_inativo",
    });
  });

  it("consulta a permissão efetiva sem aceitar o perfil no lugar da cópia", () => {
    const consulta = consultarPermissoesEfetivas(contexto(principal), alvo, [linha(4, "animais.visualizar")]);
    expect(consulta).toEqual({ ok: true, permissoes: ["animais.visualizar"] });
  });
});

describe("fazendas", () => {
  it("concede fazenda da própria conta e o principal não ganha vínculo", () => {
    const plano = planejarConcessaoFazenda(contexto(principal), alvo, FAZENDA_J, []);
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.plano.vinculo).toMatchObject({ userId: 4, fazendaId: 10, concedidoPorUserId: 1 });
    expect(plano.plano.auditoria.evento.fazendaId).toBe(10);
    const proprio = fazendasDoExecutor(contexto(principal));
    expect(proprio).toMatchObject({ ok: true, origem: "implicita", fazendaIds: [10, 20], criarVinculo: false });
    expect(planejarConcessaoFazenda(contexto(principal), usuarioDe(principal), FAZENDA_J, [])).toMatchObject({
      ok: false,
      motivo: "alvo_protegido",
    });
  });

  it("recusa fazenda de outra conta", () => {
    expect(planejarConcessaoFazenda(contexto(principal), alvo, FAZENDA_ALHEIA, [])).toMatchObject({
      ok: false,
      motivo: "outro_titular",
    });
  });

  it("recusa fazenda que o secundário não administra", () => {
    const ctx = contexto(secundario, ["usuarios.gerenciar_acessos"], [{ userId: 3, fazendaId: 10 }]);
    expect(planejarConcessaoFazenda(ctx, alvo, FAZENDA_B, [])).toMatchObject({ ok: false, motivo: "sem_fazenda" });
    expect(planejarRevogacaoFazenda(ctx, alvo, FAZENDA_B, [{ userId: 4, fazendaId: 20 }])).toMatchObject({
      ok: false,
      motivo: "sem_fazenda",
    });
    const consulta = consultarFazendasDoUsuario(ctx, alvo, FAZENDAS, [
      { userId: 4, fazendaId: 10 },
      { userId: 4, fazendaId: 30 },
    ]);
    expect(consulta).toMatchObject({ ok: true, fazendaIds: [10], criarVinculo: false });
  });

  it("recusa autoalteração de acesso", () => {
    const ctx = contexto(secundario, ["usuarios.gerenciar_acessos"], [{ userId: 3, fazendaId: 10 }]);
    expect(planejarRevogacaoFazenda(ctx, alvoSecundario, FAZENDA_J, [{ userId: 3, fazendaId: 10 }])).toMatchObject({
      ok: false,
      motivo: "auto_modificacao",
    });
  });
});

describe("reativação com revisão", () => {
  const base = {
    usuario: inativo,
    permissoesAtuais: [linha(4, "animais.visualizar")],
    fazendasAtuais: [10],
    fazendasConhecidas: FAZENDAS,
    permissoesPropostas: ["animais.visualizar", "pesagens.criar"],
    fazendasPropostas: [10],
  };

  it("não deixa a pessoa revisar os próprios acessos", () => {
    const proprio = { ...inativo, id: 3, papel: "secundario" as const };
    const ctx = contexto(secundario, ["usuarios.inativar", "usuarios.gerenciar_permissoes"]);
    expect(emitirRevisaoReativacao(ctx, { ...base, usuario: proprio })).toMatchObject({
      ok: false,
      motivo: "auto_modificacao",
    });
  });

  it("recusa reativação sem revisão, mesmo com confirmado=true", () => {
    const plano = planejarReativacao(contexto(principal), { ...base, confirmado: true });
    expect(plano).toMatchObject({ ok: false, motivo: "revisao_ausente" });
    expect(plano).not.toHaveProperty("plano");
  });

  it("a revisão não reativa e a confirmação precisa do selo daquele estado", () => {
    const revisao = emitirRevisaoReativacao(contexto(principal), { ...base, confirmado: true });
    expect(revisao.ok).toBe(true);
    if (!revisao.ok) return;
    expect(revisao).not.toHaveProperty("plano");
    expect(revisao.revisao.estado.situacao).toBe("inativo");
    expect(revisao.revisao.estado.executorUserId).toBe(1);
    expect(revisao.revisao.autenticacao).toBe("nao_autenticada");
    const trocada = emitirRevisaoReativacao(contexto(principal), {
      ...base,
      permissoesPropostas: ["pesagens.criar", "animais.visualizar"],
    });
    expect(trocada.ok).toBe(true);
    if (!trocada.ok) return;
    expect(trocada.revisao.selo).toBe(revisao.revisao.selo);
    const plano = planejarReativacao(contexto(principal), { ...base, selo: revisao.revisao.selo, confirmado: true });
    expect(plano.ok).toBe(true);
  });

  it("recusa confirmação de estado desatualizado", () => {
    const revisao = emitirRevisaoReativacao(contexto(principal), base);
    expect(revisao.ok).toBe(true);
    if (!revisao.ok) return;
    const mudouPermissao = planejarReativacao(contexto(principal), {
      ...base,
      permissoesAtuais: [linha(4, "animais.visualizar"), linha(4, "pesagens.criar")],
      selo: revisao.revisao.selo,
    });
    expect(mudouPermissao).toMatchObject({ ok: false, motivo: "revisao_desatualizada" });
    const mudouSessao = planejarReativacao(contexto(principal), {
      ...base,
      usuario: { ...inativo, sessionVersion: 2 },
      selo: revisao.revisao.selo,
    });
    expect(mudouSessao).toMatchObject({ ok: false, motivo: "revisao_desatualizada" });
  });

  it("recusa reativação com permissão acima do teto e não devolve o restante", () => {
    const ctx = contexto(secundario, [
      "usuarios.inativar",
      "usuarios.gerenciar_permissoes",
      "usuarios.gerenciar_acessos",
      "animais.visualizar",
    ], [{ userId: 3, fazendaId: 10 }]);
    const proposta = {
      ...base,
      permissoesPropostas: ["animais.visualizar", "animais.editar"],
    };
    expect(emitirRevisaoReativacao(ctx, proposta)).toMatchObject({
      ok: false,
      motivo: "acima_do_teto",
      permissao: "animais.editar",
    });
    const revisaoValida = emitirRevisaoReativacao(contexto(principal), proposta);
    expect(revisaoValida.ok).toBe(true);
    if (!revisaoValida.ok) return;
    const confirmadaPeloSecundario = planejarReativacao(ctx, {
      ...proposta,
      selo: revisaoValida.revisao.selo,
      executorDaRevisao: revisaoValida.revisao.estado.executorUserId,
    });
    expect(confirmadaPeloSecundario).toMatchObject({ ok: false, motivo: "revisao_outro_executor" });
    expect(confirmadaPeloSecundario).not.toHaveProperty("plano");
    const seloDoSecundario = emitirRevisaoReativacao(ctx, proposta);
    expect(seloDoSecundario).toMatchObject({ ok: false, motivo: "acima_do_teto" });
    expect(seloDoSecundario).not.toHaveProperty("plano");
  });

  it("recusa reativação com fazenda que o secundário não administra", () => {
    const ctx = contexto(secundario, [
      "usuarios.inativar",
      "usuarios.gerenciar_permissoes",
      "usuarios.gerenciar_acessos",
      "animais.visualizar",
    ], [{ userId: 3, fazendaId: 10 }]);
    const proposta = { ...base, permissoesPropostas: ["animais.visualizar"], fazendasPropostas: [20] };
    expect(emitirRevisaoReativacao(ctx, proposta)).toMatchObject({ ok: false, motivo: "sem_fazenda", fazendaId: 20 });
    expect(emitirRevisaoReativacao(ctx, proposta)).not.toHaveProperty("plano");
  });

  it("planeja a reativação válida com sessão nova e auditoria, sem segredo", () => {
    const revisao = emitirRevisaoReativacao(contexto(principal), base);
    expect(revisao.ok).toBe(true);
    if (!revisao.ok) return;
    const plano = planejarReativacao(contexto(principal), { ...base, selo: revisao.revisao.selo });
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.plano.usuario.situacao).toBe("ativo");
    expect(plano.plano.concederPermissoes).toEqual(["pesagens.criar"]);
    expect(plano.plano.revogarPermissoes).toEqual([]);
    expect(plano.plano.concederFazendas).toEqual([]);
    expect(plano.plano.revogarFazendas).toEqual([]);
    expect(plano.plano.sessao).toMatchObject({ userId: 4, invalidar: true, sessionVersionAtual: 0, sessionVersionPrevista: 1 });
    expect(plano.plano.transacao).toBe("unica");
    expect(plano.plano.historicoPreservado).toBe(true);
    expect(plano.plano.auditoria.evento.operacao).toBe("usuario.reativar");
    expect(plano.plano.auditoria.evento.executorUserId).toBe(1);
    expect(plano.plano.auditoria.evento.titularUserId).toBe(1);
    const texto = JSON.stringify(plano.plano);
    expect(texto).not.toContain("segredo-openid");
    expect(texto).not.toContain("hash-secreto");
    expect(texto).not.toContain("password");
    expect(texto).not.toContain("token");
  });

  it("qualquer validação reprovada impede o plano inteiro", () => {
    const retiradaAcima = {
      usuario: inativo,
      permissoesAtuais: [linha(4, "animais.visualizar"), linha(4, "estoque.estornar")],
      fazendasAtuais: [10],
      fazendasConhecidas: FAZENDAS,
      permissoesPropostas: ["animais.visualizar"],
      fazendasPropostas: [10],
    };
    const ctx = contexto(secundario, [
      "usuarios.inativar",
      "usuarios.gerenciar_permissoes",
      "usuarios.gerenciar_acessos",
      "animais.visualizar",
    ], [{ userId: 3, fazendaId: 10 }]);
    const resultado = emitirRevisaoReativacao(ctx, retiradaAcima);
    expect(resultado).toMatchObject({ ok: false, motivo: "acima_do_teto", permissao: "estoque.estornar" });
    expect(resultado).not.toHaveProperty("plano");
    expect(planejarReativacao(contexto(principal), { ...base, selo: "selo-inventado" })).toMatchObject({
      ok: false,
      motivo: "revisao_desatualizada",
    });
  });
});

describe("saneamento administrativo", () => {
  const irregular = [linha(4, "animais.visualizar"), linha(4, "usuarios.alterar_papel")];
  const vinculoIrregular = [
    { userId: 4, fazendaId: 10 },
    { userId: 4, fazendaId: 30 },
  ];

  it("o principal remove permissão irregular e prevê auditoria e sessão", () => {
    const plano = planejarSaneamentoPermissao(contexto(principal), alvo, irregular, "usuarios.alterar_papel");
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.plano.revogada).toBe("usuarios.alterar_papel");
    expect(plano.plano.restantes).toEqual(["animais.visualizar"]);
    expect(plano.plano.concessao).toBe(false);
    expect(plano.plano.titularPreservado).toBe(true);
    expect(plano.plano.sessao).toMatchObject({ userId: 4, invalidar: true, sessionVersionPrevista: 1 });
    expect(plano.plano.auditoria.evento.operacao).toBe("permissao.sanear");
    expect(plano.plano.auditoria.evento.executorUserId).toBe(1);
    expect(JSON.stringify(plano.plano.auditoria.evento.dadosPosteriores)).toContain("usuarios.alterar_papel");
    expect(planejarConcessaoPermissao(contexto(principal), alvo, [], "usuarios.alterar_papel")).toMatchObject({
      ok: false,
      motivo: "reservado_ao_principal",
    });
  });

  it("secundário e comum não usam a exceção de permissão", () => {
    const secundarioCtx = contexto(secundario, ["usuarios.gerenciar_permissoes", "usuarios.alterar_papel"]);
    expect(planejarSaneamentoPermissao(secundarioCtx, alvo, irregular, "usuarios.alterar_papel")).toMatchObject({
      ok: false,
      motivo: "reservado_ao_principal",
    });
    const comumCtx = contexto(comum, ["usuarios.gerenciar_permissoes", "usuarios.alterar_papel"]);
    expect(planejarSaneamentoPermissao(comumCtx, alvo, irregular, "usuarios.alterar_papel")).toMatchObject({
      ok: false,
      motivo: "sem_permissao",
    });
  });

  it("o principal não saneia a si nem outra conta, e não remove permissão ausente", () => {
    expect(planejarSaneamentoPermissao(contexto(principal), usuarioDe(principal), [linha(1, "usuarios.alterar_papel")], "usuarios.alterar_papel")).toMatchObject({
      ok: false,
      motivo: "auto_modificacao",
    });
    const alheio = usuarioDe(pessoa({ id: 8, papel: "comum", titularUserId: 9 }));
    expect(planejarSaneamentoPermissao(contexto(principal), alheio, [linha(8, "usuarios.alterar_papel")], "usuarios.alterar_papel")).toMatchObject({
      ok: false,
      motivo: "outro_titular",
    });
    expect(planejarSaneamentoPermissao(contexto(principal), alvo, [linha(4, "animais.visualizar")], "usuarios.alterar_papel")).toMatchObject({
      ok: false,
      motivo: "permissao_ausente",
    });
  });

  it("o principal remove vínculo irregular e não concede fazenda de outra conta", () => {
    const plano = planejarSaneamentoFazenda(contexto(principal), alvo, 30, vinculoIrregular, FAZENDAS);
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.plano.fazendaId).toBe(30);
    expect(plano.plano.concessao).toBe(false);
    expect(plano.plano.proprietarioInalterado).toBe(true);
    expect(plano.plano.registrosOperacionaisInalterados).toBe(true);
    expect(plano.plano.sessao.invalidar).toBe(true);
    expect(plano.plano.auditoria.evento.operacao).toBe("fazenda.sanear");
    expect(plano.plano.auditoria.evento.fazendaId).toBe(30);
    expect(planejarSaneamentoFazenda(contexto(principal), alvo, 30, [{ userId: 4, fazendaId: 10 }], FAZENDAS)).toMatchObject({
      ok: false,
      motivo: "vinculo_ausente",
    });
    expect(planejarConcessaoFazenda(contexto(principal), alvo, FAZENDA_ALHEIA, [])).toMatchObject({
      ok: false,
      motivo: "outro_titular",
    });
    expect(planejarSaneamentoFazenda(contexto(principal), alvo, 10, vinculoIrregular, FAZENDAS)).toMatchObject({
      ok: false,
      motivo: "saneamento_recusado",
    });
  });

  it("o secundário não remove vínculo irregular pela exceção", () => {
    const ctx = contexto(secundario, ["usuarios.gerenciar_acessos"], [{ userId: 3, fazendaId: 10 }]);
    expect(planejarSaneamentoFazenda(ctx, alvo, 30, vinculoIrregular, FAZENDAS)).toMatchObject({
      ok: false,
      motivo: "reservado_ao_principal",
    });
  });

  it("reativação com saneamento válido sai inteira e irregularidade não corrigível é recusada", () => {
    const entrada = {
      usuario: inativo,
      permissoesAtuais: irregular,
      fazendasAtuais: [10, 30],
      fazendasConhecidas: FAZENDAS,
      permissoesPropostas: ["animais.visualizar", "pesagens.criar"],
      fazendasPropostas: [10],
    };
    const revisao = emitirRevisaoReativacao(contexto(principal), entrada);
    expect(revisao.ok).toBe(true);
    if (!revisao.ok) return;
    expect(revisao.revisao.autenticacao).toBe("nao_autenticada");
    const plano = planejarReativacao(contexto(principal), { ...entrada, selo: revisao.revisao.selo });
    expect(plano.ok).toBe(true);
    if (!plano.ok) return;
    expect(plano.plano.manterPermissoes).toEqual(["animais.visualizar"]);
    expect(plano.plano.concederPermissoes).toEqual(["pesagens.criar"]);
    expect(plano.plano.revogarPermissoes).toEqual([]);
    expect(plano.plano.sanearPermissoes).toEqual(["usuarios.alterar_papel"]);
    expect(plano.plano.manterFazendas).toEqual([10]);
    expect(plano.plano.sanearFazendas).toEqual([30]);
    expect(plano.plano.concederFazendas).toEqual([]);
    expect(plano.plano.revogarFazendas).toEqual([]);
    expect(plano.plano.revalidarNaTransacao).toBe(true);
    expect(plano.plano.transacao).toBe("unica");
    expect(plano.plano.sessao.invalidar).toBe(true);
    expect(plano.plano.auditoria.evento.operacao).toBe("usuario.reativar");
    expect(plano.plano.usuario.titularUserId).toBe(1);

    const secundarioCtx = contexto(secundario, [
      "usuarios.inativar",
      "usuarios.gerenciar_permissoes",
      "usuarios.gerenciar_acessos",
      "animais.visualizar",
      "pesagens.criar",
    ], [{ userId: 3, fazendaId: 10 }]);
    const recusa = emitirRevisaoReativacao(secundarioCtx, entrada);
    expect(recusa).toMatchObject({ ok: false, motivo: "reservado_ao_principal" });
    expect(recusa).not.toHaveProperty("plano");

    const mantida = emitirRevisaoReativacao(contexto(principal), {
      ...entrada,
      permissoesPropostas: ["animais.visualizar", "usuarios.alterar_papel"],
    });
    expect(mantida).toMatchObject({ ok: false, motivo: "irregular_mantida", permissao: "usuarios.alterar_papel" });
    expect(mantida).not.toHaveProperty("plano");
    const fazendaMantida = emitirRevisaoReativacao(contexto(principal), {
      ...entrada,
      fazendasPropostas: [10, 30],
    });
    expect(fazendaMantida).toMatchObject({ ok: false, motivo: "irregular_mantida", fazendaId: 30 });
    expect(fazendaMantida).not.toHaveProperty("plano");
  });

  it("o mesmo executor revalida o teto depois do selo", () => {
    const largo = contexto(secundario, [
      "usuarios.inativar",
      "usuarios.gerenciar_permissoes",
      "usuarios.gerenciar_acessos",
      "animais.visualizar",
      "animais.editar",
    ], [{ userId: 3, fazendaId: 10 }]);
    const entrada = {
      usuario: inativo,
      permissoesAtuais: [linha(4, "animais.visualizar")],
      fazendasAtuais: [10],
      fazendasConhecidas: FAZENDAS,
      permissoesPropostas: ["animais.visualizar", "animais.editar"],
      fazendasPropostas: [10],
    };
    const revisao = emitirRevisaoReativacao(largo, entrada);
    expect(revisao.ok).toBe(true);
    if (!revisao.ok) return;
    const estreito = contexto(secundario, [
      "usuarios.inativar",
      "usuarios.gerenciar_permissoes",
      "usuarios.gerenciar_acessos",
      "animais.visualizar",
    ], [{ userId: 3, fazendaId: 10 }]);
    const confirmacao = planejarReativacao(estreito, { ...entrada, selo: revisao.revisao.selo });
    expect(confirmacao).toMatchObject({ ok: false, motivo: "acima_do_teto", permissao: "animais.editar" });
    expect(confirmacao).not.toHaveProperty("plano");
  });
});

describe("sessão, auditoria e compatibilidade", () => {
  it("prevê invalidar sessão nas operações administrativas sensíveis, inclusive senha futura", () => {
    expect(OPERACOES_QUE_INVALIDAM_SESSAO).toEqual([
      "usuario.inativar",
      "usuario.reativar",
      "usuario.alterar_papel",
      "usuario.alterar_senha",
      "permissao.conceder",
      "permissao.revogar",
      "perfil.aplicar",
      "fazenda.conceder",
      "fazenda.revogar",
      "permissao.sanear",
      "fazenda.sanear",
    ]);
    expect(preverSessao("usuario.alterar_senha", 4)).toMatchObject({ invalidar: true, sessionVersionPrevista: 5 });
    expect(preverSessao("usuario.editar", 4)).toMatchObject({ invalidar: false, sessionVersionPrevista: 4 });
    const edicao = planejarEdicaoUsuario(contexto(principal), alvo, {
      name: "Pessoa quatro",
      titularUserId: 9,
      senha: "segredo-senha",
    }, []);
    expect(edicao.ok).toBe(true);
    if (!edicao.ok) return;
    expect(edicao.plano.usuario.titularUserId).toBe(1);
    expect(edicao.plano.sessao.invalidar).toBe(false);
    expect(JSON.stringify(edicao.plano)).not.toContain("segredo-senha");
    expect(edicao.plano.auditoria.evento.operacao).toBe("usuario.editar");
  });

  it("a consulta não devolve segredo nem usuário de outra conta", () => {
    const lista = consultarUsuarios(contexto(principal), [
      alvo,
      usuarioDe(pessoa({ id: 8, papel: "comum", titularUserId: 9 })),
    ]);
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect(lista.usuarios.map((item) => item.id)).toEqual([4]);
    const texto = JSON.stringify(lista.usuarios);
    expect(texto).not.toContain("segredo-openid");
    expect(texto).not.toContain("hash-secreto");
  });

  it("não entra nos módulos operacionais nem no banco", () => {
    const roteador = readFileSync(resolve(here, "routers.ts"), "utf8");
    const manejo = readFileSync(resolve(here, "manejoContexto.ts"), "utf8");
    const fonte = readFileSync(resolve(here, "administracao.ts"), "utf8");
    expect(roteador.includes("administracao")).toBe(false);
    expect(manejo.includes("administracao")).toBe(false);
    expect(fonte.includes("./db")).toBe(false);
    expect(fonte.includes("routers")).toBe(false);
  });
});
