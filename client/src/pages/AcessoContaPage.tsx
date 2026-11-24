import { useState, type FormEvent } from "react";
import { trpc } from "@/lib/trpc";

function acaoDo(evento: FormEvent<HTMLFormElement>): string {
  const enviado = evento.nativeEvent instanceof SubmitEvent ? evento.nativeEvent.submitter : null;
  return enviado?.getAttribute("value") ?? "";
}

function avisoDe(erro: unknown): string {
  if (erro && typeof erro === "object" && "message" in erro && typeof erro.message === "string") {
    return erro.message;
  }
  return "Não foi possível concluir.";
}

export default function AcessoContaPage() {
  const eu = trpc.auth.me.useQuery();
  const usuarios = trpc.acesso.listarUsuarios.useQuery(undefined, { enabled: eu.data?.papel === "principal" });
  const catalogo = trpc.acesso.catalogo.useQuery(undefined, { enabled: eu.data?.papel === "principal" });
  const fazendas = trpc.fazendas.list.useQuery(undefined, { enabled: eu.data?.papel === "principal" });
  const [usuarioId, setUsuarioId] = useState("");
  const [aviso, setAviso] = useState("");
  const utils = trpc.useUtils();

  const atualizar = async () => {
    await utils.acesso.listarUsuarios.invalidate();
    if (usuarioId) await utils.acesso.permissoes.invalidate({ usuarioId: Number(usuarioId) });
    if (usuarioId) await utils.acesso.fazendas.invalidate({ usuarioId: Number(usuarioId) });
  };
  const permissoes = trpc.acesso.permissoes.useQuery(
    { usuarioId: Number(usuarioId) },
    { enabled: eu.data?.papel === "principal" && Number(usuarioId) > 0 },
  );
  const fazendasDoUsuario = trpc.acesso.fazendas.useQuery(
    { usuarioId: Number(usuarioId) },
    { enabled: eu.data?.papel === "principal" && Number(usuarioId) > 0 },
  );

  const criar = trpc.acesso.criarUsuario.useMutation({
    onSuccess: async (criado) => {
      setUsuarioId(String(criado.id));
      setAviso("Funcionário criado. Defina a senha inicial para ele entrar.");
      await atualizar();
    },
    onError: (erro) => setAviso(avisoDe(erro)),
  });
  const senha = trpc.acesso.definirSenha.useMutation({
    onSuccess: async () => {
      setAviso("Senha inicial definida. A sessão anterior desse usuário deixou de valer.");
      await atualizar();
    },
    onError: (erro) => setAviso(avisoDe(erro)),
  });
  const concederFazenda = trpc.acesso.concederFazenda.useMutation({
    onSuccess: async () => { setAviso("Fazenda concedida."); await atualizar(); },
    onError: (erro) => setAviso(avisoDe(erro)),
  });
  const revogarFazenda = trpc.acesso.revogarFazenda.useMutation({
    onSuccess: async () => { setAviso("Fazenda revogada."); await atualizar(); },
    onError: (erro) => setAviso(avisoDe(erro)),
  });
  const concederPermissao = trpc.acesso.concederPermissao.useMutation({
    onSuccess: async () => { setAviso("Permissão concedida."); await atualizar(); },
    onError: (erro) => setAviso(avisoDe(erro)),
  });
  const revogarPermissao = trpc.acesso.revogarPermissao.useMutation({
    onSuccess: async () => { setAviso("Permissão revogada."); await atualizar(); },
    onError: (erro) => setAviso(avisoDe(erro)),
  });

  if (eu.data && eu.data.papel !== "principal") {
    return <p className="p-6 text-sm">Só o titular administra os acessos desta conta.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Acessos da conta</h1>
      {aviso && <p className="text-sm text-gray-700" role="status">{aviso}</p>}

      <form
        className="space-y-2 rounded-xl border p-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          const dados = new FormData(evento.currentTarget);
          criar.mutate({
            name: String(dados.get("nome") ?? ""),
            email: String(dados.get("email") ?? ""),
            papel: "comum",
          });
          evento.currentTarget.reset();
        }}
      >
        <h2 className="font-medium">Novo funcionário</h2>
        <label htmlFor="acesso-nome" className="block text-sm">Nome</label>
        <input id="acesso-nome" name="nome" required className="w-full rounded border px-3 py-2" />
        <label htmlFor="acesso-email" className="block text-sm">E-mail de acesso</label>
        <input id="acesso-email" name="email" type="email" required className="w-full rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-teal-600 px-3 py-2 text-sm text-white">Criar funcionário</button>
      </form>

      <label htmlFor="acesso-usuario" className="block text-sm">Funcionário</label>
      <select
        id="acesso-usuario"
        className="w-full rounded border px-3 py-2"
        value={usuarioId}
        onChange={(evento) => setUsuarioId(evento.target.value)}
      >
        <option value="">Selecione</option>
        {(usuarios.data?.itens ?? []).filter((item) => item.papel !== "principal").map((item) => (
          <option key={item.id} value={item.id}>{item.name} — {item.email}</option>
        ))}
      </select>

      <form
        className="space-y-2 rounded-xl border p-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          const dados = new FormData(evento.currentTarget);
          senha.mutate({ usuarioId: Number(usuarioId), senha: String(dados.get("senha") ?? "") });
          evento.currentTarget.reset();
        }}
      >
        <h2 className="font-medium">Senha inicial</h2>
        <label htmlFor="acesso-senha" className="block text-sm">Senha</label>
        <input id="acesso-senha" name="senha" type="password" minLength={8} required className="w-full rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-teal-600 px-3 py-2 text-sm text-white">Definir senha</button>
      </form>

      <form
        className="space-y-2 rounded-xl border p-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          const dados = new FormData(evento.currentTarget);
          const fazendaId = Number(dados.get("fazendaId"));
          const acao = acaoDo(evento);
          if (acao === "revogar") revogarFazenda.mutate({ usuarioId: Number(usuarioId), fazendaId });
          else concederFazenda.mutate({ usuarioId: Number(usuarioId), fazendaId });
        }}
      >
        <h2 className="font-medium">Fazenda</h2>
        <label htmlFor="acesso-fazenda" className="block text-sm">Fazenda da conta</label>
        <select id="acesso-fazenda" name="fazendaId" required className="w-full rounded border px-3 py-2">
          {(fazendas.data ?? []).map((fazenda) => (
            <option key={fazenda.id} value={fazenda.id}>{fazenda.nome}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button type="submit" name="acao" value="conceder" className="rounded bg-teal-600 px-3 py-2 text-sm text-white">Conceder fazenda</button>
          <button type="submit" name="acao" value="revogar" className="rounded border px-3 py-2 text-sm">Revogar fazenda</button>
        </div>
        <p className="text-xs text-gray-600">Concedidas: {(fazendasDoUsuario.data && "fazendaIds" in fazendasDoUsuario.data ? fazendasDoUsuario.data.fazendaIds : []).join(", ") || "nenhuma"}</p>
      </form>

      <form
        className="space-y-2 rounded-xl border p-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          const dados = new FormData(evento.currentTarget);
          const permissao = String(dados.get("permissao") ?? "");
          const acao = acaoDo(evento);
          if (acao === "revogar") revogarPermissao.mutate({ usuarioId: Number(usuarioId), permissao });
          else concederPermissao.mutate({ usuarioId: Number(usuarioId), permissao });
        }}
      >
        <h2 className="font-medium">Permissão</h2>
        <label htmlFor="acesso-permissao" className="block text-sm">Operação</label>
        <select id="acesso-permissao" name="permissao" required className="w-full rounded border px-3 py-2">
          {(catalogo.data?.catalogo ?? []).map((item) => (
            <option key={item.id} value={item.id}>{item.descricao}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button type="submit" name="acao" value="conceder" className="rounded bg-teal-600 px-3 py-2 text-sm text-white">Conceder permissão</button>
          <button type="submit" name="acao" value="revogar" className="rounded border px-3 py-2 text-sm">Revogar permissão</button>
        </div>
        <p className="text-xs text-gray-600">Ativas: {(permissoes.data?.efetivas ?? []).join(", ") || "nenhuma"}</p>
      </form>
    </div>
  );
}
