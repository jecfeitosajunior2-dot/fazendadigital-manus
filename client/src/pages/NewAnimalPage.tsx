import React, { useState } from 'react';
import { useLocation } from 'wouter';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';

export const NewAnimalPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    animalId: '',
    earringId: '',
    sisbovId: '',
    birthDate: '',
    sex: '',
    breedStandard: '',
    activity: '',
    category: '',
    farm: '',
    subdivision: '',
    tags: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.animalId.trim()) {
      newErrors.animalId = 'ID do animal é obrigatório';
    }
    if (!formData.birthDate) {
      newErrors.birthDate = 'Data de nascimento é obrigatória';
    }
    if (!formData.sex) {
      newErrors.sex = 'Sexo é obrigatório';
    }
    if (!formData.activity) {
      newErrors.activity = 'Atividade é obrigatória';
    }
    if (!formData.category) {
      newErrors.category = 'Categoria é obrigatória';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      setSuccess(true);
      // Reset form after 2 seconds
      setTimeout(() => {
        setFormData({
          animalId: '',
          earringId: '',
          sisbovId: '',
          birthDate: '',
          sex: '',
          breedStandard: '',
          activity: '',
          category: '',
          farm: '',
          subdivision: '',
          tags: '',
          notes: '',
        });
        setSuccess(false);
        setLocation('/rebanho/lista-animais');
      }, 2000);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        <Button
          onClick={() => setLocation('/rebanho/lista-animais')}
          className="mb-6 bg-gray-400 hover:bg-gray-500 text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Lista de Animais
        </Button>

        <Card className="p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Novo Animal</h1>

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-800">Animal cadastrado com sucesso!</h3>
                <p className="text-sm text-green-700">Redirecionando para lista de animais...</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ID Section */}
            <div className="border-b pb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase">Identificação</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ID do Animal *
                  </label>
                  <input
                    type="text"
                    name="animalId"
                    value={formData.animalId}
                    onChange={handleChange}
                    placeholder="ex: ABC123456"
                    className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B] ${
                      errors.animalId ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.animalId && (
                    <p className="text-xs text-red-600 mt-1">{errors.animalId}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ID da Brinco
                  </label>
                  <input
                    type="text"
                    name="earringId"
                    value={formData.earringId}
                    onChange={handleChange}
                    placeholder="ex: 123456"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ID SISBOV
                  </label>
                  <input
                    type="text"
                    name="sisbovId"
                    value={formData.sisbovId}
                    onChange={handleChange}
                    placeholder="ex: 65487"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B]"
                  />
                </div>
              </div>
            </div>

            {/* Birth and Sex Section */}
            <div className="border-b pb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase">Dados Básicos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data de Nascimento *
                  </label>
                  <input
                    type="date"
                    name="birthDate"
                    value={formData.birthDate}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B] ${
                      errors.birthDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.birthDate && (
                    <p className="text-xs text-red-600 mt-1">{errors.birthDate}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sexo *
                  </label>
                  <select
                    name="sex"
                    value={formData.sex}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B] ${
                      errors.sex ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Selecione</option>
                    <option value="Macho">Macho</option>
                    <option value="Fêmea">Fêmea</option>
                  </select>
                  {errors.sex && (
                    <p className="text-xs text-red-600 mt-1">{errors.sex}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Padrão de Raça
                  </label>
                  <select
                    name="breedStandard"
                    value={formData.breedStandard}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B]"
                  >
                    <option value="">Selecione</option>
                    <option value="Nelore">Nelore</option>
                    <option value="Nelore Mocho">Nelore Mocho</option>
                    <option value="Senepol">Senepol</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Atividade *
                  </label>
                  <select
                    name="activity"
                    value={formData.activity}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B] ${
                      errors.activity ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Selecione</option>
                    <option value="Cria">Cria</option>
                    <option value="Recria">Recria</option>
                    <option value="Engorda">Engorda</option>
                    <option value="Reprodutor">Reprodutor</option>
                  </select>
                  {errors.activity && (
                    <p className="text-xs text-red-600 mt-1">{errors.activity}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Category and Farm Section */}
            <div className="border-b pb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase">Classificação</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Categoria *
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B] ${
                      errors.category ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Selecione o sexo primeiro</option>
                    {formData.sex === 'Macho' && (
                      <>
                        <option value="Touro">Touro</option>
                        <option value="Boi">Boi</option>
                      </>
                    )}
                    {formData.sex === 'Fêmea' && (
                      <>
                        <option value="Vaca">Vaca</option>
                        <option value="Novilha">Novilha</option>
                      </>
                    )}
                  </select>
                  {errors.category && (
                    <p className="text-xs text-red-600 mt-1">{errors.category}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fazenda
                  </label>
                  <select
                    name="farm"
                    value={formData.farm}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B]"
                  >
                    <option value="">Selecione</option>
                    <option value="Fazenda iRancho">Fazenda iRancho</option>
                    <option value="Fazenda Alma Viva">Fazenda Alma Viva</option>
                    <option value="Fazenda Rancho 2">Fazenda Rancho 2</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subdivisão
                  </label>
                  <select
                    name="subdivision"
                    value={formData.subdivision}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B]"
                  >
                    <option value="">Selecione</option>
                    <option value="Lote Vacas">Lote Vacas</option>
                    <option value="Lote Bezerros (as)">Lote Bezerros (as)</option>
                    <option value="Lote Engorda">Lote Engorda</option>
                    <option value="Lote Recria">Lote Recria</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tags
                  </label>
                  <input
                    type="text"
                    name="tags"
                    value={formData.tags}
                    onChange={handleChange}
                    placeholder="ex: Premium, Reprodutor"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B]"
                  />
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Observações
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Adicione observações sobre o animal..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#94B40B]"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-6 border-t">
              <Button
                type="button"
                onClick={() => setLocation('/rebanho/lista-animais')}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="text-white"
                style={{ backgroundColor: '#94B40B' }}
              >
                Salvar Animal
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
};
