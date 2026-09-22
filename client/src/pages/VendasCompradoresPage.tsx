import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import { CompradorFormPage } from "@/components/venda/CompradorFormDialog";
import { compradorFormFromPessoa, type CompradorFormValues } from "@/lib/compradoresCadastro";
import { FD_PRIMARY, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { ActivateActionIcon, EditActionIcon, InactivateActionIcon, TableIconButton } from "@/components/icons/FarmActionIcons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter, { type TablePageSize } from "@/components/TablePaginationFooter";
import { COMPRA_VENDA_VENDAS_PATH } from "@/lib/compraVendaCompradores";
import {
  CONSULTA_COMPRADORES_ADMIN,
  acoesCompradorListagem,
  alterarBuscaCompradores,
  aplicarFiltrosCompradores,
  compradorEstaAtivo,
  compradoresExibidosNaTabela,
  estadoInicialFiltrosCompradores,
  limparFiltrosCompradores,
  paginarCompradoresListagem,
  selecionarStatusCompradores,
  textoOuTraco,
  type StatusFiltroComprador,
} from "@/lib/compradoresListagem";
import { formatCpfCnpj, formatPhoneBR } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

type CompradorRow = {
  id: number;
  nome: string;
  documento?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  email?: string | null;
  observacoes?: string | null;
  propriedadeEstabelecimento?: string | null;
  nomeContato?: string | null;
  cidade?: string | null;
  uf?: string | null;
  ativo?: boolean | null;
};

const filtroLabelCls = "block text-[11px] font-medium text-gray-600 mb-1";
const filtroInputCls =
  "box-border border border-gray-300 rounded px-3 py-1.5 text-[12px] leading-[16px] text-gray-700 bg-white w-full min-w-0 h-[34px] min-h-[34px] focus:outline-none focus:border-[#4ECDC4] transition-colors";
const filtroSelectTriggerCls =
  "w-full h-[34px] min-h-[34px] py-1.5 border-gray-300 text-[12px] leading-[16px] text-gray-700 shadow-none focus-visible:ring-0 data-[size=default]:h-[34px]";

function StatusCompradorBadge({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={
        ativo
          ? "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700"
          : "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600"
      }
    >
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

export default function VendasCompradoresPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const { data: compradores = [], isLoading } = trpc.pessoas.list.useQuery(CONSULTA_COMPRADORES_ADMIN);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [initial, setInitial] = useState<Partial<CompradorFormValues>>({});
  const [filtroUi, setFiltroUi] = useState(estadoInicialFiltrosCompradores);
  const [pageSize, setPageSize] = useState<TablePageSize>(10);

  const deleteMutation = trpc.pessoas.delete.useMutation({
    onSuccess: async () => {
      toast.success("Comprador inativado.");
      await utils.pessoas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const reativarMutation = trpc.pessoas.reativar.useMutation({
    onSuccess: async () => {
      toast.success("Comprador reativado.");
      await utils.pessoas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const fecharForm = () => {
    setFormOpen(false);
    setEditId(null);
    setInitial({});
  };

  const abrirNovo = () => {
    setEditId(null);
    setInitial({});
    setFormOpen(true);
  };

  const abrirEditar = (p: CompradorRow) => {
    setEditId(p.id);
    setInitial({
      ...compradorFormFromPessoa(p),
      documento: formatCpfCnpj(p.documento ?? ""),
      telefone: formatPhoneBR(p.telefone ?? ""),
    });
    setFormOpen(true);
  };

  const inativar = async (p: CompradorRow) => {
    const ok = await confirm({
      title: "Inativar comprador?",
      description:
        "Ele deixa de aparecer nas novas vendas. As vendas já registradas continuam com o nome que foi salvo na época.",
      confirmText: "Inativar",
      variant: "warning",
    });
    if (!ok) return;
    deleteMutation.mutate({ id: p.id });
  };

  const reativar = async (p: CompradorRow) => {
    const ok = await confirm({
      title: "Reativar comprador",
      description: (
        <>
          <p>Reativar {p.nome}?</p>
          <p className="mt-3">Este comprador voltará a ficar disponível para novas vendas.</p>
        </>
      ),
      confirmText: "Reativar",
      cancelText: "Voltar",
      variant: "success",
    });
    if (!ok) return;
    reativarMutation.mutate({ id: p.id });
  };

  const aplicarFiltros = () => {
    setFiltroUi(aplicarFiltrosCompradores);
  };

  const limparFiltros = () => {
    setFiltroUi(limparFiltrosCompradores());
  };

  const filtradas = useMemo(
    () => compradoresExibidosNaTabela(compradores, filtroUi),
    [compradores, filtroUi],
  );
  const page = filtroUi.page;
  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const pageItems = paginarCompradoresListagem(filtradas, page, pageSize);

  useEffect(() => {
    if (page > totalPages) setFiltroUi(e => ({ ...e, page: totalPages }));
  }, [page, totalPages]);

  const temFiltro = Boolean(filtroUi.aplicados.busca.trim() || filtroUi.aplicados.status !== "todos");
  const emptyTotal = !isLoading && compradores.length === 0;
  const emptyFiltro = !isLoading && compradores.length > 0 && filtradas.length === 0;

  if (formOpen) {
    return (
      <AppLayout>
        <CompradorFormPage
          editId={editId}
          initial={initial}
          onClose={fecharForm}
          onSaved={fecharForm}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation(COMPRA_VENDA_VENDAS_PATH)}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        aria-label="Voltar"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden min-w-0">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <div className="min-w-0">
            <h1
              className="text-[20px] font-semibold text-gray-900"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              Compradores
            </h1>
          </div>
          <button
            type="button"
            onClick={abrirNovo}
            className="inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold hover:brightness-95 transition shrink-0 min-h-[44px]"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <span className="material-icons text-[16px]">add</span>
            Novo Comprador
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div className="min-w-0">
              <label className={filtroLabelCls}>Buscar</label>
              <div className="relative">
                <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">
                  search
                </span>
                <input
                  type="text"
                  value={filtroUi.rascunho.busca}
                  onChange={e => setFiltroUi(s => alterarBuscaCompradores(s, e.target.value))}
                  placeholder="Buscar por nome, CPF/CNPJ ou telefone"
                  className={`${filtroInputCls} pl-8 pr-3`}
                />
              </div>
            </div>
            <div className="min-w-0">
              <label className={filtroLabelCls}>Status</label>
              <FormSelect
                variant="light"
                value={filtroUi.rascunho.status}
                onChange={v => setFiltroUi(s => selecionarStatusCompradores(s, v as StatusFiltroComprador))}
                placeholder="Todos"
                triggerClassName={filtroSelectTriggerCls}
              >
                <SelectItem value="todos" className="text-[12px]">Todos</SelectItem>
                <SelectItem value="ativos" className="text-[12px]">Ativos</SelectItem>
                <SelectItem value="inativos" className="text-[12px]">Inativos</SelectItem>
              </FormSelect>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={limparFiltros}
              className="px-4 py-1.5 rounded text-[12px] font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 min-h-[34px]"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={aplicarFiltros}
              className="px-5 py-1.5 rounded text-[12px] font-semibold text-white hover:brightness-95 transition min-h-[34px]"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              Filtrar
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-14 px-6 text-center text-[13px] text-gray-500">Carregando...</div>
        ) : emptyTotal ? (
          <div className="py-14 px-6 text-center">
            <span className="material-icons text-[40px] text-gray-300 block mb-3">groups</span>
            <h2 className="text-[16px] font-semibold text-gray-900">Nenhum comprador cadastrado.</h2>
            <p className="text-[13px] text-gray-600 mt-2">Cadastre o primeiro comprador para usar nas vendas.</p>
            <button
              type="button"
              onClick={abrirNovo}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold text-white"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              Novo Comprador
            </button>
          </div>
        ) : emptyFiltro ? (
          <div className="py-14 px-6 text-center">
            <span className="material-icons text-[40px] text-gray-300 block mb-3">search_off</span>
            <h2 className="text-[16px] font-semibold text-gray-900">
              Nenhum comprador encontrado para os filtros selecionados.
            </h2>
            <p className="text-[13px] text-gray-600 mt-2">Revise a busca ou o status, ou limpe os filtros.</p>
            {temFiltro ? (
              <button
                type="button"
                onClick={limparFiltros}
                className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <TableHorizontalScroll
            fitWidth
            footer={
              filtradas.length > 0 ? (
                <TablePaginationFooter
                  pageSize={pageSize}
                  page={page}
                  totalItems={filtradas.length}
                  onPageChange={p => setFiltroUi(e => ({ ...e, page: p }))}
                  onPageSizeChange={size => {
                    setPageSize(size);
                    setFiltroUi(e => ({ ...e, page: 1 }));
                  }}
                  itemLabel="compradores"
                />
              ) : null
            }
          >
            <table className="w-full min-w-[760px] table-fixed text-[12px] border-collapse">
              <colgroup>
                <col />
                <col style={{ width: "168px" }} />
                <col style={{ width: "150px" }} />
                <col />
                <col style={{ width: "96px" }} />
                <col style={{ width: "88px" }} />
              </colgroup>
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Nome / Razão Social
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    CPF/CNPJ
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Telefone
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    E-mail
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p: CompradorRow) => {
                  const ativo = compradorEstaAtivo(p);
                  const acoes = acoesCompradorListagem(ativo);
                  return (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 text-gray-800 font-medium">{textoOuTraco(p.nome)}</td>
                      <td className="px-4 py-2.5 text-center text-gray-700 tabular-nums">
                        {p.documento ? formatCpfCnpj(p.documento) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-700 tabular-nums">
                        {p.telefone ? formatPhoneBR(p.telefone) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-700">{textoOuTraco(p.email)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusCompradorBadge ativo={ativo} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          {acoes.editar ? (
                            <TableIconButton label="Editar comprador" onClick={() => abrirEditar(p)} compact>
                              <EditActionIcon size={16} />
                            </TableIconButton>
                          ) : null}
                          {acoes.inativar ? (
                            <TableIconButton
                              label="Inativar comprador"
                              onClick={() => void inativar(p)}
                              tone="warning"
                              compact
                            >
                              <InactivateActionIcon size={16} />
                            </TableIconButton>
                          ) : null}
                          {acoes.reativar ? (
                            <TableIconButton
                              label="Reativar comprador"
                              onClick={() => void reativar(p)}
                              tone="success"
                              compact
                            >
                              <ActivateActionIcon size={16} />
                            </TableIconButton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableHorizontalScroll>
        )}
      </div>
    </AppLayout>
  );
}
