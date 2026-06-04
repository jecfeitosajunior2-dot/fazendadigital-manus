import { useRef, useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormTextarea,
  FormDatePicker,
} from "@/components/FormFields";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ConfirmDialog";

const TIPOS_MANUTENCAO = [
  { value: "Preventiva", label: "Preventiva" },
  { value: "Corretiva", label: "Corretiva" },
] as const;

const STATUS_OPTS = [
  { value: "agendada", label: "Agendada" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluida", label: "Concluída" },
] as const;

type StatusManutencao = (typeof STATUS_OPTS)[number]["value"];

type PecaItem = {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  estoqueId?: number | null;
  unidade?: string | null;
};

type FormState = {
  maquinaId: string;
  tipo: string;
  data: string;
  proximaManutencao: string;
  horimetro: string;
  status: StatusManutencao;
  descricao: string;
  observacoes: string;
  prestadorNome: string;
  prestadorContato: string;
  valorMaoObra: string;
};

const emptyForm = (): FormState => ({
  maquinaId: "",
  tipo: "Preventiva",
  data: new Date().toISOString().slice(0, 10),
  proximaManutencao: "",
  horimetro: "",
  status: "concluida",
  descricao: "",
  observacoes: "",
  prestadorNome: "",
  prestadorContato: "",
  valorMaoObra: "",
});

function toDateInput(value: unknown): string {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function getSearchParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ManutencaoFormPage() {
  const [, setLocation] = useLocation();
  const editId = Number(getSearchParam("id") || 0);
  const isEdit = editId > 0;
  const initializedForId = useRef<number | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [pecas, setPecas] = useState<PecaItem[]>([]);
  const [aba, setAba] = useState<"pecas" | "prestador">("pecas");

  // Campos de entrada de nova peça
  const [pecaNome, setPecaNome] = useState("");
  const [pecaQtd, setPecaQtd] = useState("1");
  const [pecaValor, setPecaValor] = useState("");
  const [pecaOpen, setPecaOpen] = useState(false);
  const [pecaSearch, setPecaSearch] = useState("");
  const [pecaEscolhida, setPecaEscolhida] = useState<{ id: number; nome: string; valorUnitario?: string | number | null; quantidadeDisponivel?: number; unidade?: string | null } | null>(null);
  const confirm = useConfirm();
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>(["Peças", "Lubrificantes"]);
  const [categoriasDisponiveis] = useState(["Farmácia", "Nutricionais", "Combustíveis", "Lubrificantes", "Ferramentas", "Peças", "Agrícolas", "Epis", "Outros Insumos"]);
  const [mostrarFiltroCategoria, setMostrarFiltroCategoria] = useState(false);
  const CATEGORIAS_MANUTENACAO = ["Farmácia", "Nutricionais", "Combustíveis", "Lubrificantes", "Ferramentas", "Peças", "Agrícolas", "Epis", "Outros Insumos"];
  const CATEGORIAS_PADRAO = ["Peças", "Lubrificantes"];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: registro, isLoading } = trpc.manutencoes.get.useQuery(
    { id: editId },
    { enabled: isEdit }
  );
  const { data: estoqueItems = [] } = trpc.estoque.listByCategories.useQuery({
    categorias: categoriasFiltro.length > 0 ? categoriasFiltro : CATEGORIAS_PADRAO,
  });
  const utils = trpc.useUtils();

  const createMutation = trpc.manutencoes.create.useMutation({
    onSuccess: () => {
      utils.manutencoes.list.invalidate();
      toast.success("Manutenção registrada!");
      setLocation("/maquinas/manutencao");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.manutencoes.update.useMutation({
    onSuccess: () => {
      utils.manutencoes.list.invalidate();
      toast.success("Manutenção atualizada!");
      setLocation("/maquinas/manutencao");
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    if (!isEdit || !registro) return;
    if (initializedForId.current === registro.id) return;
    setForm({
      maquinaId: String(registro.maquinaId),
      tipo: registro.tipo ?? "Preventiva",
      data: toDateInput(registro.data),
      proximaManutencao: toDateInput(registro.proximaManutencao),
      horimetro: registro.horimetro ?? "",
      status: (registro.status as StatusManutencao) ?? "concluida",
      descricao: registro.descricao ?? "",
      observacoes: registro.observacoes ?? "",
      prestadorNome: registro.prestadorNome ?? "",
      prestadorContato: registro.prestadorContato ?? "",
      valorMaoObra: registro.valorMaoObra
        ? formatCurrencyBrl(String(Math.round(parseFloat(String(registro.valorMaoObra)) * 100)))
        : "",
    });
    setPecas(
      (registro.pecas ?? []).map(p => ({
        nome: p.nome,
        quantidade: parseFloat(String(p.quantidade)) || 0,
        valorUnitario: parseFloat(String(p.valorUnitario)) || 0,
        estoqueId: p.estoqueId,
      }))
    );
    initializedForId.current = registro.id;
  }, [isEdit, registro]);

  // ── Totais ao vivo ────────────────────────────────────────────────────────
  const totalPecas = useMemo(
    () => pecas.reduce((s, p) => s + p.quantidade * p.valorUnitario, 0),
    [pecas]
  );

  const valorMaoObraNum = useMemo(() => {
    const v = parseCurrencyBrl(form.valorMaoObra);
    return v ? parseFloat(v) : 0;
  }, [form.valorMaoObra]);

  const totalGeral = totalPecas + valorMaoObraNum;

  const handleSelectEstoque = (item: typeof estoqueItems[0]) => {
    setPecaNome(item.nome);
    setPecaValor(item.valorUnitario ? formatCurrencyBrl(String(Math.round(parseFloat(String(item.valorUnitario)) * 100))) : "");
    setPecaEscolhida({
      id: item.id,
      nome: item.nome,
      valorUnitario: item.valorUnitario ?? undefined,
      quantidadeDisponivel: item.quantidade != null ? parseFloat(String(item.quantidade)) : undefined,
      unidade: item.unidade ?? undefined,
    });
    setPecaOpen(false);
    setPecaSearch("");
  };

  const filteredEstoque = useMemo(() => {
    if (!pecaSearch.trim()) return estoqueItems;
    const search = pecaSearch.toLowerCase();
    return estoqueItems.filter(item => item.nome.toLowerCase().includes(search));
  }, [estoqueItems, pecaSearch]);

  const adicionarPeca = () => {
    const nome = pecaNome.trim();
    const qtd = parseFloat(pecaQtd.replace(",", "."));
    const valor = pecaValor ? parseFloat(parseCurrencyBrl(pecaValor) || "0") : 0;
    if (!nome) return toast.error("Informe o nome da peça.");
    if (Number.isNaN(qtd) || qtd <= 0) return toast.error("Informe uma quantidade válida.");

    // Validação de saldo de estoque (apenas para itens vinculados ao estoque)
    if (pecaEscolhida?.id != null && pecaEscolhida.quantidadeDisponivel != null) {
      const disponivel = pecaEscolhida.quantidadeDisponivel;
      const jaAdicionado = pecas
        .filter(p => p.estoqueId === pecaEscolhida.id)
        .reduce((s, p) => s + p.quantidade, 0);
      const unidade = pecaEscolhida.unidade ? ` ${pecaEscolhida.unidade}` : "";
      if (jaAdicionado + qtd > disponivel) {
        const restante = Math.max(disponivel - jaAdicionado, 0);
        return toast.error(
          `Estoque insuficiente para "${nome}". Disponível: ${disponivel.toLocaleString("pt-BR")}${unidade}` +
            (jaAdicionado > 0 ? ` (já adicionado: ${jaAdicionado.toLocaleString("pt-BR")}${unidade}, resta ${restante.toLocaleString("pt-BR")}${unidade})` : "") +
            `.`
        );
      }
    }

    setPecas(prev => [...prev, { nome, quantidade: qtd, valorUnitario: valor, estoqueId: pecaEscolhida?.id, unidade: pecaEscolhida?.unidade }]);
    setPecaNome("");
    setPecaQtd("1");
    setPecaValor("");
    setPecaEscolhida(null);
    setPecaSearch("");
    setPecaOpen(false);
  };

  const removerPeca = async (index: number) => {
    const peca = pecas[index];
    const ok = await confirm({
      title: "Remover peça",
      description: `Tem certeza que deseja remover "${peca?.nome ?? "esta peça"}" da lista?`,
      confirmText: "Remover",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) setPecas(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.maquinaId) return toast.error("Selecione a máquina.");
    if (!form.tipo) return toast.error("Selecione o tipo de manutenção.");
    if (!form.data) return toast.error("Informe a data da manutenção.");

    const payload = {
      maquinaId: Number(form.maquinaId),
      tipo: form.tipo,
      data: form.data,
      proximaManutencao: form.proximaManutencao || undefined,
      horimetro: form.horimetro.trim() || undefined,
      status: form.status,
      descricao: form.descricao.trim() || undefined,
      observacoes: form.observacoes.trim() || undefined,
      prestadorNome: form.prestadorNome.trim() || undefined,
      prestadorContato: form.prestadorContato.trim() || undefined,
      valorMaoObra: valorMaoObraNum,
      pecas: pecas.map(p => ({
        nome: p.nome,
        quantidade: p.quantidade,
        valorUnitario: p.valorUnitario,
        estoqueId: p.estoqueId,
      })),
    };

    if (isEdit) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const pending = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── Bloco 1: Dados da manutenção ─────────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <h1
            className="text-[16px] font-semibold text-gray-800 mb-5 pb-4 border-b border-gray-100 flex items-center gap-2"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            <span className="material-icons text-[20px]" style={{ color: FD_PRIMARY }}>
              build
            </span>
            {isEdit ? "Editar manutenção" : "Registro de Manutenção"}
          </h1>

          {/* Linha 1: Máquina | Tipo | Data | Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <FormLabel required>Máquina</FormLabel>
              <FormNativeSelect
                value={form.maquinaId}
                onChange={v => set("maquinaId", v)}
                placeholder="Selecione a Máquina"
                required
                options={maquinas.map(m => ({ value: String(m.id), label: m.nome }))}
              />
            </div>
            <div>
              <FormLabel required>Tipo de manutenção</FormLabel>
              <FormNativeSelect
                value={form.tipo}
                onChange={v => set("tipo", v)}
                placeholder="Selecione o tipo"
                required
                options={TIPOS_MANUTENCAO.map(t => ({ value: t.value, label: t.label }))}
              />
            </div>
            <div>
              <FormLabel required>Data da manutenção</FormLabel>
              <FormDatePicker
                value={form.data}
                onChange={v => set("data", v)}
                placeholder="Selecione a data"
                required
              />
            </div>
            <div>
              <FormLabel>Status</FormLabel>
              <FormNativeSelect
                value={form.status}
                onChange={v => set("status", v as StatusManutencao)}
                placeholder="Selecione o status"
                options={STATUS_OPTS.map(s => ({ value: s.value, label: s.label }))}
              />
            </div>
          </div>

          {/* Linha 2: Leitura odômetro | Próxima manutenção */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <FormLabel>Leitura do odômetro / horímetro</FormLabel>
              <FormInput
                value={form.horimetro}
                onChange={v => set("horimetro", v.replace(/[^\d.,]/g, ""))}
                placeholder="Ex. 10000"
              />
            </div>
            <div>
              <FormLabel>Próxima manutenção</FormLabel>
              <FormDatePicker
                value={form.proximaManutencao}
                onChange={v => set("proximaManutencao", v)}
                placeholder="Selecione a data prevista"
              />
            </div>
          </div>

          {/* Descrição */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <FormLabel>Descrição do serviço</FormLabel>
              <FormTextarea
                value={form.descricao}
                onChange={v => set("descricao", v)}
                placeholder="Descreva o serviço realizado ou a realizar"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* ── Bloco 2: Abas Peças / Prestador ──────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden">
          {/* Cabeçalho das abas */}
          <div className="grid grid-cols-2 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setAba("pecas")}
              className={cn(
                "flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors active:scale-[0.98]",
                aba === "pecas"
                  ? "text-gray-800 border-b-2"
                  : "text-gray-400 border-b-2 border-transparent hover:text-gray-600"
              )}
              style={aba === "pecas" ? { borderColor: FD_PRIMARY, minHeight: 52 } : { minHeight: 52 }}
            >
              <span className="material-icons text-[20px]">build</span>
              Peças
            </button>
            <button
              type="button"
              onClick={() => setAba("prestador")}
              className={cn(
                "flex items-center justify-center gap-2 text-[13px] font-semibold transition-colors active:scale-[0.98]",
                aba === "prestador"
                  ? "text-gray-800 border-b-2"
                  : "text-gray-400 border-b-2 border-transparent hover:text-gray-600"
              )}
              style={aba === "prestador" ? { borderColor: FD_PRIMARY, minHeight: 52 } : { minHeight: 52 }}
            >
              <span className="material-icons text-[20px]">engineering</span>
              Prestador
            </button>
          </div>

          {/* Conteúdo Peças */}
          {aba === "pecas" && (
            <div className="p-5 sm:p-6">
              {/* Filtro de Categorias */}
              <div className="mb-4 pb-4 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setMostrarFiltroCategoria(!mostrarFiltroCategoria)}
                  className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <span className="material-icons text-[16px]">filter_list</span>
                  Filtrar por Categoria
                  <span className="material-icons text-[14px]" style={{ transform: mostrarFiltroCategoria ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>expand_more</span>
                </button>
                {mostrarFiltroCategoria && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {CATEGORIAS_MANUTENACAO.map(cat => (
                      <button
                        key={cat}
                        type="button"
                                                onClick={() => {
                          setCategoriasFiltro(prev => {
                            if (prev.includes(cat)) {
                              return prev.filter(c => c !== cat);
                            } else {
                              return [...prev, cat];
                            }
                          });
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95",
                          categoriasFiltro.includes(cat)
                            ? "text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        )}
                        style={categoriasFiltro.includes(cat) ? { backgroundColor: FD_PRIMARY } : {}}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end mb-4">
                <div className="sm:col-span-5">
                  <FormLabel>Peça</FormLabel>
                  <Popover open={pecaOpen} onOpenChange={setPecaOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                        style={{ minHeight: 40 }}
                      >
                        {pecaNome || "Selecione uma peça..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Buscar peça..."
                          value={pecaSearch}
                          onValueChange={setPecaSearch}
                        />
                        <CommandList>
                          <CommandGroup>
                            {filteredEstoque.length === 0 ? (
                              <div className="px-2 py-6 text-center text-sm text-gray-500">
                                Nenhuma peça encontrada.
                              </div>
                            ) : (
                              filteredEstoque.map(item => (
                                <CommandItem
                                  key={item.id}
                                  value={String(item.id)}
                                  onSelect={() => handleSelectEstoque(item)}
                                >
                                  <div className="flex-1">
                                    <div className="font-medium">{item.nome}</div>
                                    <div className="text-xs text-gray-500">
                                      {item.categoria} {item.subcategoria ? `• ${item.subcategoria}` : ""}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    {item.valorUnitario && (
                                      <div className="text-xs font-semibold text-gray-600">
                                        R$ {parseFloat(String(item.valorUnitario)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </div>
                                    )}
                                    <div className={cn(
                                      "text-[10px] font-medium",
                                      item.quantidade != null && parseFloat(String(item.quantidade)) > 0 ? "text-emerald-600" : "text-red-500"
                                    )}>
                                      {item.quantidade != null
                                        ? `${parseFloat(String(item.quantidade)).toLocaleString("pt-BR")}${item.unidade ? " " + item.unidade : ""} em estoque`
                                        : "sem controle"}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="sm:col-span-2">
                  <FormLabel>Qtd</FormLabel>
                  <FormInput
                    value={pecaQtd}
                    onChange={v => setPecaQtd(v.replace(/[^\d.,]/g, ""))}
                    placeholder="1"
                  />
                  {pecaEscolhida?.quantidadeDisponivel != null && (
                    <p className={cn(
                      "mt-1 text-[10px] font-medium",
                      pecaEscolhida.quantidadeDisponivel > 0 ? "text-gray-500" : "text-red-500"
                    )}>
                      Disp.: {pecaEscolhida.quantidadeDisponivel.toLocaleString("pt-BR")}{pecaEscolhida.unidade ? " " + pecaEscolhida.unidade : ""}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-3">
                  <FormLabel>Valor Unit.</FormLabel>
                  <FormInput
                    value={pecaValor}
                    onChange={v => setPecaValor(formatCurrencyBrl(v))}
                    placeholder="R$ 0,00"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={adicionarPeca}
                    className="w-full rounded-md text-[12px] font-semibold uppercase tracking-wide text-white transition hover:brightness-95 active:scale-[0.97] flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: FD_PRIMARY, minHeight: 48 }}
                  >
                    <span className="material-icons text-[16px]">add</span>
                    Adicionar
                  </button>
                </div>
              </div>

              {/* Tabela de peças */}
              <div className="overflow-x-auto border border-gray-100 rounded-md">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200">
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Peça</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[80px]">Qtd</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[130px]">Valor Unit.</th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[130px]">Total</th>
                      <th className="px-2 py-2.5 w-[48px]" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pecas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-[12px]">
                          Nenhuma peça adicionada.
                        </td>
                      </tr>
                    )}
                    {pecas.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2.5 align-middle text-gray-800">{p.nome}</td>
                        <td className="px-3 py-2.5 align-middle text-right text-gray-600 tabular-nums">
                          {p.quantidade.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-right text-gray-600 tabular-nums">
                          {brl(p.valorUnitario)}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-right font-semibold text-gray-800 tabular-nums">
                          {brl(p.quantidade * p.valorUnitario)}
                        </td>
                        <td className="px-2 py-2.5 align-middle text-center">
                          <button
                            type="button"
                            onClick={() => removerPeca(i)}
                            className="grid place-items-center rounded hover:bg-red-50 text-red-400 active:scale-95 transition"
                            style={{ minWidth: 40, minHeight: 40 }}
                            aria-label="Remover peça"
                          >
                            <span className="material-icons text-[18px] leading-none">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mt-3">
                <span className="text-[13px] font-semibold text-gray-800">
                  Total Peças: {brl(totalPecas)}
                </span>
              </div>
            </div>
          )}

          {/* Conteúdo Prestador */}
          {aba === "prestador" && (
            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <FormLabel>Nome do prestador / oficina</FormLabel>
                  <FormInput
                    value={form.prestadorNome}
                    onChange={v => set("prestadorNome", v)}
                    placeholder="Ex. Oficina do João"
                  />
                </div>
                <div>
                  <FormLabel>Contato</FormLabel>
                  <FormInput
                    value={form.prestadorContato}
                    onChange={v => set("prestadorContato", v)}
                    placeholder="Telefone ou e-mail"
                  />
                </div>
                <div>
                  <FormLabel>Valor da mão de obra (R$)</FormLabel>
                  <FormInput
                    value={form.valorMaoObra}
                    onChange={v => set("valorMaoObra", formatCurrencyBrl(v))}
                    placeholder="R$ 0,00"
                  />
                </div>
              </div>

              <div className="flex justify-end mt-3">
                <span className="text-[13px] font-semibold text-gray-800">
                  Total Mão de Obra: {brl(valorMaoObraNum)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Bloco 3: Total Geral ─────────────────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 px-5 py-4 sm:px-6 flex items-center justify-end gap-2">
          <span className="material-icons text-[20px] text-amber-500">savings</span>
          <span className="text-[15px] font-semibold text-gray-800">
            Total Geral da Manutenção: {brl(totalGeral)}
          </span>
        </div>

        {/* ── Observações + Ações ──────────────────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <div className="mb-5">
            <FormLabel>Observações gerais</FormLabel>
            <FormTextarea
              value={form.observacoes}
              onChange={v => set("observacoes", v)}
              placeholder="Anotações adicionais sobre a manutenção"
              rows={2}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setLocation("/maquinas/manutencao")}
              className="w-full sm:w-auto px-6 rounded-full text-[12px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 active:scale-[0.97] transition-colors flex items-center justify-center"
              style={{ minHeight: 48 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className={cn(
                "w-full sm:w-auto px-6 rounded-full text-[12px] font-semibold uppercase tracking-wide text-white active:scale-[0.97] transition-colors flex items-center justify-center gap-2",
                pending && "opacity-60 cursor-not-allowed"
              )}
              style={{ backgroundColor: FD_PRIMARY, minHeight: 48 }}
            >
              {pending ? (
                <><span className="material-icons text-[16px] animate-spin">refresh</span> Salvando...</>
              ) : (
                <><span className="material-icons text-[16px]">save</span> Salvar</>
              )}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { ManutencaoFormPage };
