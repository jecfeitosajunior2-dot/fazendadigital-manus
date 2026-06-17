import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, AlertCircle, History, X, Tag } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { FormLabel, FieldBox, inputClassCompact } from "@/components/FormFields";
import { getCategoriasPorSexo, todasAsCategorias } from "@shared/animal-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MOTIVO_LABELS: Record<string, string> = {
  perda: "Perda",
  danificado: "Danificado",
  reidentificacao: "Reidentificação",
  erro_cadastro: "Erro de Cadastro",
  outro: "Outro",
};

export function EditAnimalPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Get animal ID from URL query param
  const searchParams = new URLSearchParams(window.location.search);
  const animalIdParam = searchParams.get("id");
  const animalId = animalIdParam ? parseInt(animalIdParam) : null;

  // Histórico de brincos
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);
  const [showRegistrarModal, setShowRegistrarModal] = useState(false);
  const [novoRegistro, setNovoRegistro] = useState({
    motivo: "perda" as "perda" | "danificado" | "reidentificacao" | "erro_cadastro" | "outro",
    observacoes: "",
    dataAlteracao: new Date().toISOString().split("T")[0],
  });

  const { data: historicoBrincos, refetch: refetchHistorico } = trpc.brincos.list.useQuery(
    { animalId: animalId! },
    { enabled: !!animalId }
  );

  const registrarBrincoMutation = trpc.brincos.registrar.useMutation({
    onSuccess: () => {
      toast.success("Troca de brinco registrada!");
      refetchHistorico();
      setShowRegistrarModal(false);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const deletarBrincoMutation = trpc.brincos.deletar.useMutation({
    onSuccess: () => {
      toast.success("Registro removido.");
      refetchHistorico();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const [formData, setFormData] = useState({
    nome: "",
    brinco: "",
    raca: "",
    sex: "",         // display value: "Macho" | "Fêmea"
    birthDate: "",
    pesoAtual: "",
    loteId: "",
    categoria: "",
    activity: "",
    status: "ativo",
    observacoes: "",
  });

  // Load animal data from DB
  const { data: animal, isLoading: loadingAnimal, error: animalError } = trpc.animais.getById.useQuery(
    { id: animalId! },
    { enabled: !!animalId }
  );

  // Load lots for dropdown
  const { data: lotes } = trpc.lotes.list.useQuery();

  // Populate form when animal data arrives
  useEffect(() => {
    if (animal) {
      setFormData({
        nome: animal.nome || "",
        brinco: animal.brinco || "",
        raca: animal.raca || "",
        sex: animal.sexo === "macho" ? "Macho" : "Fêmea",
        birthDate: animal.dataNascimento
          ? new Date(animal.dataNascimento).toISOString().split("T")[0]
          : "",
        pesoAtual: animal.pesoAtual || "",
        loteId: animal.loteId ? String(animal.loteId) : "",
        categoria: animal.categoria || "",
        activity: "",
        status: animal.status || "ativo",
        observacoes: animal.observacoes || "",
      });
    }
  }, [animal]);

  const updateMutation = trpc.animais.update.useMutation({
    onSuccess: () => {
      toast.success("Animal atualizado com sucesso!");
      utils.animais.list.invalidate();
      utils.animais.getById.invalidate({ id: animalId! });
      setLocation("/rebanho/lista-animais");
    },
    onError: (err) => {
      toast.error(`Erro ao atualizar animal: ${err.message}`);
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    if (!formData.nome.trim()) {
      toast.error("Nome / ID do animal é obrigatório");
      return;
    }
    if (!formData.sex) {
      toast.error("Sexo é obrigatório");
      return;
    }

    const sexoMapped = formData.sex === "Macho" ? "macho" : "femea";

    updateMutation.mutate({
      id: animalId!,
      nome: formData.nome.trim() || undefined,
      brinco: formData.brinco.trim() || undefined,
      raca: formData.raca.trim() || undefined,
      sexo: sexoMapped as "macho" | "femea",
      dataNascimento: formData.birthDate || undefined,
      pesoAtual: formData.pesoAtual.trim() || undefined,
      loteId: formData.loteId ? parseInt(formData.loteId) : undefined,
      categoria: formData.categoria.trim() || undefined,
      status: formData.status as "ativo" | "vendido" | "morto" | "transferido",
      observacoes: formData.observacoes.trim() || undefined,
    });
  };

  const isSubmitting = updateMutation.isPending;

  // Handle missing or invalid ID
  if (!animalId) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-4">ID de animal inválido</h2>
            <Button onClick={() => setLocation("/rebanho/lista-animais")}>
              Voltar para Lista de Animais
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (loadingAnimal) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#4ECDC4]" />
          <span className="ml-3 text-gray-600">Carregando dados do animal...</span>
        </div>
      </AppLayout>
    );
  }

  if (animalError || !animal) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Animal não encontrado</h2>
            <p className="text-gray-500 mb-4">O animal com ID {animalId} não foi encontrado no banco de dados.</p>
            <Button onClick={() => setLocation("/rebanho/lista-animais")}>
              Voltar para Lista de Animais
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setLocation("/rebanho/lista-animais")}
          className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
          disabled={isSubmitting}
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-[13px]">Voltar</span>
        </button>

        <Card className="p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">
            Editar Animal — {animal.nome || animal.brinco || `#${animal.id}`}
          </h1>

          <div className="space-y-6">
            {/* Identificação */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase border-b pb-2">Identificação</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>Nome / ID</FormLabel>
                  <FieldBox required>
                    <input
                      type="text"
                      name="nome"
                      value={formData.nome}
                      onChange={handleChange}
                      placeholder="ex: BOI-001"
                      className={inputClassCompact}
                    />
                  </FieldBox>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Número do Brinco</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setShowHistoricoModal(true)}
                        title="Ver histórico de brincos"
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#4ECDC4] transition-colors px-2 py-0.5 rounded border border-gray-200 hover:border-[#4ECDC4] bg-white"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Histórico</span>
                        {historicoBrincos && historicoBrincos.length > 0 && (
                          <span className="ml-0.5 bg-[#4ECDC4] text-white text-[10px] rounded-full px-1.5 py-0 font-bold">
                            {historicoBrincos.length}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNovoRegistro(prev => ({ ...prev, dataAlteracao: new Date().toISOString().split('T')[0] }));
                          setShowRegistrarModal(true);
                        }}
                        title="Registrar troca de brinco"
                        className="flex items-center gap-1 text-xs text-white bg-[#4ECDC4] hover:bg-[#3dbdb5] transition-colors px-2 py-0.5 rounded"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>Registrar Troca</span>
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    name="brinco"
                    value={formData.brinco}
                    onChange={handleChange}
                    placeholder="ex: BR-12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Data de Nascimento</label>
                  <input
                    type="date"
                    name="birthDate"
                    value={formData.birthDate}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  />
                </div>

                <div>
                  <FormLabel required>Sexo</FormLabel>
                  <FieldBox required>
                    <select
                      name="sex"
                      value={formData.sex}
                      onChange={handleChange}
                      className={inputClassCompact}
                    >
                    <option value="">Selecione</option>
                    <option value="Macho">Macho</option>
                    <option value="Fêmea">Fêmea</option>
                  </select>
                  </FieldBox>
                </div>
              </div>
            </div>

            {/* Características */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase border-b pb-2">Características</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Raça</label>
                  <select
                    name="raca"
                    value={formData.raca}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  >
                    <option value="">Selecione</option>
                    <option value="Nelore">Nelore</option>
                    <option value="Nelore Mocho">Nelore Mocho</option>
                    <option value="Angus">Angus</option>
                    <option value="Senepol">Senepol</option>
                    <option value="Brahman">Brahman</option>
                    <option value="Girolando">Girolando</option>
                    <option value="Gir">Gir</option>
                    <option value="Holandês">Holandês</option>
                    <option value="Mestiço">Mestiço</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Peso Atual (kg)</label>
                  <input
                    type="number"
                    name="pesoAtual"
                    value={formData.pesoAtual}
                    onChange={handleChange}
                    placeholder="ex: 450"
                    min="0"
                    step="0.1"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Lote</label>
                  <select
                    name="loteId"
                    value={formData.loteId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  >
                    <option value="">Sem lote</option>
                    {lotes?.map(lote => (
                      <option key={lote.id} value={lote.id}>
                        {lote.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Categoria</label>
                  <select
                    name="categoria"
                    value={formData.categoria}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  >
                    <option value="">Selecione</option>
                    {(formData.sex ? getCategoriasPorSexo(formData.sex) : todasAsCategorias()).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Status */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase border-b pb-2">Status</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status do Animal</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="vendido">Vendido</option>
                    <option value="morto">Morto</option>
                    <option value="transferido">Transferido</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
              <textarea
                name="observacoes"
                value={formData.observacoes}
                onChange={handleChange}
                placeholder="Adicione observações sobre o animal..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
              />
            </div>

            {/* Botões */}
            <div className="flex gap-4 pt-6 border-t">
              <Button
                type="button"
                onClick={() => setLocation("/rebanho/lista-animais")}
                variant="outline"
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                style={{ backgroundColor: "#4ECDC4" }}
                className="text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
      {/* ─── Modal: Histórico de Brincos ──────────────────────────────────────────────────────────── */}
      <Dialog open={showHistoricoModal} onOpenChange={setShowHistoricoModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-[#4ECDC4]" />
              Histórico de Brincos
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {!historicoBrincos || historicoBrincos.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Tag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhuma troca de brinco registrada.</p>
                <button
                  type="button"
                  onClick={() => { setShowHistoricoModal(false); setShowRegistrarModal(true); }}
                  className="mt-3 text-xs text-[#4ECDC4] hover:underline"
                >
                  Registrar primeira troca
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {historicoBrincos.map((reg) => (
                  <div key={reg.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {reg.brincoAnterior && (
                          <>
                            <span className="text-xs font-mono bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-200">
                              {reg.brincoAnterior}
                            </span>
                            <span className="text-gray-400 text-xs">→</span>
                          </>
                        )}
                        <span className="text-xs font-mono bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-200">
                          {reg.brincoNovo}
                        </span>
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                          {MOTIVO_LABELS[reg.motivo] ?? reg.motivo}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-400">
                        <span>{reg.dataAlteracao}</span>
                        {reg.usuarioNome && <span>por {reg.usuarioNome}</span>}
                      </div>
                      {reg.observacoes && (
                        <p className="mt-1 text-xs text-gray-500 italic">{reg.observacoes}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deletarBrincoMutation.mutate({ id: reg.id })}
                      className="ml-2 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Remover registro"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-between items-center border-t pt-3">
              <button
                type="button"
                onClick={() => { setShowHistoricoModal(false); setShowRegistrarModal(true); }}
                className="text-xs text-[#4ECDC4] hover:underline flex items-center gap-1"
              >
                <Tag className="w-3.5 h-3.5" /> Registrar nova troca
              </button>
              <Button variant="outline" size="sm" onClick={() => setShowHistoricoModal(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Registrar Troca de Brinco ─────────────────────────────────────────────────── */}
      <Dialog open={showRegistrarModal} onOpenChange={setShowRegistrarModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#4ECDC4]" />
              Registrar Troca de Brinco
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Brinco Anterior</label>
                <input
                  type="text"
                  value={animal?.brinco ?? ""}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                  placeholder="(não informado)"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Brinco Novo *</label>
                <input
                  type="text"
                  value={formData.brinco}
                  readOnly
                  className="w-full px-3 py-2 border border-[#4ECDC4] rounded text-sm bg-green-50 font-medium text-green-800"
                  placeholder="Preencha o campo acima"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo *</label>
              <select
                value={novoRegistro.motivo}
                onChange={(e) => setNovoRegistro(prev => ({ ...prev, motivo: e.target.value as typeof prev.motivo }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
              >
                <option value="perda">Perda</option>
                <option value="danificado">Danificado</option>
                <option value="reidentificacao">Reidentificação</option>
                <option value="erro_cadastro">Erro de Cadastro</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data da Alteração *</label>
              <input
                type="date"
                value={novoRegistro.dataAlteracao}
                onChange={(e) => setNovoRegistro(prev => ({ ...prev, dataAlteracao: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
              <textarea
                value={novoRegistro.observacoes}
                onChange={(e) => setNovoRegistro(prev => ({ ...prev, observacoes: e.target.value }))}
                rows={2}
                placeholder="Detalhe o motivo da troca..."
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
              />
            </div>
            <div className="flex gap-3 pt-2 border-t">
              <Button variant="outline" className="flex-1" onClick={() => setShowRegistrarModal(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 text-white"
                style={{ backgroundColor: "#4ECDC4" }}
                disabled={!formData.brinco.trim() || registrarBrincoMutation.isPending}
                onClick={() => {
                  if (!formData.brinco.trim()) {
                    toast.error("Preencha o campo Brinco Novo antes de registrar.");
                    return;
                  }
                  registrarBrincoMutation.mutate({
                    animalId: animalId!,
                    brincoAnterior: animal?.brinco ?? null,
                    brincoNovo: formData.brinco.trim(),
                    motivo: novoRegistro.motivo,
                    observacoes: novoRegistro.observacoes.trim() || null,
                    dataAlteracao: novoRegistro.dataAlteracao,
                  });
                }}
              >
                {registrarBrincoMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Salvando...</>
                ) : (
                  <><Tag className="w-4 h-4 mr-1" /> Confirmar Troca</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
