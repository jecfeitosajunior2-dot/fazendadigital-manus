import { Fragment, useState } from "react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import SubcategoriaAvisos, { type AvisoSubcategoria } from "@/components/SubcategoriaAvisos";
import { DeleteActionIcon, EditActionIcon, TableIconButton } from "@/components/icons/FarmActionIcons";
import {
  categoriasVisiveis,
  separarCategoriasFinanceiras,
  type CategoriaFinanceiraLista,
  type CategoriaVisivel,
} from "@/lib/categoriasFinanceirasTabela";
import { trpc } from "@/lib/trpc";

const fonte = "'Inter', sans-serif";
const titulo = { fontFamily: fonte, fontSize: "24px", fontWeight: 600, color: "#172033" };
const grupo = { fontFamily: fonte, fontSize: "14px", fontWeight: 600, color: "#374151" };
const coluna = { fontFamily: fonte, fontSize: "12px", fontWeight: 500, color: "#6B7280" };
const nome = { fontFamily: fonte, fontSize: "14px", fontWeight: 400 };

function alternarFechada(atual: Set<number>, id: number) {
  const proximo = new Set(atual);
  if (proximo.has(id)) proximo.delete(id);
  else proximo.add(id);
  return proximo;
}

function alternarAberta(atual: Set<number>, id: number) {
  if (!atual.has(id)) return atual;
  const proximo = new Set(atual);
  proximo.delete(id);
  return proximo;
}

function ListaCategorias({
  itens,
  incluindoId,
  editandoId,
  nomeFilho,
  salvando,
  onAlternar,
  onAdicionar,
  onEditar,
  onExcluir,
  onNomeFilho,
  onCancelarFilho,
  onSalvarFilho,
}: {
  itens: CategoriaVisivel[];
  incluindoId: number | null;
  editandoId: number | null;
  nomeFilho: string;
  salvando: boolean;
  onAlternar: (id: number) => void;
  onAdicionar: (id: number) => void;
  onEditar: (id: number, nome: string) => void;
  onExcluir: (id: number, nome: string, filha: boolean) => void;
  onNomeFilho: (nome: string) => void;
  onCancelarFilho: () => void;
  onSalvarFilho: () => void;
}) {
  if (itens.length === 0) return <div className="px-4 py-8" />;
  return (
    <ul>
      {itens.map((item) => {
        const editando = editandoId === item.categoria.id;
        return (
          <Fragment key={item.categoria.id}>
            <li
              className="flex min-h-[44px] items-center border-b border-gray-100 pr-3"
              style={{ ...nome, paddingLeft: item.filha ? 48 : 16, color: item.categoria.ativa ? "#374151" : "#9CA3AF" }}
            >
              {item.temFilhos ? (
                <button
                  type="button"
                  aria-expanded={item.aberta}
                  aria-label={item.aberta ? `Fechar ${item.categoria.nome}` : `Abrir ${item.categoria.nome}`}
                  onClick={() => onAlternar(item.categoria.id)}
                  className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
                >
                  <span className="material-icons text-[22px]">{item.aberta ? "arrow_drop_down" : "arrow_right"}</span>
                </button>
              ) : item.filha ? null : (
                <span className="mr-1 inline-block h-8 w-8 shrink-0" aria-hidden="true" />
              )}
              {editando ? (
                <input
                  autoFocus
                  value={nomeFilho}
                  maxLength={120}
                  placeholder="Subcategoria"
                  aria-label={`Subcategoria ${item.categoria.nome}`}
                  onChange={(evento) => onNomeFilho(evento.target.value)}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter") onSalvarFilho();
                    if (evento.key === "Escape") onCancelarFilho();
                  }}
                  className="h-9 min-w-0 flex-1 rounded border border-gray-200 px-3 text-gray-700 outline-none focus:border-[#4ECDC4]"
                  style={nome}
                />
              ) : (
                <span className="min-w-0 flex-1">{item.categoria.nome}</span>
              )}
              {item.filha ? (
                editando ? (
                  <>
                    <button type="button" onClick={onCancelarFilho} disabled={salvando} className="ml-2 px-2 text-[13px] text-gray-500 hover:text-gray-800 disabled:opacity-50">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={onSalvarFilho}
                      disabled={salvando || nomeFilho.trim().length === 0}
                      className="rounded px-3 py-1.5 text-[13px] font-semibold text-gray-800 disabled:opacity-50"
                      style={{ backgroundColor: "#4ECDC4" }}
                    >
                      {salvando ? "Salvando..." : "Salvar"}
                    </button>
                  </>
                ) : (
                  <span className="ml-2 inline-flex shrink-0 items-center gap-1">
                    <TableIconButton
                      label={`Editar ${item.categoria.nome}`}
                      onClick={() => onEditar(item.categoria.id, item.categoria.nome)}
                      tone="neutral"
                    >
                      <EditActionIcon size={16} />
                    </TableIconButton>
                    <TableIconButton
                      label={`Excluir ${item.categoria.nome}`}
                      onClick={() => onExcluir(item.categoria.id, item.categoria.nome, true)}
                      tone="danger"
                    >
                      <DeleteActionIcon size={16} />
                    </TableIconButton>
                  </span>
                )
              ) : (
                <span className="ml-2 inline-flex shrink-0 items-center gap-1">
                  <TableIconButton
                    label={`Excluir ${item.categoria.nome}`}
                    onClick={() => onExcluir(item.categoria.id, item.categoria.nome, false)}
                    tone="danger"
                  >
                    <DeleteActionIcon size={16} />
                  </TableIconButton>
                  <button
                    type="button"
                    aria-label={`Adicionar subcategoria em ${item.categoria.nome}`}
                    onClick={() => onAdicionar(item.categoria.id)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-[#4ECDC4] hover:bg-gray-100"
                  >
                    <span className="material-icons text-[20px]">add</span>
                  </button>
                </span>
              )}
            </li>
            {incluindoId === item.categoria.id ? (
              <li className="flex min-h-[52px] items-center gap-2 border-b border-gray-100 pr-3" style={{ paddingLeft: 48 }}>
                <input
                  autoFocus
                  value={nomeFilho}
                  maxLength={120}
                  placeholder="Subcategoria"
                  aria-label={`Subcategoria de ${item.categoria.nome}`}
                  onChange={(evento) => onNomeFilho(evento.target.value)}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter") onSalvarFilho();
                    if (evento.key === "Escape") onCancelarFilho();
                  }}
                  className="h-9 min-w-0 flex-1 rounded border border-gray-200 px-3 text-gray-700 outline-none focus:border-[#4ECDC4]"
                  style={nome}
                />
                <button type="button" onClick={onCancelarFilho} disabled={salvando} className="px-2 text-[13px] text-gray-500 hover:text-gray-800 disabled:opacity-50">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onSalvarFilho}
                  disabled={salvando || nomeFilho.trim().length === 0}
                  className="rounded px-3 py-1.5 text-[13px] font-semibold text-gray-800 disabled:opacity-50"
                  style={{ backgroundColor: "#4ECDC4" }}
                >
                  {salvando ? "Salvando..." : "Cadastrar"}
                </button>
              </li>
            ) : null}
          </Fragment>
        );
      })}
    </ul>
  );
}

function NovaCategoria({
  aberta,
  nomeCategoria,
  salvando,
  rotulo,
  onAbrir,
  onNome,
  onCancelar,
  onSalvar,
}: {
  aberta: boolean;
  nomeCategoria: string;
  salvando: boolean;
  rotulo: string;
  onAbrir: () => void;
  onNome: (nome: string) => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  if (aberta) {
    return (
      <div className="flex min-h-[52px] items-center gap-2 border-b border-gray-100 pr-3" style={{ paddingLeft: 48 }}>
        <input
          autoFocus
          value={nomeCategoria}
          maxLength={120}
          placeholder="Categoria"
          aria-label={rotulo}
          onChange={(evento) => onNome(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") onSalvar();
            if (evento.key === "Escape") onCancelar();
          }}
          className="h-9 min-w-0 flex-1 rounded border border-gray-200 px-3 text-gray-700 outline-none focus:border-[#4ECDC4]"
          style={nome}
        />
        <button type="button" onClick={onCancelar} disabled={salvando} className="px-2 text-[13px] text-gray-500 hover:text-gray-800 disabled:opacity-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando || nomeCategoria.trim().length === 0}
          className="rounded px-3 py-1.5 text-[13px] font-semibold text-gray-800 disabled:opacity-50"
          style={{ backgroundColor: "#4ECDC4" }}
        >
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex min-h-[44px] items-center border-b border-gray-100 pr-3" style={{ ...nome, paddingLeft: 16 }}>
      <span className="mr-1 inline-block h-8 w-8 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1" style={{ color: "#4ECDC4" }}>Nova categoria</span>
      <button
        type="button"
        aria-label={rotulo}
        onClick={onAbrir}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-[#4ECDC4] hover:bg-gray-100"
      >
        <span className="material-icons text-[20px]">add</span>
      </button>
    </div>
  );
}

export default function CategoriasFinanceirasPage() {
  const consulta = trpc.financeiroV2.categoriasList.useQuery();
  const lista = (consulta.data ?? []) as CategoriaFinanceiraLista[];
  const { receitas, despesas } = separarCategoriasFinanceiras(lista);
  const [receitasFechadas, setReceitasFechadas] = useState<Set<number>>(() => new Set());
  const [despesasFechadas, setDespesasFechadas] = useState<Set<number>>(() => new Set());
  const receitasVisiveis = categoriasVisiveis(receitas, receitasFechadas);
  const despesasVisiveis = categoriasVisiveis(despesas, despesasFechadas);
  const [incluindoId, setIncluindoId] = useState<number | null>(null);
  const [incluindoTipo, setIncluindoTipo] = useState<"entrada" | "saida" | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nomeFilho, setNomeFilho] = useState("");
  const [aviso, setAviso] = useState<AvisoSubcategoria | null>(null);
  const utils = trpc.useUtils();
  const criar = trpc.financeiroV2.categoriasCreate.useMutation({
    onSuccess: async (_dados, variaveis) => {
      const paiId = variaveis.categoriaPaiId ?? null;
      setIncluindoId(null);
      setIncluindoTipo(null);
      setNomeFilho("");
      await utils.financeiroV2.categoriasList.invalidate();
      if (paiId != null) {
        setReceitasFechadas((atual) => alternarAberta(atual, paiId));
        setDespesasFechadas((atual) => alternarAberta(atual, paiId));
      }
      toast.success(paiId != null ? "Subcategoria cadastrada." : "Categoria cadastrada.");
    },
    onError: (erro, variaveis) => toast.error(erro.message || (variaveis.categoriaPaiId != null
      ? "Não foi possível cadastrar a subcategoria."
      : "Não foi possível cadastrar a categoria.")),
  });
  const renomear = trpc.financeiroV2.categoriasRenomear.useMutation({
    onSuccess: async () => {
      setEditandoId(null);
      setNomeFilho("");
      await utils.financeiroV2.categoriasList.invalidate();
      toast.success("Subcategoria atualizada.");
    },
    onError: (erro) => toast.error(erro.message || "Não foi possível editar a subcategoria."),
  });
  const excluir = trpc.financeiroV2.categoriasExcluir.useMutation({
    onSuccess: async () => {
      const filha = aviso?.filha;
      setAviso(null);
      await utils.financeiroV2.categoriasList.invalidate();
      toast.success(filha ? "Subcategoria excluída." : "Categoria excluída.");
    },
    onError: (erro) => toast.error(erro.message || (aviso?.filha
      ? "Não foi possível excluir a subcategoria."
      : "Não foi possível excluir a categoria.")),
  });
  const ocupado = criar.isPending || renomear.isPending || excluir.isPending;

  const abrirFilho = (id: number) => {
    setEditandoId(null);
    setIncluindoTipo(null);
    setIncluindoId(id);
    setNomeFilho("");
    setReceitasFechadas((atual) => alternarAberta(atual, id));
    setDespesasFechadas((atual) => alternarAberta(atual, id));
  };

  const editarFilho = (id: number, nomeAtual: string) => {
    setIncluindoId(null);
    setIncluindoTipo(null);
    setEditandoId(id);
    setNomeFilho(nomeAtual);
  };

  const abrirNova = (tipo: "entrada" | "saida") => {
    setEditandoId(null);
    setIncluindoId(null);
    setIncluindoTipo(tipo);
    setNomeFilho("");
  };

  const cancelarEdicao = () => {
    setIncluindoId(null);
    setIncluindoTipo(null);
    setEditandoId(null);
    setNomeFilho("");
  };

  const pedirExclusao = async (id: number, nomeAtual: string, filha: boolean) => {
    try {
      const conferencia = await utils.financeiroV2.categoriasDeleteCheck.fetch({ id });
      setAviso({
        id,
        nome: conferencia.nome,
        filha: conferencia.filha,
        podeExcluir: conferencia.canDelete,
        conferencia: "ok",
      });
    } catch {
      setAviso({ id, nome: nomeAtual, filha, podeExcluir: false, conferencia: "falhou" });
    }
  };

  const salvarFilho = () => {
    const nomeNovo = nomeFilho.trim();
    if (nomeNovo.length === 0 || ocupado) return;
    if (editandoId != null) {
      renomear.mutate({ id: editandoId, nome: nomeNovo });
      return;
    }
    if (incluindoTipo) {
      criar.mutate({ nome: nomeNovo, tipo: incluindoTipo, categoriaPaiId: null });
      return;
    }
    const pai = lista.find((item) => item.id === incluindoId);
    if (!pai) return;
    criar.mutate({
      nome: nomeNovo,
      tipo: pai.tipo === "saida" ? "saida" : "entrada",
      categoriaPaiId: pai.id,
    });
  };

  const listaProps = {
    incluindoId,
    editandoId,
    nomeFilho,
    salvando: ocupado,
    onNomeFilho: setNomeFilho,
    onCancelarFilho: cancelarEdicao,
    onSalvarFilho: salvarFilho,
    onEditar: editarFilho,
    onExcluir: (id: number, nomeAtual: string, filha: boolean) => { void pedirExclusao(id, nomeAtual, filha); },
  };

  return (
    <AppLayout>
      <SubcategoriaAvisos
        aviso={aviso}
        enviando={excluir.isPending}
        onFechar={() => { if (!excluir.isPending) setAviso(null); }}
        onConfirmar={() => {
          if (aviso?.podeExcluir && aviso.conferencia === "ok") excluir.mutate({ id: aviso.id });
        }}
      />
      <h1 className="mb-3" style={titulo}>Categorias Financeiras</h1>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="w-1/2 border-r border-gray-200 px-4 py-3 text-center" style={grupo}>
                Categorias de Receitas
              </th>
              <th className="w-1/2 px-4 py-3 text-center" style={grupo}>
                Categorias de Despesas
              </th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th colSpan={2} className="px-4 py-2 text-left" style={coluna}>
                Nome da categoria
              </th>
            </tr>
          </thead>
          <tbody>
            {consulta.isLoading ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-gray-400" style={nome}>Carregando...</td>
              </tr>
            ) : consulta.isError ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-gray-400" style={nome}>
                  Não foi possível carregar as categorias.
                </td>
              </tr>
            ) : (
              <tr>
                <td className="align-top border-r border-gray-200 p-0">
                  <NovaCategoria
                    aberta={incluindoTipo === "entrada"}
                    nomeCategoria={nomeFilho}
                    salvando={ocupado}
                    rotulo="Nova categoria de receitas"
                    onAbrir={() => abrirNova("entrada")}
                    onNome={setNomeFilho}
                    onCancelar={cancelarEdicao}
                    onSalvar={salvarFilho}
                  />
                  <ListaCategorias
                    itens={receitasVisiveis}
                    onAlternar={(id) => setReceitasFechadas((atual) => alternarFechada(atual, id))}
                    onAdicionar={abrirFilho}
                    {...listaProps}
                  />
                </td>
                <td className="align-top p-0">
                  <NovaCategoria
                    aberta={incluindoTipo === "saida"}
                    nomeCategoria={nomeFilho}
                    salvando={ocupado}
                    rotulo="Nova categoria de despesas"
                    onAbrir={() => abrirNova("saida")}
                    onNome={setNomeFilho}
                    onCancelar={cancelarEdicao}
                    onSalvar={salvarFilho}
                  />
                  <ListaCategorias
                    itens={despesasVisiveis}
                    onAlternar={(id) => setDespesasFechadas((atual) => alternarFechada(atual, id))}
                    onAdicionar={abrirFilho}
                    {...listaProps}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
