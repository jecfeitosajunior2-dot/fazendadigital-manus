import React, { useState } from 'react';
import { useLocation } from 'wouter';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { FormLabel, FieldBox, inputClassCompact } from '@/components/FormFields';
import { cn } from '@/lib/utils';

export const NewAnimalPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [formData, setFormData] = useState({
    animalId: '',    // → nome
    earringId: '',   // → brinco
    sisbovId: '',    // informativo apenas
    birthDate: '',   // → dataNascimento
    sex: '',         // → sexo ("macho" | "femea")
    breedStandard: '', // → raca
    activity: '',    // informativo / categoria
    category: '',    // → categoria
    pesoAtual: '',   // → pesoAtual
    loteId: '',      // → loteId (number)
    notes: '',       // → observacoes
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load lots for the dropdown
  const { data: lotes } = trpc.lotes.list.useQuery();

  const createMutation = trpc.animais.create.useMutation({
    onSuccess: () => {
      toast.success('Animal cadastrado com sucesso!');
      utils.animais.list.invalidate();
      setLocation('/rebanho/lista-animais');
    },
    onError: (err) => {
      toast.error(`Erro ao cadastrar animal: ${err.message}`);
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.animalId.trim()) {
      newErrors.animalId = 'ID / Nome do animal é obrigatório';
    }
    if (!formData.birthDate) {
      newErrors.birthDate = 'Data de nascimento é obrigatória';
    }
    if (!formData.sex) {
      newErrors.sex = 'Sexo é obrigatório';
    }
    if (!formData.category) {
      newErrors.category = 'Categoria é obrigatória';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const sexoMapped = formData.sex === 'Macho' ? 'macho' : 'femea';

    createMutation.mutate({
      nome: formData.animalId.trim(),
      brinco: formData.earringId.trim() || undefined,
      raca: formData.breedStandard.trim() || undefined,
      sexo: sexoMapped as 'macho' | 'femea',
      dataNascimento: formData.birthDate || undefined,
      pesoAtual: formData.pesoAtual.trim() || undefined,
      loteId: formData.loteId ? parseInt(formData.loteId) : undefined,
      categoria: formData.category.trim() || undefined,
      observacoes: formData.notes.trim() || undefined,
    });
  };

  const isSubmitting = createMutation.isPending;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        <Button
          type="button"
          onClick={() => setLocation('/rebanho/lista-animais')}
          className="mb-6 bg-gray-400 hover:bg-gray-500 text-white"
          disabled={isSubmitting}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Lista de Animais
        </Button>

        <Card className="p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Novo Animal</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Identificação */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase border-b pb-2">Identificação</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>ID / Nome do Animal</FormLabel>
                  <FieldBox required>
                    <input
                      type="text"
                      name="animalId"
                      value={formData.animalId}
                      onChange={handleChange}
                      placeholder="ex: BOI-001 ou Touro Bravo"
                      className={cn(inputClassCompact, errors.animalId && "text-red-600")}
                    />
                  </FieldBox>
                  {errors.animalId && <p className="text-xs text-red-600 mt-1">{errors.animalId}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Brinco / Nº Brinco</label>
                  <input
                    type="text"
                    name="earringId"
                    value={formData.earringId}
                    onChange={handleChange}
                    placeholder="ex: BR-12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">SISBOV / Código Eletrônico</label>
                  <input
                    type="text"
                    name="sisbovId"
                    value={formData.sisbovId}
                    onChange={handleChange}
                    placeholder="ex: 076000000000001"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  />
                </div>

                <div>
                  <FormLabel required>Data de Nascimento</FormLabel>
                  <FieldBox required>
                    <input
                      type="date"
                      name="birthDate"
                      value={formData.birthDate}
                      onChange={handleChange}
                      className={inputClassCompact}
                    />
                  </FieldBox>
                  {errors.birthDate && <p className="text-xs text-red-600 mt-1">{errors.birthDate}</p>}
                </div>
              </div>
            </div>

            {/* Características */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase border-b pb-2">Características</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  {errors.sex && <p className="text-xs text-red-600 mt-1">{errors.sex}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Raça / Padrão</label>
                  <select
                    name="breedStandard"
                    value={formData.breedStandard}
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
              </div>
            </div>

            {/* Classificação */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase border-b pb-2">Classificação</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>Categoria</FormLabel>
                  <FieldBox required>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className={inputClassCompact}
                    >
                    <option value="">Selecione</option>
                    {formData.sex === 'Macho' && (
                      <>
                        <option value="Touro">Touro</option>
                        <option value="Boi">Boi</option>
                        <option value="Bezerro">Bezerro</option>
                        <option value="Garrote">Garrote</option>
                      </>
                    )}
                    {formData.sex === 'Fêmea' && (
                      <>
                        <option value="Vaca">Vaca</option>
                        <option value="Novilha">Novilha</option>
                        <option value="Bezerra">Bezerra</option>
                        <option value="Vaca Prenhe">Vaca Prenhe</option>
                      </>
                    )}
                    {!formData.sex && (
                      <>
                        <option value="Touro">Touro</option>
                        <option value="Boi">Boi</option>
                        <option value="Vaca">Vaca</option>
                        <option value="Novilha">Novilha</option>
                        <option value="Bezerro">Bezerro</option>
                        <option value="Bezerra">Bezerra</option>
                      </>
                    )}
                  </select>
                  </FieldBox>
                  {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Atividade</label>
                  <select
                    name="activity"
                    value={formData.activity}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
                  >
                    <option value="">Selecione</option>
                    <option value="Cria">Cria</option>
                    <option value="Recria">Recria</option>
                    <option value="Engorda">Engorda</option>
                    <option value="Reprodutor">Reprodutor</option>
                    <option value="Leite">Leite</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Adicione observações sobre o animal..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
              />
            </div>

            {/* Botões */}
            <div className="flex gap-3 justify-end pt-6 border-t">
              <Button
                type="button"
                onClick={() => setLocation('/rebanho/lista-animais')}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800"
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="text-white"
                style={{ backgroundColor: '#4ECDC4' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Salvar Animal
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
};
