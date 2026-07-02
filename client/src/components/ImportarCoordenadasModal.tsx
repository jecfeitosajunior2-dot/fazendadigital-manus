import { useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { isArquivoCoordenadasValido, readKmlFromFile } from '@/lib/readKmlFile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FD_PRIMARY } from '@/components/FormFields';

type Props = {
  open: boolean;
  onClose: () => void;
  fazendaId: number;
  onImportado?: () => void;
};

export function ImportarCoordenadasModal({ open, onClose, fazendaId, onImportado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');

  const utils = trpc.useUtils();

  const importarMutation = trpc.pastos.importarCoordenadas.useMutation({
    onSuccess: (res) => {
      if (res.importados === 0) {
        toast.warning(
          res.ignorados.length > 0
            ? `Nenhuma subdivisão correspondente encontrada. ${res.ignorados.length} nome(s) ignorado(s).`
            : 'Nenhuma coordenada importada. Verifique se as subdivisões estão cadastradas.',
        );
      } else {
        const extra = res.ignorados.length > 0
          ? ` ${res.ignorados.length} nome(s) do arquivo não possuem subdivisão cadastrada.`
          : '';
        toast.success(`${res.importados} subdivisão(ões) atualizada(s) com coordenadas.${extra}`);
      }
      utils.pastos.listByFazenda.invalidate({ fazendaId });
      utils.pastos.list.invalidate();
      utils.pastos.listWithDetails.invalidate();
      onImportado?.();
      handleClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleClose = () => {
    setArquivo(null);
    setNomeArquivo('');
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  };

  const handleFileChange = (file: File | null) => {
    if (!file) {
      setArquivo(null);
      setNomeArquivo('');
      return;
    }
    if (!isArquivoCoordenadasValido(file.name)) {
      toast.error('Formato inválido. Utilize arquivos .kml ou .kmz');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setArquivo(file);
    setNomeArquivo(file.name);
  };

  const handleImportar = async () => {
    if (!arquivo) {
      toast.error('Selecione um arquivo KML ou KMZ');
      return;
    }
    try {
      const kmlContent = await readKmlFromFile(arquivo);
      importarMutation.mutate({ fazendaId, kmlContent });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao ler arquivo');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-100">
          <DialogTitle className="text-[15px] font-semibold text-gray-800">
            Importar Coordenadas
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          <div className="text-[12px] text-gray-700 leading-relaxed">
            <p className="font-semibold text-gray-800 mb-2">Instruções:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Os formatos aceitos para importação são <strong>.kml</strong> ou <strong>.kmz</strong>;</li>
              <li>Antes de importar, cadastre as subdivisões da fazenda;</li>
              <li>O arquivo deve conter o contorno de cada subdivisão, como pastos, piquetes, currais, reservas ou áreas de manejo;</li>
              <li>Os nomes no arquivo devem corresponder ao <strong>nome</strong> ou à <strong>sigla</strong> das subdivisões cadastradas;</li>
              <li>Se houver mais de uma coordenada com o mesmo nome, o sistema manterá apenas a última encontrada;</li>
              <li>Após a importação, as coordenadas serão vinculadas às subdivisões correspondentes.</li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] text-gray-700 mb-2">
              Busque um arquivo KML ou KMZ em seu computador.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="px-4 py-1.5 rounded border border-gray-300 bg-[#F5F5F5] text-[12px] text-gray-700 hover:bg-gray-100"
              >
                Escolher Arquivo
              </button>
              <span className="text-[12px] text-gray-500">
                {nomeArquivo || 'Nenhum arquivo escolhido'}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".kml,.kmz"
                className="hidden"
                onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={importarMutation.isPending}
            className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleImportar}
            disabled={!arquivo || importarMutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white disabled:opacity-50 hover:brightness-95 transition"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <span className="material-icons text-[16px]">vertical_align_bottom</span>
            {importarMutation.isPending ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ImportarCoordenadasModal;
