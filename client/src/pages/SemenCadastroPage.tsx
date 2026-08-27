import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FD_PRIMARY } from "@/components/FormFields";
import { CadastrarSemenExternoDialog } from "@/components/semen/CadastrarSemenExternoDialog";
import {
  ActivateActionIcon,
  EditActionIcon,
  InactivateActionIcon,
  TableIconButton,
} from "@/components/icons/FarmActionIcons";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateBR } from "@/lib/date-utils";
import { trpc } from "@/lib/trpc";
import { persistRebanhoFazendaId, readPersistedRebanhoFazendaId } from "@shared/animal-filter-types";
import type { SemenReprodutorExternoCatalogoItem } from "@shared/semenReprodutorExternoCatalogo";
import { toast } from "sonner";

export default function SemenCadastroPage() {
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [cadastrarAberto, setCadastrarAberto] = useState(false);
  const [editar, setEditar] = useState<SemenReprodutorExternoCatalogoItem | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [editCentral, setEditCentral] = useState("");
  const [editObs, setEditObs] = useState("");

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved = fromStorage || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const utils = trpc.useUtils();

  const { data: itens = [], isLoading } = trpc.semen.listCatalogoExternos.useQuery(
    { fazendaId: fazendaNum, incluirInativos: mostrarInativos },
    { enabled: fazendaNum > 0 },
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter(i => i.reprodutorTexto.toLowerCase().includes(q));
  }, [itens, busca]);

  const updateMutation = trpc.semen.updateCatalogoExterno.useMutation({
    onSuccess: async () => {
      await utils.semen.listCatalogoExternos.invalidate();
      toast.success("Cadastro atualizado.");
      setEditar(null);
    },
    onError: err => toast.error(err.message),
  });

  const abrirEdicao = (item: SemenReprodutorExternoCatalogoItem) => {
    setEditar(item);
    setEditTexto(item.reprodutorTexto);
    setEditCentral(item.centralPadrao ?? "");
    setEditObs(item.observacoes ?? "");
  };

  const fieldCls =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px]";

  return (
    <AppLayout>
      <div className="space-y-2">
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
            <div>
              <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
                Cadastro de sêmen
              </h1>
              <p className="text-[12px] text-gray-500 mt-0.5">
                Reprodutores externos reutilizáveis. Partida e custo ficam em cada inseminação.
              </p>
            </div>
            <button
              type="button"
              disabled={fazendaNum <= 0}
              onClick={() => setCadastrarAberto(true)}
              className="px-4 py-1.5 rounded text-[12px] font-semibold text-white min-h-[34px] disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              + Novo
            </button>
          </div>
          <div className="px-5 py-3 flex flex-wrap items-end gap-3 border-b border-gray-100">
            <div className="min-w-[180px]">
              <FazendaOverviewSelect
                fazendas={fazendas}
                value={fazendaId}
                onChange={id => {
                  setFazendaId(id);
                  persistRebanhoFazendaId(id);
                }}
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <input
                type="search"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar reprodutor"
                className={fieldCls}
                disabled={fazendaNum <= 0}
              />
            </div>
            <label className="flex items-center gap-2 text-[12px] text-gray-600">
              <input
                type="checkbox"
                checked={mostrarInativos}
                onChange={e => setMostrarInativos(e.target.checked)}
              />
              Mostrar inativos
            </label>
          </div>
          {isLoading ? (
            <p className="px-5 py-10 text-center text-gray-400 text-sm">Carregando...</p>
          ) : filtrados.length === 0 ? (
            <p className="px-5 py-10 text-center text-gray-400 text-sm">
              {fazendaNum <= 0 ? "Selecione uma fazenda." : "Nenhum reprodutor externo cadastrado."}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="hidden sm:grid grid-cols-[1.4fr_1fr_0.8fr_1fr_90px] gap-2 px-5 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50">
                <span>Reprodutor</span>
                <span>Central padrão</span>
                <span>Status</span>
                <span>Último uso</span>
                <span className="text-center">Ações</span>
              </div>
              {filtrados.map(item => (
                <div
                  key={item.reprodutorKey}
                  className="px-5 py-2.5 grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_0.8fr_1fr_90px] gap-2 text-[12px] items-center"
                >
                  <div>
                    <p className="sm:hidden text-gray-500">Reprodutor</p>
                    <p className="font-medium text-gray-800">{item.reprodutorTexto}</p>
                  </div>
                  <div>
                    <p className="sm:hidden text-gray-500">Central padrão</p>
                    <p className="text-gray-700">{item.centralPadrao || "—"}</p>
                  </div>
                  <div>
                    <p className="sm:hidden text-gray-500">Status</p>
                    <p className={item.ativo ? "text-gray-700" : "text-amber-700"}>
                      {item.ativo ? "Ativo" : "Inativo"}
                    </p>
                  </div>
                  <div>
                    <p className="sm:hidden text-gray-500">Último uso</p>
                    <p className="text-gray-700">{item.ultimoUso ? formatDateBR(item.ultimoUso) : "—"}</p>
                  </div>
                  <div className="flex items-center justify-end sm:justify-center gap-1">
                    <TableIconButton label="Editar" onClick={() => abrirEdicao(item)}>
                      <EditActionIcon />
                    </TableIconButton>
                    <TableIconButton
                      label={item.ativo ? "Inativar" : "Reativar"}
                      onClick={() =>
                        updateMutation.mutate({
                          fazendaId: fazendaNum,
                          reprodutorKey: item.reprodutorKey,
                          ativo: !item.ativo,
                        })
                      }
                    >
                      {item.ativo ? <InactivateActionIcon /> : <ActivateActionIcon />}
                    </TableIconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CadastrarSemenExternoDialog
        open={cadastrarAberto}
        onOpenChange={setCadastrarAberto}
        fazendaId={fazendaNum}
        onCreated={() => {
          toast.success("Reprodutor cadastrado.");
        }}
      />

      <Dialog open={Boolean(editar)} onOpenChange={open => !open && setEditar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[16px]">Editar reprodutor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Reprodutor</label>
              <input
                className={fieldCls}
                value={editTexto}
                onChange={e => setEditTexto(e.target.value)}
                maxLength={500}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Central padrão</label>
              <input
                className={fieldCls}
                value={editCentral}
                onChange={e => setEditCentral(e.target.value)}
                maxLength={150}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Observação</label>
              <textarea
                className={`${fieldCls} min-h-[64px]`}
                value={editObs}
                onChange={e => setEditObs(e.target.value)}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              className="px-4 py-1.5 rounded text-[12px] font-semibold text-white min-h-[34px]"
              style={{ backgroundColor: FD_PRIMARY }}
              disabled={updateMutation.isPending || !editar}
              onClick={() => {
                if (!editar) return;
                updateMutation.mutate({
                  fazendaId: fazendaNum,
                  reprodutorKey: editar.reprodutorKey,
                  reprodutorTexto: editTexto,
                  centralPadrao: editCentral,
                  observacoes: editObs,
                });
              }}
            >
              Salvar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
