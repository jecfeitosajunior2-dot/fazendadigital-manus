import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import CentroCustoListaAvisos, { type AvisoListaCentro } from "@/components/CentroCustoListaAvisos";
import { FD_PRIMARY, FormInput, FormLabel } from "@/components/FormFields";
import { ActivateActionIcon, DeleteActionIcon, EditActionIcon, InactivateActionIcon } from "@/components/icons/FarmActionIcons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { corSituacaoParceiro, ordenarParceirosPorNome, rotuloSituacaoParceiro } from "@/lib/pessoasListagem";
import { trpc } from "@/lib/trpc";

export const CENTRO_CUSTO_LISTA_PATH = "/administrativo/centros-de-custos";
export const CENTRO_CUSTO_CADASTRO_PATH = "/administrativo/centros-de-custos/cadastro";

const fonte = "'Inter', sans-serif";
const titulo = { fontFamily: fonte, fontSize: "24px", fontWeight: 600, color: "#172033" };
const campo = { fontFamily: fonte, fontSize: "14px", fontWeight: 400 };
const cabecalho = { fontFamily: fonte, fontSize: "12px", fontWeight: 500 };
const botao = { fontFamily: fonte, fontSize: "14px", fontWeight: 600 };
const secao = { fontFamily: fonte, fontSize: "14px", fontWeight: 600, color: "#374151" };

export function CentrosCustoPendentePage() {
  const [caminho, setLocation] = useLocation();
  const buscaUrl = useSearch();
  const idBruto = new URLSearchParams(buscaUrl).get("id");
  const centroId = idBruto && /^\d+$/.test(idBruto) ? Number(idBruto) : null;
  const cadastro = caminho.replace(/\/$/, "") === CENTRO_CUSTO_CADASTRO_PATH;
  if (cadastro) {
    return <CentroCustoCadastroPage centroId={centroId} onVoltar={() => setLocation(CENTRO_CUSTO_LISTA_PATH)} />;
  }
  return <CentroCustoListaPage onNovo={() => setLocation(CENTRO_CUSTO_CADASTRO_PATH)} onEditar={(id) => setLocation(`${CENTRO_CUSTO_CADASTRO_PATH}?id=${id}`)} />;
}

const COLUNAS_CENTRO = ["Nome", "Situação", "Ações"] as const;

type CentroLinha = { id: number; nome: string; ativo: boolean };

function CentroCustoListaPage({ onNovo, onEditar }: { onNovo: () => void; onEditar: (id: number) => void }) {
  const utils = trpc.useUtils();
  const consulta = trpc.financeiroV2.centrosList.useQuery();
  const centros = (consulta.data ?? []) as CentroLinha[];
  const [busca, setBusca] = useState("");
  const [nomeCrescente, setNomeCrescente] = useState(true);
  const [aviso, setAviso] = useState<AvisoListaCentro | null>(null);
  const inativar = trpc.financeiroV2.centrosInativar.useMutation({
    onSuccess: async () => {
      setAviso(null);
      await utils.financeiroV2.centrosList.invalidate();
      toast.success("Centro de custo inativado.");
    },
    onError: (erro) => toast.error(erro.message || "Não foi possível inativar o centro de custo."),
  });
  const reativar = trpc.financeiroV2.centrosReativar.useMutation({
    onSuccess: async () => {
      setAviso(null);
      await utils.financeiroV2.centrosList.invalidate();
      toast.success("Centro de custo reativado.");
    },
    onError: (erro) => toast.error(erro.message || "Não foi possível reativar o centro de custo."),
  });
  const excluir = trpc.financeiroV2.centrosExcluir.useMutation({
    onSuccess: async () => {
      setAviso(null);
      await utils.financeiroV2.centrosList.invalidate();
      toast.success("Centro de custo excluído.");
    },
    onError: (erro) => toast.error(erro.message || "Não foi possível excluir o centro de custo."),
  });
  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () => ordenarParceirosPorNome(
      centros.filter((centro) => !termo || centro.nome.toLowerCase().includes(termo)),
      nomeCrescente,
    ),
    [centros, termo, nomeCrescente],
  );
  const listaVazia = !consulta.isLoading && !consulta.isError && centros.length === 0;
  const buscaSemResultado = !consulta.isLoading && centros.length > 0 && visiveis.length === 0;
  const enviando = inativar.isPending || reativar.isPending || excluir.isPending;
  const pedirExclusao = async (centro: CentroLinha) => {
    try {
      const conferencia = await utils.financeiroV2.centrosDeleteCheck.fetch({ id: centro.id });
      setAviso({
        tipo: "excluir",
        id: centro.id,
        nome: conferencia.nome,
        podeExcluir: conferencia.canDelete,
        conferencia: "ok",
      });
    } catch {
      setAviso({ tipo: "excluir", id: centro.id, nome: centro.nome, podeExcluir: false, conferencia: "falhou" });
    }
  };
  const confirmarAviso = () => {
    if (!aviso) return;
    if (aviso.tipo === "inativar") inativar.mutate({ id: aviso.id });
    else if (aviso.tipo === "reativar") reativar.mutate({ id: aviso.id });
    else if (aviso.podeExcluir && aviso.conferencia === "ok") excluir.mutate({ id: aviso.id });
  };

  return (
    <AppLayout>
      <CentroCustoListaAvisos
        aviso={aviso}
        enviando={enviando}
        onFechar={() => { if (!enviando) setAviso(null); }}
        onConfirmar={confirmarAviso}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 style={titulo}>Centro de Custos</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="relative block">
            <span className="material-icons pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
            <input
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar centro de custo"
              aria-label="Buscar centro de custo"
              className="min-h-[44px] w-56 rounded border border-gray-200 bg-white pl-10 pr-3 text-gray-700 outline-none focus:border-[#4ECDC4]"
              style={campo}
            />
          </label>
          <button
            type="button"
            onClick={onNovo}
            className="flex items-center justify-center gap-1 px-3 py-1.5 min-h-[44px] rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: "#4ECDC4", ...botao }}
          >
            <span className="material-icons text-[14px]">add</span>
            Novo Centro de Custo
          </button>
        </div>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <colgroup>
            <col style={{ width: "56%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "22%" }} />
          </colgroup>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {COLUNAS_CENTRO.map((coluna) => (
                <th
                  key={coluna}
                  aria-sort={coluna === "Nome" ? (nomeCrescente ? "ascending" : "descending") : undefined}
                  className={`px-3 py-2 text-gray-500 uppercase whitespace-nowrap ${
                    coluna === "Nome" ? "text-left" : "text-center"
                  }`}
                  style={cabecalho}
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
                  ) : coluna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {consulta.isLoading && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-gray-400" style={campo}>Carregando...</td>
              </tr>
            )}
            {consulta.isError && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-400" style={campo}>
                  Não foi possível carregar os centros de custo.
                </td>
              </tr>
            )}
            {listaVazia && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-400" style={campo}>
                  Nenhum centro de custo cadastrado.
                </td>
              </tr>
            )}
            {buscaSemResultado && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-400" style={campo}>
                  Nenhum centro de custo encontrado.
                </td>
              </tr>
            )}
            {visiveis.map((centro) => (
              <tr key={centro.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-2 text-gray-700" style={campo}>{centro.nome}</td>
                <td className="px-3 py-2 text-center" style={{ ...campo, color: corSituacaoParceiro(centro.ativo) }}>
                  {rotuloSituacaoParceiro(centro.ativo)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ECDC4]"
                          aria-label={`Ações de ${centro.nome}`}
                        >
                          <span className="material-icons text-[20px]">more_vert</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" side="bottom" collisionPadding={8} className="min-w-[150px] z-[100]">
                        <DropdownMenuItem
                          className="text-[12px] cursor-pointer gap-2 text-[#586168] focus:text-white data-[highlighted]:text-white"
                          onClick={() => onEditar(centro.id)}
                        >
                          <EditActionIcon size={16} style={{ color: "currentColor" }} />
                          Editar
                        </DropdownMenuItem>
                        {centro.ativo ? (
                          <DropdownMenuItem
                            className="text-[12px] cursor-pointer gap-2 text-[#C9844A] focus:text-white data-[highlighted]:text-white"
                            onClick={() => setAviso({ tipo: "inativar", id: centro.id, nome: centro.nome })}
                          >
                            <InactivateActionIcon size={16} style={{ color: "currentColor" }} />
                            Inativar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-[12px] cursor-pointer gap-2 text-[#16A34A] focus:text-white data-[highlighted]:text-white"
                            onClick={() => setAviso({ tipo: "reativar", id: centro.id, nome: centro.nome })}
                          >
                            <ActivateActionIcon size={16} style={{ color: "currentColor" }} />
                            Reativar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-[12px] cursor-pointer gap-2 text-[#DC2626] focus:text-white data-[highlighted]:text-white"
                          onClick={() => { void pedirExclusao(centro); }}
                        >
                          <DeleteActionIcon size={16} style={{ color: "currentColor" }} />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

function CentroCustoCadastroPage({ centroId, onVoltar }: { centroId: number | null; onVoltar: () => void }) {
  const editando = centroId != null;
  const consulta = trpc.financeiroV2.centrosList.useQuery(undefined, { enabled: editando });
  const [nome, setNome] = useState("");
  const [podeDigitar, setPodeDigitar] = useState(false);
  const [carregou, setCarregou] = useState(!editando);
  const hidratou = useRef<number | null>(null);
  const voltarRef = useRef(onVoltar);
  voltarRef.current = onVoltar;

  useEffect(() => {
    if (centroId == null) {
      hidratou.current = null;
      setNome("");
      setCarregou(true);
      return;
    }
    if (hidratou.current === centroId) return;
    if (consulta.isLoading) {
      setCarregou(false);
      return;
    }
    const achado = ((consulta.data ?? []) as CentroLinha[]).find((item) => item.id === centroId);
    if (!achado) {
      toast.error("Centro de custo não encontrado.");
      voltarRef.current();
      return;
    }
    hidratou.current = centroId;
    setNome(achado.nome);
    setCarregou(true);
  }, [centroId, consulta.isLoading, consulta.data]);

  const criar = trpc.financeiroV2.centrosCreate.useMutation({
    onSuccess: () => {
      toast.success("Centro de custo cadastrado.");
      onVoltar();
    },
    onError: (erro) => toast.error(erro.message || "Não foi possível cadastrar o centro de custo."),
  });
  const renomear = trpc.financeiroV2.centrosRenomear.useMutation({
    onSuccess: () => {
      toast.success("Centro de custo atualizado.");
      onVoltar();
    },
    onError: (erro) => toast.error(erro.message || "Não foi possível atualizar o centro de custo."),
  });
  const ocupado = criar.isPending || renomear.isPending;

  const salvar = () => {
    const nomeNovo = nome.trim();
    if (nomeNovo.length === 0 || ocupado || !carregou) return;
    if (centroId != null) renomear.mutate({ id: centroId, nome: nomeNovo });
    else criar.mutate({ nome: nomeNovo });
  };

  return (
    <AppLayout>
      <div className="centro-formulario">
        <style>{`
          .centro-formulario, .centro-formulario label, .centro-formulario input, .centro-formulario h1, .centro-formulario h2 {
            font-family: Inter, sans-serif;
          }
          .centro-formulario label { font-size: 13px; font-weight: 500; }
          .centro-formulario input { font-size: 14px; font-weight: 400; }
          .centro-formulario .centro-acao { font-size: 14px; font-weight: 600; }
          .centro-formulario .material-icons { font-family: "Material Icons"; }
        `}</style>
        <button
          type="button"
          onClick={onVoltar}
          className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        >
          <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          <span className="text-[13px]">Voltar</span>
        </button>
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-4">
            <h1 className="text-gray-900" style={{ fontFamily: "Inter, sans-serif", fontSize: "24px", fontWeight: 600 }}>
              {editando ? "Editar Centro de Custo" : "Cadastrar Centro de Custo"}
            </h1>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded shadow-sm p-5">
          <h2 className="mb-4" style={secao}>Informações gerais</h2>
          <div className="max-w-xl">
            <FormLabel required>Nome</FormLabel>
            <FormInput
              variant="light"
              required
              name="centro-custo-nome"
              autoComplete="off"
              readOnly={!podeDigitar}
              onFocus={() => setPodeDigitar(true)}
              value={nome}
              onChange={(valor) => setNome(valor.slice(0, 120))}
              placeholder=""
            />
          </div>
        </div>
        <div className="pt-1 flex justify-end gap-3">
          <button
            type="button"
            onClick={onVoltar}
            disabled={ocupado}
            className="centro-acao px-6 py-2 rounded-full uppercase tracking-wide bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={ocupado || !carregou || nome.trim().length === 0}
            className="centro-acao px-6 py-2 rounded-full uppercase tracking-wide text-gray-800 hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {ocupado ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
