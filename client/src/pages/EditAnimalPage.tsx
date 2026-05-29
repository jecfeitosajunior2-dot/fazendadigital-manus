import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, AlertCircle } from "lucide-react";
import AppLayout from "@/components/AppLayout";

export function EditAnimalPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Get animal ID from URL query param
  const searchParams = new URLSearchParams(window.location.search);
  const animalIdParam = searchParams.get("id");
  const animalId = animalIdParam ? parseInt(animalIdParam) : null;

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
          className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm"
          disabled={isSubmitting}
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Lista de Animais
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nome / ID *</label>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    placeholder="ex: BOI-001"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Brinco</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sexo *</label>
                  <select
                    name="sex"
                    value={formData.sex}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  >
                    <option value="">Selecione</option>
                    <option value="Macho">Macho</option>
                    <option value="Fêmea">Fêmea</option>
                  </select>
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
                    <option value="Touro">Touro</option>
                    <option value="Boi">Boi</option>
                    <option value="Vaca">Vaca</option>
                    <option value="Novilha">Novilha</option>
                    <option value="Bezerro">Bezerro</option>
                    <option value="Bezerra">Bezerra</option>
                    <option value="Vaca Prenhe">Vaca Prenhe</option>
                    <option value="Garrote">Garrote</option>
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
    </AppLayout>
  );
}
