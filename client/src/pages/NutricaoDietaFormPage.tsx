import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormSelect,
  FormTextarea,
} from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  calcularCustoEstimadoDieta,
  categoriasAnimalDieta,
  formatarCustoEstimadoDieta,
  MSG_DIETA_INSUMOS,
  NUTRICAO_DIETA_OBJETIVOS,
  NUTRICAO_DIETA_TIPOS,
  parseQuantidadeDieta,
  unidadeCompativelFormulacaoKg,
} from "@shared/nutricaoDietas";

type LinhaIngrediente = {
  key: string;
  produtoId: string;
  quantidade: string;
};

function novaLinha(): LinhaIngrediente {
  return { key: `${Date.now()}-${Math.random().toString(16).slice(2)}`, produtoId: "", quantidade: "" };
}

export default function NutricaoDietaFormPage() {
  const params = useParams<{ id?: string }>();
  const dietaId = params.id ? Number(params.id) : null;
  const isEdit = Number.isFinite(dietaId) && (dietaId ?? 0) > 0;
  const [, setLocation] = useLocation();
  const fazendaFromUrl = new URLSearchParams(window.location.search).get("fazendaId") ?? "";

  const [fazendaId, setFazendaId] = useState(fazendaFromUrl);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("");
  const [categoriaAnimal, setCategoriaAnimal] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [baseQuantidade, setBaseQuantidade] = useState("1000");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [linhas, setLinhas] = useState<LinhaIngrediente[]>([novaLinha()]);

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const fazendaNum = Number(fazendaId);
  const fazendaOk = Number.isFinite(fazendaNum) && fazendaNum > 0;

  const { data: produtos = [] } = trpc.nutricaoDietas.listProdutosFormulacao.useQuery(
    { fazendaId: fazendaNum },
    { enabled: fazendaOk },
  );
  const { data: existente } = trpc.nutricaoDietas.get.useQuery(
    { id: dietaId! },
    { enabled: isEdit },
  );

  useEffect(() => {
    if (!existente) return;
    setFazendaId(String(existente.fazendaId));
    setNome(existente.nome);
    setTipo(existente.tipo);
    setCategoriaAnimal(existente.categoriaAnimal ?? "");
    setObjetivo(existente.objetivo ?? "");
    setDescricao(existente.descricao ?? "");
    setBaseQuantidade(String(existente.baseQuantidade));
    setDataInicio(existente.dataInicio ?? "");
    setDataFim(existente.dataFim ?? "");
    setLinhas(
      existente.ingredientes.length
        ? existente.ingredientes.map(i => ({
            key: `ing-${i.id}`,
            produtoId: String(i.produtoId),
            quantidade: String(i.quantidade),
          }))
        : [novaLinha()],
    );
  }, [existente]);

  const produtosOk = useMemo(
    () => produtos.filter(p => unidadeCompativelFormulacaoKg(p.unidade, p.embalagens)),
    [produtos],
  );
  const produtoById = useMemo(() => new Map(produtos.map(p => [p.produtoId, p])), [produtos]);

  const preview = useMemo(() => {
    const base = parseQuantidadeDieta(baseQuantidade) ?? 0;
    const ingredientes = linhas
      .map(l => {
        const produto = produtoById.get(Number(l.produtoId));
        const qtd = parseQuantidadeDieta(l.quantidade);
        if (!produto || qtd == null) return null;
        return {
          produtoId: produto.produtoId,
          quantidade: qtd,
          unidade: produto.unidade,
          valorUnitario: produto.valorUnitario,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v != null);
    return calcularCustoEstimadoDieta({ baseQuantidade: base, ingredientes });
  }, [baseQuantidade, linhas, produtoById]);

  const utils = trpc.useUtils();
  const createMutation = trpc.nutricaoDietas.create.useMutation({
    onSuccess: () => {
      toast.success("Dieta cadastrada.");
      utils.nutricaoDietas.list.invalidate();
      setLocation(`/nutricao/dietas?fazendaId=${fazendaId}`);
    },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.nutricaoDietas.update.useMutation({
    onSuccess: () => {
      toast.success("Dieta atualizada.");
      utils.nutricaoDietas.list.invalidate();
      utils.nutricaoDietas.get.invalidate({ id: dietaId! });
      setLocation(`/nutricao/dietas/${dietaId}`);
    },
    onError: e => toast.error(e.message),
  });

  const pending = createMutation.isPending || updateMutation.isPending;

  const salvar = () => {
    const base = parseQuantidadeDieta(baseQuantidade);
    const ingredientes = linhas
      .map(l => ({
        produtoId: Number(l.produtoId),
        quantidade: parseQuantidadeDieta(l.quantidade) ?? 0,
      }))
      .filter(i => i.produtoId > 0);
    const payload = {
      fazendaId: fazendaNum,
      nome,
      tipo,
      descricao: descricao || null,
      categoriaAnimal: categoriaAnimal || null,
      objetivo: objetivo || null,
      dataInicio: dataInicio || null,
      dataFim: dataFim || null,
      baseQuantidade: base ?? 0,
      ingredientes,
    };
    if (isEdit) updateMutation.mutate({ id: dietaId!, ...payload });
    else createMutation.mutate(payload);
  };

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
            {isEdit ? "Editar Dieta" : "Nova Dieta"}
          </h1>
          <button
            type="button"
            onClick={() => setLocation(fazendaId ? `/nutricao/dietas?fazendaId=${fazendaId}` : "/nutricao/dietas")}
            className="text-[12px] text-gray-600 underline"
          >
            Voltar
          </button>
        </div>

        <div className="px-4 py-5 space-y-6">
          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Informações</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect
                  value={fazendaId}
                  onChange={setFazendaId}
                  fazendas={fazendas}
                  disabled={isEdit}
                  required
                />
              </div>
              <div>
                <FormLabel required>Nome</FormLabel>
                <FormInput variant="light" required value={nome} onChange={setNome} placeholder="Ex.: Mineral 90" />
              </div>
              <div>
                <FormLabel required>Tipo</FormLabel>
                <FormSelect variant="light" required placeholder="Selecione" value={tipo || "__empty__"} onChange={v => setTipo(v === "__empty__" ? "" : v)}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                  {NUTRICAO_DIETA_TIPOS.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-[12px]">{t.label}</SelectItem>
                  ))}
                </FormSelect>
              </div>
              <div>
                <FormLabel>Categoria animal</FormLabel>
                <FormSelect variant="light" placeholder="Opcional" value={categoriaAnimal || "__empty__"} onChange={v => setCategoriaAnimal(v === "__empty__" ? "" : v)}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Opcional</SelectItem>
                  {categoriasAnimalDieta().map(c => (
                    <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
                  ))}
                </FormSelect>
              </div>
              <div>
                <FormLabel>Objetivo</FormLabel>
                <FormSelect variant="light" placeholder="Opcional" value={objetivo || "__empty__"} onChange={v => setObjetivo(v === "__empty__" ? "" : v)}>
                  <SelectItem value="__empty__" className="text-[12px] text-gray-400">Opcional</SelectItem>
                  {NUTRICAO_DIETA_OBJETIVOS.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-[12px]">{o.label}</SelectItem>
                  ))}
                </FormSelect>
              </div>
              <div className="sm:col-span-2">
                <FormLabel>Descrição</FormLabel>
                <FormTextarea variant="light" value={descricao} onChange={setDescricao} placeholder="Observações da formulação" />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Formulação</h2>
            <div className="max-w-[220px]">
              <FormLabel required>Base da formulação (kg)</FormLabel>
              <FormInput variant="light" required value={baseQuantidade} onChange={setBaseQuantidade} inputMode="decimal" />
            </div>
            <p className="text-[11px] text-gray-500">{MSG_DIETA_INSUMOS}</p>
            <p className="text-[11px] text-gray-500">
              Só entram produtos em kg ou g, ou saco com uma única embalagem de massa (ex.: 30 kg/sc). Litro e unidade não são convertidos.
            </p>

            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="w-full min-w-[720px] text-[12px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] uppercase text-gray-500">Produto</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">Quantidade (kg)</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">%</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">Custo médio atual</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">Custo estimado</th>
                    <th className="px-3 py-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha, idx) => {
                    const produto = produtoById.get(Number(linha.produtoId));
                    const qtd = parseQuantidadeDieta(linha.quantidade) ?? 0;
                    const linhaCusto = preview.ingredientes.find(i => i.produtoId === Number(linha.produtoId));
                    const usados = new Set(linhas.filter(l => l.key !== linha.key).map(l => l.produtoId));
                    return (
                      <tr key={linha.key} className="border-b border-gray-100">
                        <td className="px-2 py-1.5">
                          <FormSelect
                            variant="light"
                            placeholder="Selecione"
                            value={linha.produtoId || "__empty__"}
                            onChange={v => setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, produtoId: v === "__empty__" ? "" : v } : l))}
                          >
                            <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                            {produtosOk.map(p => (
                              <SelectItem
                                key={p.produtoId}
                                value={String(p.produtoId)}
                                disabled={usados.has(String(p.produtoId))}
                                className="text-[12px]"
                              >
                                {p.nome}
                              </SelectItem>
                            ))}
                          </FormSelect>
                        </td>
                        <td className="px-2 py-1.5">
                          <FormInput
                            variant="light"
                            value={linha.quantidade}
                            onChange={v => setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, quantidade: v } : l))}
                            inputMode="decimal"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-center tabular-nums text-gray-600">
                          {linhaCusto?.percentual != null ? `${linhaCusto.percentual.toLocaleString("pt-BR")}%` : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-center tabular-nums text-gray-600">
                          {produto
                            ? (linhaCusto?.custoConhecido
                              ? formatarCustoEstimadoDieta(linhaCusto.custoMedioPorKg, true)
                              : "Sem custo")
                            : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-center tabular-nums text-gray-600">
                          {linhaCusto?.custoConhecido
                            ? formatarCustoEstimadoDieta(linhaCusto.custoEstimado, true)
                            : qtd > 0 ? "—" : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            className="text-[11px] text-red-500"
                            onClick={() => setLinhas(prev => prev.length === 1 ? [novaLinha()] : prev.filter(l => l.key !== linha.key))}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="text-[12px] font-semibold"
              style={{ color: FD_PRIMARY }}
              onClick={() => setLinhas(prev => [...prev, novaLinha()])}
            >
              + Adicionar ingrediente
            </button>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] bg-gray-50 rounded px-3 py-3">
              <div>
                <div className="text-[10px] uppercase text-gray-500">Quantidade total</div>
                <div className="font-semibold tabular-nums">{preview.totalKg.toLocaleString("pt-BR")} kg</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Diferença da base</div>
                <div className={cn("font-semibold tabular-nums", preview.diferencaKg !== 0 && "text-amber-700")}>
                  {preview.diferencaKg === 0 ? "0 kg" : `${preview.diferencaKg > 0 ? "+" : ""}${preview.diferencaKg.toLocaleString("pt-BR")} kg`}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Custo estimado total</div>
                <div className="font-semibold">{formatarCustoEstimadoDieta(preview.custoTotal, preview.completo)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Custo estimado/kg</div>
                <div className="font-semibold">{formatarCustoEstimadoDieta(preview.custoPorKg, preview.completo)}</div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              Custo estimado conforme o custo médio vigente do estoque. Não é custo histórico de fornecimento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Vigência da formulação</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <FormLabel>Data inicial</FormLabel>
                <FormDatePicker value={dataInicio} onChange={setDataInicio} />
              </div>
              <div>
                <FormLabel>Data final</FormLabel>
                <FormDatePicker value={dataFim} onChange={setDataFim} />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setLocation(fazendaId ? `/nutricao/dietas?fazendaId=${fazendaId}` : "/nutricao/dietas")}
              className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase bg-[#F0F0F0] text-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={salvar}
              className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase text-gray-900"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {pending ? "Salvando..." : "Salvar Dieta"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
