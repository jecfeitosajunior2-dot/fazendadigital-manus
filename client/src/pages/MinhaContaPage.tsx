import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const MENSAGENS: Record<string, string> = {
  senha_atual_incorreta: "A senha atual não confere.",
  confirmacao_diferente: "A confirmação da senha não confere.",
  senha_invalida: "A senha precisa ter entre 8 e 80 caracteres.",
  senha_reutilizada: "A nova senha precisa ser diferente da atual.",
  sessao_invalida: "Sessão inválida. Entre de novo.",
};

export default function MinhaContaPage() {
  const [, setLocation] = useLocation();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [aviso, setAviso] = useState("");
  const logout = trpc.auth.logout.useMutation();
  const trocar = trpc.acesso.alterarMinhaSenha.useMutation();

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setAviso("");
    if (novaSenha !== confirmacao) {
      setAviso(MENSAGENS.confirmacao_diferente);
      return;
    }
    try {
      await trocar.mutateAsync({ senhaAtual, novaSenha, confirmacao });
      await logout.mutateAsync().catch(() => undefined);
      setLocation("/entrar");
    } catch (erro) {
      const texto = erro instanceof Error ? erro.message : "";
      setAviso(MENSAGENS[texto] ?? (texto || "Não foi possível alterar a senha."));
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-xl font-semibold text-[#1F2933]">Minha conta</h1>
      <p className="mb-4 text-sm text-[#52606D]">
        A troca vale só para quem está nesta sessão. As outras sessões deixam de valer.
      </p>
      <form onSubmit={enviar} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <label className="block text-sm text-[#1F2933]">
          Senha atual
          <input
            type="password"
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E4E7EB] px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm text-[#1F2933]">
          Nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E4E7EB] px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm text-[#1F2933]">
          Confirmação da nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#E4E7EB] px-3 py-2"
            required
          />
        </label>
        {aviso ? (
          <p role="status" className="text-sm text-[#9B1C1C]">{aviso}</p>
        ) : null}
        <button
          type="submit"
          disabled={trocar.isPending}
          className="rounded-lg bg-[#2D5A5A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {trocar.isPending ? "Alterando..." : "Alterar senha"}
        </button>
      </form>
    </div>
  );
}
