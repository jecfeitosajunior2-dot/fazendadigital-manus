import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FD_PRIMARY, FormInput, FormLabel, FormTextarea } from "@/components/FormFields";
import { formatCpfCnpj } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

type PessoaTipo = "fornecedor" | "cliente" | "funcionario";

const TIPO_LABEL: Record<PessoaTipo, string> = {
  fornecedor: "Fornecedor",
  cliente: "Cliente",
  funcionario: "Funcionário",
};

const TIPO_BADGE: Record<PessoaTipo, string> = {
  fornecedor: "bg-amber-100 text-amber-700",
  cliente: "bg-green-100 text-green-700",
  funcionario: "bg-blue-100 text-blue-700",
};

const FILTROS: { id: "todos" | PessoaTipo; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "fornecedor", label: "Fornecedores" },
  { id: "cliente", label: "Clientes" },
  { id: "funcionario", label: "Funcionários" },
];

type FormState = {
  nome: string;
  tipo: PessoaTipo;
  documento: string;
  endereco: string;
  telefone: string;
  email: string;
  observacoes: string;
};

const emptyForm = (tipo: PessoaTipo = "fornecedor"): FormState => ({
  nome: "",
  tipo,
  documento: "",
  endereco: "",
  telefone: "",
  email: "",
  observacoes: "",
});

function FinancialTabs({ active }: { active: string }) {
  const tabs = ["Contas", "Importar Extrato", "Movimentações", "Rateio de Custo", "Listagem Rateio", "Receita x Despesa"];
  const paths = ["/financeiro/contas", "/financeiro/movimentacao", "/financeiro/movimentacao", "/financeiro/categorias", "/financeiro/categorias", "/financeiro/pessoas"];
  return (
    <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

function buildRetornoUrl(retorno: string, fornecedorId?: number) {
  const url = new URL(retorno, window.location.origin);
  if (fornecedorId) url.searchParams.set("fornecedorId", String(fornecedorId));
  return url.pathname + url.search;
}

function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function limparQueryModal() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("novo") && !url.searchParams.has("retorno")) return;
  url.searchParams.delete("novo");
  url.searchParams.delete("retorno");
  window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
}

export default function FinancialPeoplePage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const novoTipo = (params.get("novo") as PessoaTipo | null) ?? null;
  const retornoUrl = params.get("retorno") ? decodeURIComponent(params.get("retorno")!) : null;
  const fornecedorContext = novoTipo === "fornecedor";

  const [filtro, setFiltro] = useState<"todos" | PessoaTipo>(novoTipo === "fornecedor" ? "fornecedor" : "todos");
  const [showForm, setShowForm] = useState(!!novoTipo);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(novoTipo ?? "fornecedor"));

  const utils = trpc.useUtils();
  const { data: todasPessoas = [], isLoading } = trpc.pessoas.list.useQuery(undefined);

  const pessoas = useMemo(
    () => (filtro === "todos" ? todasPessoas : todasPessoas.filter(p => p.tipo === filtro)),
    [todasPessoas, filtro]
  );

  const resetFormLocal = () => {
    setEditId(null);
    setForm(emptyForm(filtro === "todos" ? "fornecedor" : filtro));
  };

  const voltarParaOrigem = (fornecedorId?: number) => {
    if (retornoUrl) {
      setLocation(buildRetornoUrl(retornoUrl, fornecedorId));
      return;
    }
    limparQueryModal();
    setShowForm(false);
    resetFormLocal();
  };

  const createMutation = trpc.pessoas.create.useMutation({
    onSuccess: async data => {
      toast.success(fornecedorContext ? "Fornecedor cadastrado!" : "Cadastro salvo!");
      await utils.pessoas.list.invalidate();
      if (retornoUrl && data.id) {
        voltarParaOrigem(data.id);
      } else {
        setShowForm(false);
        resetFormLocal();
      }
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.pessoas.update.useMutation({
    onSuccess: async () => {
      toast.success("Cadastro atualizado!");
      setShowForm(false);
      resetFormLocal();
      await utils.pessoas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const deleteMutation = trpc.pessoas.delete.useMutation({
    onSuccess: async () => {
      toast.success("Cadastro removido.");
      await utils.pessoas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const abrirNovo = (tipo: PessoaTipo = filtro === "todos" ? "fornecedor" : filtro) => {
    setEditId(null);
    setForm(emptyForm(tipo));
    setShowForm(true);
  };

  const abrirEditar = (p: (typeof todasPessoas)[number]) => {
    setEditId(p.id);
    setForm({
      nome: p.nome,
      tipo: p.tipo as PessoaTipo,
      documento: formatCpfCnpj((p as { documento?: string | null }).documento ?? ""),
      endereco: (p as { endereco?: string | null }).endereco ?? "",
      telefone: p.telefone ?? "",
      email: p.email ?? "",
      observacoes: p.observacoes ?? "",
    });
    setShowForm(true);
  };

  const salvar = () => {
    if (!form.nome.trim()) {
      toast.error("Informe o nome.");
      return;
    }
    const documento = form.documento.trim();
    if (!documento) {
      toast.error("Informe o CPF/CNPJ.");
      return;
    }
    const documentoDigitos = documento.replace(/\D/g, "");
    if (documentoDigitos.length !== 11 && documentoDigitos.length !== 14) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) completo.");
      return;
    }
    const email = form.email.trim();
    if (email && !emailValido(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    const payload = {
      nome: form.nome.trim(),
      tipo: fornecedorContext && !editId ? "fornecedor" : form.tipo,
      documento,
      endereco: form.endereco.trim() || undefined,
      telefone: form.telefone.trim() || undefined,
      email: email || undefined,
      observacoes: form.observacoes.trim() || undefined,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const cancelar = () => voltarParaOrigem();

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const isFornecedorForm = form.tipo === "fornecedor" || fornecedorContext;

  const modalTitulo = (() => {
    if (editId && isFornecedorForm) return "Editar Fornecedor";
    if (editId) return "Editar cadastro";
    if (fornecedorContext) return "Novo Fornecedor";
    return "Novo cadastro";
  })();

  const handleDialogChange = (open: boolean) => {
    if (!open) cancelar();
    else setShowForm(true);
  };

  return (
    <AppLayout>
      <Dialog open={showForm} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-md gap-5">
          <DialogHeader className="pb-0">
            <DialogTitle>{modalTitulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <FormLabel required>{isFornecedorForm ? "Nome / Razão social" : "Nome"}</FormLabel>
              <FormInput
                required
                variant="light"
                value={form.nome}
                onChange={v => setForm(f => ({ ...f, nome: v }))}
                placeholder={isFornecedorForm ? "Nome ou razão social" : "Nome completo"}
              />
            </div>
            <div>
              <FormLabel required>CPF/CNPJ</FormLabel>
              <FormInput
                required
                variant="light"
                value={form.documento}
                onChange={v => setForm(f => ({ ...f, documento: formatCpfCnpj(v) }))}
                placeholder={
                  form.documento.replace(/\D/g, "").length > 11
                    ? "00.000.000/0000-00"
                    : "000.000.000-00"
                }
              />
            </div>
            <div>
              <FormLabel>Endereço</FormLabel>
              <FormInput
                variant="light"
                value={form.endereco}
                onChange={v => setForm(f => ({ ...f, endereco: v }))}
                placeholder="Opcional"
              />
            </div>
            <div>
              <FormLabel>Telefone</FormLabel>
              <FormInput
                variant="light"
                value={form.telefone}
                onChange={v => setForm(f => ({ ...f, telefone: v }))}
              />
            </div>
            <div>
              <FormLabel>E-mail</FormLabel>
              <FormInput
                variant="light"
                value={form.email}
                onChange={v => setForm(f => ({ ...f, email: v }))}
              />
            </div>
            <div>
              <FormLabel>Observações</FormLabel>
              <FormTextarea
                variant="light"
                value={form.observacoes}
                onChange={v => setForm(f => ({ ...f, observacoes: v }))}
                rows={2}
                placeholder="Informações complementares"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={cancelar}
                className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={isBusy}
                className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {isBusy ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Pessoas</h1>
        <button
          type="button"
          onClick={() => abrirNovo()}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
          style={{ backgroundColor: "#4ECDC4" }}
        >
          <span className="material-icons text-[14px]">add</span>
          Nova Pessoa
        </button>
      </div>

      <FinancialTabs active="Receita x Despesa" />

      <p className="text-[12px] text-gray-500 mb-3">
        Cadastro central de fornecedores, clientes e funcionários. Usado em movimentações de insumos, compras e vendas.
      </p>

      <div className="flex flex-wrap gap-1 mb-4">
        {FILTROS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
              filtro === f.id ? "bg-[#4ECDC4] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-[12px] text-gray-400">Carregando...</p>
        </div>
      ) : pessoas.length === 0 ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <span className="material-icons text-4xl text-gray-200 mb-2 block">groups</span>
          <p className="text-[12px] text-gray-400">Nenhum cadastro encontrado</p>
          <button type="button" onClick={() => abrirNovo()} className="mt-3 text-[12px] font-medium text-[#4ECDC4] hover:underline">
            Cadastrar agora
          </button>
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Função</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Contato</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-20">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pessoas.map(p => (
                <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-gray-800 font-medium">{p.nome}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-medium ${TIPO_BADGE[p.tipo as PessoaTipo]}`}>
                      {TIPO_LABEL[p.tipo as PessoaTipo]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{p.funcao || "—"}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {[p.telefone, p.email].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => abrirEditar(p)}
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                        title="Editar"
                      >
                        <span className="material-icons text-[16px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remover "${p.nome}" do cadastro?`)) deleteMutation.mutate({ id: p.id });
                        }}
                        className="p-0.5 rounded hover:bg-red-50 text-red-400"
                        title="Excluir"
                      >
                        <span className="material-icons text-[16px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setLocation("/insumos/visao-geral")}
          className="text-[12px] text-gray-500 hover:text-gray-700"
        >
          ← Voltar para Insumos
        </button>
      </div>
    </AppLayout>
  );
}
