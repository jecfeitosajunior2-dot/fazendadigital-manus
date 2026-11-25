import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import ParceiroListaAvisos, { type AvisoListaParceiro } from "@/components/ParceiroListaAvisos";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FD_PRIMARY, FormInput, FormLabel, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { ESTADOS_BR, fetchCidadesPorEstado } from "@/lib/brazil-locations";
import {
  ActivateActionIcon,
  DeleteActionIcon,
  EditActionIcon,
  InactivateActionIcon,
} from "@/components/icons/FarmActionIcons";
import { compradorFormFromPessoa, documentoPodeSalvarComprador } from "@/lib/compradoresCadastro";
import {
  COLUNAS_LISTA_PARCEIROS,
  CONSULTA_PESSOAS_ADMIN,
  FINANCEIRO_PESSOAS_CADASTRO_PATH,
  FINANCEIRO_PESSOAS_PATH,
  corSituacaoParceiro,
  ordenarParceirosPorNome,
  parceiroCombinaBusca,
  pessoaEstaAtiva,
  rotuloSituacaoParceiro,
  rotuloTipoParceiro,
  textoParceiro,
} from "@/lib/pessoasListagem";
import { formatCpfCnpj, formatPhoneBR } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

type PessoaTipo = "fornecedor" | "cliente" | "funcionario";

type ParceiroLinha = {
  id: number;
  nome: string;
  tipo: string;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  propriedadeEstabelecimento?: string | null;
  nomeContato?: string | null;
  cidade?: string | null;
  uf?: string | null;
  inscricaoEstadual?: string | null;
  cep?: string | null;
  ativo?: boolean | null;
};

function formatCep(valor: string) {
  const digitos = valor.replace(/\D/g, "").slice(0, 8);
  if (digitos.length <= 5) return digitos;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

function formularioDoParceiro(parceiro: ParceiroLinha): FormState {
  const extra = compradorFormFromPessoa(parceiro);
  return {
    nome: parceiro.nome,
    tipo: parceiro.tipo as PessoaTipo,
    documento: formatCpfCnpj(parceiro.documento ?? ""),
    endereco: extra.endereco,
    telefone: formatPhoneBR(parceiro.telefone ?? ""),
    email: extra.email,
    observacoes: extra.observacoes,
    propriedadeEstabelecimento: extra.propriedadeEstabelecimento,
    nomeContato: extra.nomeContato,
    cidade: extra.cidade,
    uf: extra.uf,
    inscricaoEstadual: parceiro.inscricaoEstadual ?? "",
    cep: formatCep(parceiro.cep ?? ""),
  };
}

function documentoExibido(valor?: string | null) {
  const texto = textoParceiro(valor);
  return texto === "—" ? texto : formatCpfCnpj(texto);
}

function telefoneExibido(valor?: string | null) {
  const texto = textoParceiro(valor);
  return texto === "—" ? texto : formatPhoneBR(texto);
}

type FormState = {
  nome: string;
  tipo: PessoaTipo | "";
  documento: string;
  endereco: string;
  telefone: string;
  email: string;
  observacoes: string;
  propriedadeEstabelecimento: string;
  nomeContato: string;
  cidade: string;
  uf: string;
  inscricaoEstadual: string;
  cep: string;
};

const emptyForm = (tipo: PessoaTipo | "" = ""): FormState => ({
  nome: "",
  tipo,
  documento: "",
  endereco: "",
  telefone: "",
  email: "",
  observacoes: "",
  propriedadeEstabelecimento: "",
  nomeContato: "",
  cidade: "",
  uf: "",
  inscricaoEstadual: "",
  cep: "",
});

function buildRetornoUrl(retorno: string, pessoaId?: number, idParam = "fornecedorId") {
  const url = new URL(retorno, window.location.origin);
  if (pessoaId) url.searchParams.set(idParam, String(pessoaId));
  return url.pathname + url.search;
}

function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function ParceiroAcoes({
  parceiro,
  onEditar,
  onInativar,
  onReativar,
  onExcluir,
}: {
  parceiro: ParceiroLinha;
  onEditar: () => void;
  onInativar: () => void;
  onReativar: () => void;
  onExcluir: () => void;
}) {
  const ativo = pessoaEstaAtiva(parceiro);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ECDC4]"
          aria-label={`Ações de ${parceiro.nome}`}
        >
          <span className="material-icons text-[20px]">more_vert</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" collisionPadding={8} className="min-w-[150px] z-[100]">
        <DropdownMenuItem
          className="text-[12px] cursor-pointer gap-2 text-[#586168] focus:text-white data-[highlighted]:text-white"
          onClick={onEditar}
        >
          <EditActionIcon size={16} style={{ color: "currentColor" }} />
          Editar
        </DropdownMenuItem>
        {ativo ? (
          <DropdownMenuItem
            className="text-[12px] cursor-pointer gap-2 text-[#C9844A] focus:text-white data-[highlighted]:text-white"
            onClick={onInativar}
          >
            <InactivateActionIcon size={16} style={{ color: "currentColor" }} />
            Inativar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="text-[12px] cursor-pointer gap-2 text-[#16A34A] focus:text-white data-[highlighted]:text-white"
            onClick={onReativar}
          >
            <ActivateActionIcon size={16} style={{ color: "currentColor" }} />
            Reativar
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-[12px] cursor-pointer gap-2 text-[#DC2626] focus:text-white data-[highlighted]:text-white"
          onClick={onExcluir}
        >
          <DeleteActionIcon size={16} style={{ color: "currentColor" }} />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function FinancialPeoplePage() {
  const [caminho, setLocation] = useLocation();
  const buscaUrl = useSearch();
  const confirm = useConfirm();
  const [aviso, setAviso] = useState<AvisoListaParceiro | null>(null);
  const params = new URLSearchParams(buscaUrl);
  const novoTipo = (params.get("novo") as PessoaTipo | null) ?? null;
  const retornoUrl = params.get("retorno") ? decodeURIComponent(params.get("retorno")!) : null;
  const fornecedorContext = novoTipo === "fornecedor";
  const clienteContext = novoTipo === "cliente";
  const idBruto = params.get("id");
  const parceiroId = idBruto && /^\d+$/.test(idBruto) ? Number(idBruto) : null;
  const modoPagina = caminho.replace(/\/$/, "").endsWith("/cadastro") || Boolean(novoTipo) || parceiroId != null;
  const origem = `${caminho}${buscaUrl}`;

  const [busca, setBusca] = useState("");
  const [nomeCrescente, setNomeCrescente] = useState(true);
  const [editId, setEditId] = useState<number | null>(parceiroId);
  const [documentoOriginal, setDocumentoOriginal] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm(novoTipo ?? ""));
  const [cidades, setCidades] = useState<string[]>([]);
  const [carregandoCidades, setCarregandoCidades] = useState(false);
  const baseRef = useRef(JSON.stringify(emptyForm(novoTipo ?? "")));
  const hidratou = useRef(false);
  const [origemVista, setOrigemVista] = useState(origem);
  const [podeDigitar, setPodeDigitar] = useState(Boolean(parceiroId));
  const cadastroNovo = modoPagina && parceiroId == null;
  const formulario = cadastroNovo && origem !== origemVista ? emptyForm(novoTipo ?? "") : form;

  if (origem !== origemVista || (cadastroNovo && editId != null)) {
    const inicial = emptyForm(novoTipo ?? "");
    setOrigemVista(origem);
    setForm(inicial);
    setDocumentoOriginal("");
    setEditId(parceiroId);
    setCidades([]);
    setPodeDigitar(Boolean(parceiroId));
    baseRef.current = JSON.stringify(inicial);
    hidratou.current = false;
  }

  const utils = trpc.useUtils();
  const { data: parceiros = [], isLoading } = trpc.pessoas.list.useQuery(CONSULTA_PESSOAS_ADMIN);
  const parceirosVisiveis = useMemo(
    () => ordenarParceirosPorNome(
      (parceiros as ParceiroLinha[]).filter((parceiro) => parceiroCombinaBusca(parceiro, busca)),
      nomeCrescente,
    ),
    [parceiros, busca, nomeCrescente],
  );
  const listaVazia = !isLoading && parceiros.length === 0;
  const buscaSemResultado = !isLoading && parceiros.length > 0 && parceirosVisiveis.length === 0;

  const voltarParaOrigem = (pessoaId?: number) => {
    if (retornoUrl) {
      const idParam = fornecedorContext ? "fornecedorId" : clienteContext ? "compradorId" : "pessoaId";
      setLocation(buildRetornoUrl(retornoUrl, pessoaId, idParam));
      return;
    }
    setLocation(FINANCEIRO_PESSOAS_PATH);
  };

  useEffect(() => {
    if (!modoPagina || !parceiroId || hidratou.current) return;
    const parceiro = (parceiros as ParceiroLinha[]).find((item) => item.id === parceiroId);
    if (!parceiro) return;
    const proximo = formularioDoParceiro(parceiro);
    setForm(proximo);
    setDocumentoOriginal(parceiro.documento ?? "");
    setEditId(parceiro.id);
    baseRef.current = JSON.stringify(proximo);
    hidratou.current = true;
  }, [modoPagina, parceiroId, parceiros]);

  const createMutation = trpc.pessoas.create.useMutation({
    onSuccess: async data => {
      toast.success(
        fornecedorContext
          ? "Fornecedor cadastrado!"
          : clienteContext
            ? "Comprador cadastrado!"
            : "Cadastro salvo!",
      );
      await utils.pessoas.list.invalidate();
      if (retornoUrl && data.id) {
        voltarParaOrigem(data.id);
      } else {
        setLocation(FINANCEIRO_PESSOAS_PATH);
      }
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.pessoas.update.useMutation({
    onSuccess: async () => {
      toast.success("Cadastro atualizado!");
      await utils.pessoas.list.invalidate();
      voltarParaOrigem();
    },
    onError: e => toast.error(e.message),
  });

  const deleteMutation = trpc.pessoas.delete.useMutation({
    onSuccess: async () => {
      setAviso(null);
      toast.success("Cadastro inativado.");
      await utils.pessoas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const excluirMutation = trpc.pessoas.excluir.useMutation({
    onSuccess: async () => {
      setAviso(null);
      toast.success("Parceiro excluído.");
      await utils.pessoas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const reativarMutation = trpc.pessoas.reativar.useMutation({
    onSuccess: async () => {
      setAviso(null);
      toast.success("Cadastro reativado.");
      await utils.pessoas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const abrirExclusao = async (parceiro: ParceiroLinha) => {
    try {
      const check = await utils.pessoas.deleteCheck.fetch({ id: parceiro.id });
      setAviso({
        tipo: "excluir",
        id: parceiro.id,
        nome: check.nome || parceiro.nome,
        podeExcluir: check.canDelete,
        conferencia: "ok",
      });
    } catch {
      setAviso({ tipo: "excluir", id: parceiro.id, nome: parceiro.nome, podeExcluir: false, conferencia: "falhou" });
    }
  };

  const confirmarAviso = () => {
    if (!aviso) return;
    if (aviso.tipo === "excluir") {
      if (aviso.podeExcluir) excluirMutation.mutate({ id: aviso.id });
      return;
    }
    if (aviso.tipo === "inativar") deleteMutation.mutate({ id: aviso.id });
    else reativarMutation.mutate({ id: aviso.id });
  };

  const salvar = () => {
    if (!form.nome.trim()) {
      toast.error("Informe o nome.");
      return;
    }
    if (!form.tipo) {
      toast.error("Selecione o tipo.");
      return;
    }
    const documento = form.documento.trim();
    const documentoObrigatorio = form.tipo === "cliente" || form.tipo === "fornecedor";
    if (form.tipo === "cliente") {
      if (!documentoPodeSalvarComprador({
        documento: form.documento,
        documentoOriginal,
        editando: Boolean(editId),
      })) {
        toast.error("Informe um CPF ou CNPJ válido.");
        return;
      }
    } else if (documentoObrigatorio || documento) {
      const documentoDigitos = documento.replace(/\D/g, "");
      if (documentoDigitos.length !== 11 && documentoDigitos.length !== 14) {
        toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) completo.");
        return;
      }
    }
    const email = form.email.trim();
    if (email && !emailValido(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      documento,
      email,
      telefone: form.telefone.trim(),
      inscricaoEstadual: form.inscricaoEstadual.trim() || null,
      endereco: form.endereco.trim(),
      cidade: form.cidade.trim(),
      uf: form.uf,
      cep: form.cep.trim() || null,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  useEffect(() => {
    if (!form.uf) {
      setCidades([]);
      return;
    }
    let ativo = true;
    setCarregandoCidades(true);
    fetchCidadesPorEstado(form.uf)
      .then((lista) => {
        if (ativo) setCidades(lista);
      })
      .catch(() => {
        if (ativo) setCidades([]);
      })
      .finally(() => {
        if (ativo) setCarregandoCidades(false);
      });
    return () => {
      ativo = false;
    };
  }, [form.uf]);

  const sair = async () => {
    if (JSON.stringify(form) !== baseRef.current) {
      const descartar = await confirm({
        title: "Descartar alterações?",
        description: "Os dados preenchidos ainda não foram salvos.",
        confirmText: "Descartar",
        cancelText: "Continuar editando",
        variant: "warning",
      });
      if (descartar !== true) return;
    }
    voltarParaOrigem();
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const isCompradorForm = form.tipo === "cliente" || clienteContext;
  const tituloPagina = parceiroId || editId ? "Editar Parceiro" : "Cadastrar Parceiro";
  const salvamentoBloqueado =
    isBusy ||
    (Boolean(parceiroId) && !hidratou.current) ||
    (isCompradorForm &&
      !documentoPodeSalvarComprador({
        documento: form.documento,
        documentoOriginal,
        editando: Boolean(editId),
      }));

  const documentoObrigatorio = formulario.tipo === "cliente" || formulario.tipo === "fornecedor";
  const nomeEstado = ESTADOS_BR.find((estado) => estado.uf === formulario.uf)?.nome ?? "";
  const campoNovo = cadastroNovo
    ? { autoComplete: "off" as const, readOnly: !podeDigitar, onFocus: () => setPodeDigitar(true) }
    : { autoComplete: "off" as const };
  const camposFormulario = (
    <div key={cadastroNovo ? "novo" : `editar-${parceiroId}`} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <div>
        <FormLabel required>Nome</FormLabel>
        <FormInput variant="light" required name="parceiro-nome" {...campoNovo} value={formulario.nome} onChange={v => setForm(f => ({ ...f, nome: v }))} placeholder="" />
      </div>
      <div>
        <FormLabel required>Tipo</FormLabel>
        <FormSelect
          variant="light"
          required
          value={formulario.tipo}
          onChange={v => setForm(f => ({ ...f, tipo: v as PessoaTipo }))}
          placeholder="Selecione"
        >
          <SelectItem value="cliente" className="text-[13px]">Cliente</SelectItem>
          <SelectItem value="fornecedor" className="text-[13px]">Fornecedor</SelectItem>
          <SelectItem value="funcionario" className="text-[13px]">Funcionário</SelectItem>
        </FormSelect>
      </div>
      <div>
        <FormLabel required={documentoObrigatorio}>CPF/CNPJ</FormLabel>
        <FormInput
          variant="light"
          required={documentoObrigatorio}
          name="parceiro-documento"
          {...campoNovo}
          value={formulario.documento}
          onChange={v => setForm(f => ({ ...f, documento: formatCpfCnpj(v) }))}
          placeholder=""
        />
      </div>
      <div>
        <FormLabel>Inscrição Estadual</FormLabel>
        <FormInput variant="light" name="parceiro-ie" {...campoNovo} value={formulario.inscricaoEstadual} onChange={v => setForm(f => ({ ...f, inscricaoEstadual: v }))} placeholder="" />
      </div>
      <div>
        <FormLabel>E-mail</FormLabel>
        <FormInput variant="light" name="parceiro-email" {...campoNovo} value={formulario.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="" />
      </div>
      <div>
        <FormLabel>Telefone</FormLabel>
        <FormInput variant="light" name="parceiro-telefone" {...campoNovo} value={formulario.telefone} onChange={v => setForm(f => ({ ...f, telefone: formatPhoneBR(v) }))} placeholder="" inputMode="tel" />
      </div>
      <div>
        <FormLabel>Estado</FormLabel>
        <FormSelect
          variant="light"
          value={formulario.uf}
          onChange={v => setForm(f => ({ ...f, uf: v, cidade: "" }))}
          placeholder="Selecione"
          displayValue={nomeEstado}
        >
          {ESTADOS_BR.map((estado) => (
            <SelectItem key={estado.uf} value={estado.uf} className="text-[13px]">{estado.nome}</SelectItem>
          ))}
        </FormSelect>
      </div>
      <div>
        <FormLabel>Cidade</FormLabel>
        <FormSelect
          variant="light"
          value={formulario.cidade}
          onChange={v => setForm(f => ({ ...f, cidade: v }))}
          placeholder={formulario.uf ? (carregandoCidades ? "Carregando municípios..." : "Selecione") : "Selecione o estado primeiro"}
          disabled={!formulario.uf || carregandoCidades}
          displayValue={formulario.cidade}
        >
          {cidades.map((cidade) => (
            <SelectItem key={cidade} value={cidade} className="text-[13px]">{cidade}</SelectItem>
          ))}
        </FormSelect>
      </div>
      <div>
        <FormLabel>Endereço</FormLabel>
        <FormInput variant="light" name="parceiro-endereco" {...campoNovo} value={formulario.endereco} onChange={v => setForm(f => ({ ...f, endereco: v }))} placeholder="" />
      </div>
      <div>
        <FormLabel>CEP</FormLabel>
        <FormInput variant="light" name="parceiro-cep" {...campoNovo} value={formulario.cep} onChange={v => setForm(f => ({ ...f, cep: formatCep(v) }))} placeholder="" inputMode="numeric" />
      </div>
    </div>
  );

  if (modoPagina) {
    const encontrado = Boolean(parceiroId) && (parceiros as ParceiroLinha[]).some((item) => item.id === parceiroId);
    const aguardandoParceiro = Boolean(parceiroId) && (isLoading || (encontrado && !hidratou.current));
    const parceiroAusente = Boolean(parceiroId) && !isLoading && !encontrado;
    return (
      <AppLayout>
        <div className="parceiro-formulario">
          <style>{`
            .parceiro-formulario, .parceiro-formulario label, .parceiro-formulario input,
            .parceiro-formulario textarea, .parceiro-formulario h1, .parceiro-formulario h2,
            .parceiro-formulario [data-slot="select-trigger"],
            .parceiro-formulario [data-slot="select-trigger"] span {
              font-family: Inter, sans-serif;
            }
            .parceiro-formulario label { font-size: 13px; font-weight: 500; }
            .parceiro-formulario input,
            .parceiro-formulario textarea,
            .parceiro-formulario [data-slot="select-trigger"],
            .parceiro-formulario [data-slot="select-trigger"] span {
              font-size: 14px;
              font-weight: 400;
            }
            .parceiro-formulario .parceiro-acao { font-size: 14px; font-weight: 600; }
            .parceiro-formulario .material-icons { font-family: "Material Icons"; }
          `}</style>
          <button
            type="button"
            onClick={() => { void sair(); }}
            className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
          >
            <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
              arrow_back
            </span>
            <span className="text-[13px]">Voltar</span>
          </button>
          <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-4">
              <h1 className="text-gray-900" style={{ fontFamily: "Inter, sans-serif", fontSize: "24px", fontWeight: 600 }}>
                {tituloPagina}
              </h1>
            </div>
          </div>
          {aguardandoParceiro ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
          ) : parceiroAusente ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Parceiro não encontrado.</div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded shadow-sm p-5">
                {camposFormulario}
              </div>
              <div className="pt-1 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { void sair(); }}
                  disabled={isBusy}
                  className="parceiro-acao px-6 py-2 rounded-full uppercase tracking-wide bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => { void salvar(); }}
                  disabled={salvamentoBloqueado}
                  className="parceiro-acao px-6 py-2 rounded-full uppercase tracking-wide text-gray-800 hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  {isBusy ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
                </button>
              </div>
            </>
          )}
        </div>
      </AppLayout>
    );
  }

  const avisoPendente = deleteMutation.isPending || reativarMutation.isPending || excluirMutation.isPending;

  return (
    <AppLayout>
      <ParceiroListaAvisos
        aviso={aviso}
        enviando={avisoPendente}
        onFechar={() => { if (!avisoPendente) setAviso(null); }}
        onConfirmar={confirmarAviso}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: "24px", fontWeight: 600, color: "#172033" }}>
          Parceiros (Clientes/Fornecedores e Funcionários)
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="relative block">
            <span className="material-icons pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
            <input
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar parceiro"
              aria-label="Buscar parceiro"
              className="min-h-[44px] w-56 rounded border border-gray-200 bg-white pl-10 pr-3 text-gray-700 outline-none focus:border-[#4ECDC4]"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 400 }}
            />
          </label>
          <button
            type="button"
            onClick={() => setLocation(FINANCEIRO_PESSOAS_CADASTRO_PATH)}
            className="flex items-center justify-center gap-1 px-3 py-1.5 min-h-[44px] rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: "#4ECDC4", fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 600 }}
          >
            <span className="material-icons text-[14px]">add</span>
            Novo Parceiro
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {COLUNAS_LISTA_PARCEIROS.map((coluna) => (
                <th
                  key={coluna}
                  aria-sort={coluna === "Nome" ? (nomeCrescente ? "ascending" : "descending") : undefined}
                  className={`px-3 py-2 text-gray-500 uppercase whitespace-nowrap ${
                    coluna === "Situação" || coluna === "Ações" ? "text-center" : "text-left"
                  }`}
                  style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", fontWeight: 500 }}
                >
                  {coluna === "Nome" ? (
                    <button
                      type="button"
                      onClick={() => setNomeCrescente((atual) => !atual)}
                      className="inline-flex items-center gap-0.5 uppercase hover:text-gray-700"
                      aria-label={nomeCrescente ? "Ordenar nome de Z até A" : "Ordenar nome de A até Z"}
                    >
                      Nome
                      <span className="material-icons text-[18px] leading-none text-gray-400" aria-hidden>
                        {nomeCrescente ? "arrow_drop_up" : "arrow_drop_down"}
                      </span>
                    </button>
                  ) : (
                    coluna
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-gray-400" style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px" }}>
                  Carregando...
                </td>
              </tr>
            )}
            {listaVazia && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400" style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px" }}>
                  Nenhum parceiro cadastrado.
                </td>
              </tr>
            )}
            {buscaSemResultado && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400" style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px" }}>
                  Nenhum parceiro encontrado.
                </td>
              </tr>
            )}
            {parceirosVisiveis.map((parceiro) => (
              <tr key={parceiro.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-2 text-gray-700" style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 400 }}>{parceiro.nome}</td>
                <td className="px-3 py-2 text-gray-700" style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 400 }}>{rotuloTipoParceiro(parceiro.tipo)}</td>
                <td className="px-3 py-2 text-gray-700 tabular-nums" style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 400 }}>{documentoExibido(parceiro.documento)}</td>
                <td className="px-3 py-2 text-gray-700" style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 400 }}>{textoParceiro(parceiro.email)}</td>
                <td className="px-3 py-2 text-gray-700 tabular-nums" style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 400 }}>{telefoneExibido(parceiro.telefone)}</td>
                <td className="px-3 py-2 text-center" style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 400, color: corSituacaoParceiro(parceiro.ativo) }}>
                  {rotuloSituacaoParceiro(parceiro.ativo)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center">
                    <ParceiroAcoes
                      parceiro={parceiro}
                      onEditar={() => setLocation(`${FINANCEIRO_PESSOAS_CADASTRO_PATH}?id=${parceiro.id}`)}
                      onInativar={() => setAviso({ tipo: "inativar", id: parceiro.id, nome: parceiro.nome })}
                      onReativar={() => setAviso({ tipo: "reativar", id: parceiro.id, nome: parceiro.nome })}
                      onExcluir={() => { void abrirExclusao(parceiro); }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

