import { useState, useRef } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ImageUploadProps {
  image: string | null;
  onImageChange: (file: File | null) => void;
}

function ImageUploadBox({ image, onImageChange }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageChange(file);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="relative flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg h-[140px] cursor-pointer hover:border-[#4ECDC4] hover:bg-gray-50/50 transition-colors"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />
      {image ? (
        <img
          src={image}
          alt="Preview"
          className="w-full h-full object-cover rounded-lg"
        />
      ) : (
        <>
          <span className="material-icons text-[28px] text-gray-300 mb-1">file_upload</span>
          <span className="text-[11px] text-gray-400">Selecione uma imagem</span>
        </>
      )}
    </div>
  );
}

export function CadastrarBenfeitoriaPage() {
  const [, setLocation] = useLocation();
  const { data: fazendaList = [] } = trpc.fazendas.list.useQuery();

  const [form, setForm] = useState({
    fazendaId: "",
    nome: "",
    ano: "",
    valor: "",
    vidaUtil: "",
    observacoes: "",
  });

  const [images, setImages] = useState<(string | null)[]>([null, null, null]);
  const [imageFiles, setImageFiles] = useState<(File | null)[]>([null, null, null]);

  const handleImageChange = (index: number) => (file: File | null) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const newImages = [...images];
        newImages[index] = e.target?.result as string;
        setImages(newImages);

        const newFiles = [...imageFiles];
        newFiles[index] = file;
        setImageFiles(newFiles);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.fazendaId) {
      toast.error("Selecione uma fazenda");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Nome da benfeitoria e obrigatorio");
      return;
    }
    if (!form.ano) {
      toast.error("Ano de construcao e obrigatorio");
      return;
    }

    // Simular cadastro (implementar API posteriormente)
    toast.success("Benfeitoria cadastrada com sucesso!");
    setLocation("/benfeitorias/lista-benfeitorias");
  };

  const handleVoltar = () => {
    setLocation("/benfeitorias/lista-benfeitorias");
  };

  return (
    <AppLayout>
      <div className="max-w-4xl">
        <h1 className="text-[18px] font-semibold text-gray-800 mb-4">Cadastro de benfeitoria</h1>

        <form onSubmit={handleSubmit}>
          {/* Upload de imagens */}
          <div className="mb-5">
            <p className="text-[12px] text-gray-600 mb-3">Selecione ate tres fotos para sua Benfeitoria</p>
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((index) => (
                <ImageUploadBox
                  key={index}
                  image={images[index]}
                  onImageChange={handleImageChange(index)}
                />
              ))}
            </div>
          </div>

          {/* Fazenda e Nome */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="text-[12px] font-medium text-gray-700 mb-1.5 block">
                Fazenda<span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.fazendaId}
                onValueChange={(value) => setForm(f => ({ ...f, fazendaId: value }))}
              >
                <SelectTrigger className="w-full h-10 text-[12px] bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Selecione uma fazenda" />
                </SelectTrigger>
                <SelectContent>
                  {fazendaList.map((fazenda: any) => (
                    <SelectItem key={fazenda.id} value={String(fazenda.id)}>
                      {fazenda.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] font-medium text-gray-700 mb-1.5 block">
                Nome<span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Digite um nome para a benfeitoria"
                className="h-10 text-[12px] bg-gray-50 border-gray-200"
              />
            </div>
          </div>

          {/* Ano, Valor, Vida util */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <Label className="text-[12px] font-medium text-gray-700 mb-1.5 block">
                Ano<span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-icons text-[18px] text-gray-400">calendar_today</span>
                <Input
                  type="number"
                  value={form.ano}
                  onChange={(e) => setForm(f => ({ ...f, ano: e.target.value }))}
                  placeholder="Selecione o ano de construcao"
                  className="h-10 text-[12px] bg-gray-50 border-gray-200 pl-10"
                  min="1900"
                  max={new Date().getFullYear()}
                />
              </div>
            </div>
            <div>
              <Label className="text-[12px] font-medium text-gray-700 mb-1.5 block">Valor</Label>
              <Input
                value={form.valor}
                onChange={(e) => setForm(f => ({ ...f, valor: e.target.value }))}
                placeholder="R$ 0,00"
                className="h-10 text-[12px] bg-gray-50 border-gray-200"
              />
            </div>
            <div>
              <Label className="text-[12px] font-medium text-gray-700 mb-1.5 block">Vida util</Label>
              <Input
                value={form.vidaUtil}
                onChange={(e) => setForm(f => ({ ...f, vidaUtil: e.target.value }))}
                placeholder="Ex: 10 anos"
                className="h-10 text-[12px] bg-gray-50 border-gray-200"
              />
            </div>
          </div>

          {/* Observacoes */}
          <div className="mb-6">
            <Label className="text-[12px] font-medium text-gray-700 mb-1.5 block">Observacoes</Label>
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm(f => ({ ...f, observacoes: e.target.value }))}
              placeholder="Descreva sua benfeitoria"
              rows={4}
              className="text-[12px] bg-gray-50 border-gray-200 resize-none"
            />
          </div>

          {/* Botoes */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleVoltar}
              className="px-6 py-2 rounded text-[12px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              VOLTAR
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded text-[12px] font-medium text-white transition-colors"
              style={{ backgroundColor: "#4ECDC4" }}
            >
              CADASTRAR
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

export default CadastrarBenfeitoriaPage;
