import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { animalsList } from "@/lib/data";

export function EditAnimalPage() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const animalId = searchParams.get("id");
  
  const animal = animalsList.find((a) => a.animalId === animalId);
  
  const [formData, setFormData] = useState({
    animalId: animal?.animalId || "",
    tagId: "",
    sisboxId: "",
    birthDate: animal?.birthDate || "",
    sex: animal?.sex || "",
    breed: animal?.breed || "",
    activity: animal?.activity || "",
    category: "",
    farm: "",
    subdivision: animal?.lot || "",
    tags: "",
    notes: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    if (!formData.animalId || !formData.birthDate || !formData.sex || !formData.breed) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }
    toast.success("Animal atualizado com sucesso!");
    setTimeout(() => setLocation("/rebanho/lista-animais"), 1500);
  };

  if (!animal) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Animal não encontrado</h2>
          <Button onClick={() => setLocation("/rebanho/lista-animais")}>
            Voltar para Lista de Animais
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 bg-gray-50">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
        <button
          onClick={() => setLocation("/rebanho/lista-animais")}
          className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-800"
        >
          ← Voltar para Lista de Animais
        </button>

        <h1 className="text-3xl font-bold text-gray-800 mb-8">Editar Animal</h1>

        <div className="space-y-6">
          {/* Identificação */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Identificação</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ID do Animal *</label>
                <Input
                  type="text"
                  name="animalId"
                  value={formData.animalId}
                  onChange={handleChange}
                  placeholder="ex: ABC123456"
                  disabled
                  className="bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ID Eletrônico</label>
                <Input
                  type="text"
                  value={animal?.electronicId || ""}
                  disabled
                  className="bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ID Manejo</label>
                <Input
                  type="text"
                  value={animal?.managementId || ""}
                  disabled
                  className="bg-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Dados Básicos */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Dados Básicos</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Data de Nascimento *</label>
                <Input
                  type="date"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sexo *</label>
                <Select value={formData.sex} onValueChange={(value) => handleSelectChange("sex", value)}>
                  <option value="">Selecione</option>
                  <option value="Macho">Macho</option>
                  <option value="Fêmea">Fêmea</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Padrão de Raça *</label>
                <Select value={formData.breed} onValueChange={(value) => handleSelectChange("breed", value)}>
                  <option value="">Selecione</option>
                  <option value="Nelore">Nelore</option>
                  <option value="Nelore Mocho">Nelore Mocho</option>
                  <option value="Senepol">Senepol</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Atividade *</label>
                <Select value={formData.activity} onValueChange={(value) => handleSelectChange("activity", value)}>
                  <option value="">Selecione</option>
                  <option value="Cria">Cria</option>
                  <option value="Recria">Recria</option>
                  <option value="Engorda">Engorda</option>
                  <option value="Reprodutor">Reprodutor</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Classificação */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Classificação</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Categoria *</label>
                <Select value={formData.category} onValueChange={(value) => handleSelectChange("category", value)}>
                  <option value="">Selecione</option>
                  <option value="Cria">Cria</option>
                  <option value="Recria">Recria</option>
                  <option value="Engorda">Engorda</option>
                  <option value="Reprodutor">Reprodutor</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fazenda</label>
                <Select value={formData.farm} onValueChange={(value) => handleSelectChange("farm", value)}>
                  <option value="">Selecione</option>
                  <option value="Fazenda Fazenda Digital">Fazenda Fazenda Digital</option>
                  <option value="Fazenda Alma Viva">Fazenda Alma Viva</option>
                  <option value="Fazenda Rancho 2">Fazenda Rancho 2</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subdivisão</label>
                <Select value={formData.subdivision} onValueChange={(value) => handleSelectChange("subdivision", value)}>
                  <option value="">Selecione</option>
                  <option value="Lote Vacas">Lote Vacas</option>
                  <option value="Lote Bezerros (as)">Lote Bezerros (as)</option>
                  <option value="Lote Engorda">Lote Engorda</option>
                  <option value="Lote Recria">Lote Recria</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                <Input
                  type="text"
                  name="tags"
                  value={formData.tags}
                  onChange={handleChange}
                  placeholder="ex: Premium, Reprodutor"
                />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
            <Textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Adicione observações sobre o animal..."
              rows={4}
            />
          </div>

          {/* Botões */}
          <div className="flex gap-4 pt-6">
            <Button
              onClick={() => setLocation("/rebanho/lista-animais")}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              style={{ backgroundColor: "#2D6A4F" }}
              className="text-white"
            >
              Salvar Alterações
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
