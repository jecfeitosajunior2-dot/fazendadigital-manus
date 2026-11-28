import { useRef, useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { isArquivoCoordenadasValido, readKmlFromFile } from '@/lib/readKmlFile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileUp,
  Loader2,
  RotateCcw,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const FD_PRIMARY = '#4ECDC4';

const letraInter = { fontFamily: "Inter, sans-serif" } as const;
const letraTitulo = { ...letraInter, fontSize: "24px", fontWeight: 600 } as const;
const letraSecao = { ...letraInter, fontSize: "16px", fontWeight: 600 } as const;
const letraCorpo = { ...letraInter, fontSize: "14px", fontWeight: 400 } as const;
const letraRotulo = { ...letraInter, fontSize: "13px", fontWeight: 500 } as const;
const letraNumero = { ...letraInter, fontSize: "24px", fontWeight: 600 } as const;
const btnLetra = { ...letraInter, fontSize: "14px", fontWeight: 600 } as const;

const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-6 py-2 rounded-full uppercase tracking-wide text-gray-800 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition';

const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 px-6 py-2 rounded-full uppercase tracking-wide bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition';

const metricCard = 'border border-gray-200 rounded shadow-sm bg-white p-3 text-center';

type Etapa = 'upload' | 'resultado';

type ResultadoImportacao = {
  importados: number;
  ignorados: string[];
  totalNoArquivo: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  fazendaId: number;
  onImportado?: () => void;
};

export function ImportarCoordenadasModal({ open, onClose, fazendaId, onImportado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>('upload');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  const utils = trpc.useUtils();

  const resetState = useCallback(() => {
    setEtapa('upload');
    setArquivo(null);
    setIsDragging(false);
    setResultado(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const importarMutation = trpc.pastos.importarCoordenadas.useMutation({
    onSuccess: (res) => {
      setResultado(res);
      setEtapa('resultado');
      utils.pastos.listByFazenda.invalidate({ fazendaId });
      utils.pastos.list.invalidate();
      utils.pastos.listWithDetails.invalidate();
      onImportado?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileChange = (file: File | null) => {
    if (!file) {
      setArquivo(null);
      return;
    }
    if (!isArquivoCoordenadasValido(file.name)) {
      toast.error('Formato inválido. Utilize arquivos .kml ou .kmz');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setArquivo(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChange(file);
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

  const renderUpload = () => (
    <div className="space-y-4">
      <p
        className="rounded border border-amber-200 bg-amber-50 px-4 py-3 leading-relaxed text-amber-950"
        style={letraCorpo}
      >
        <span className="font-semibold">Crie os pastos antes de importar.</span> O arquivo não cria pasto
        novo: ele só desenha o contorno no pasto que já tem o mesmo nome.
      </p>
      <div>
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                isDragging
                  ? 'border-[#4ECDC4] bg-[#4ECDC4]/5'
                  : arquivo
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-gray-300 hover:border-[#4ECDC4] hover:bg-[#4ECDC4]/5',
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {arquivo ? (
                <div className="flex flex-col items-center gap-2">
                  <FileUp className="w-10 h-10 text-emerald-600" />
                  <p className="text-gray-800" style={{ ...letraCorpo, fontWeight: 600 }}>{arquivo.name}</p>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setArquivo(null);
                      if (inputRef.current) inputRef.current.value = '';
                    }}
                    className="text-gray-500 hover:text-red-500 underline mt-1"
                    style={letraRotulo}
                  >
                    Remover arquivo
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-10 h-10 text-gray-400" />
                  <p className="text-gray-600" style={letraCorpo}>
                    <span className="font-semibold text-[#4ECDC4]">Clique para selecionar</span> ou arraste o
                    arquivo aqui
                  </p>
                  <p className="text-gray-400" style={letraRotulo}>KML ou KMZ</p>
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".kml,.kmz"
              className="hidden"
              onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
            />
      </div>

      <div className="flex flex-wrap justify-end gap-3 pt-1">
        <button type="button" onClick={handleClose} className={btnSecondary} style={btnLetra}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleImportar}
          disabled={!arquivo || importarMutation.isPending}
          className={btnPrimary}
          style={{ ...btnLetra, backgroundColor: FD_PRIMARY }}
        >
          {importarMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {importarMutation.isPending ? 'Importando...' : 'Importar coordenadas'}
        </button>
      </div>
    </div>
  );

  const renderResultado = () => {
    if (!resultado) return null;

    const sucesso = resultado.importados > 0 && resultado.ignorados.length === 0;
    const parcial = resultado.importados > 0 && resultado.ignorados.length > 0;
    const falha = resultado.importados === 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center py-3">
          {sucesso ? (
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-2" />
          ) : parcial ? (
            <AlertTriangle className="w-14 h-14 text-amber-500 mb-2" />
          ) : (
            <AlertTriangle className="w-14 h-14 text-red-500 mb-2" />
          )}
          <h3
            className="text-gray-900 text-center"
            style={letraSecao}
          >
            {sucesso
              ? 'Importação concluída!'
              : parcial
                ? 'Importação concluída com avisos'
                : 'Nenhuma coordenada importada'}
          </h3>
          {falha && (
            <p className="text-gray-500 mt-1 text-center max-w-sm" style={letraCorpo}>
              Nenhum nome do arquivo é igual a uma subdivisão desta fazenda. Os nomes encontrados estão na lista abaixo.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className={metricCard}>
            <p className="text-gray-800 tabular-nums" style={letraNumero}>{resultado.totalNoArquivo}</p>
            <p className="text-gray-500 mt-0.5" style={letraRotulo}>No arquivo</p>
          </div>
          <div className={metricCard}>
            <p className="text-emerald-700 tabular-nums" style={letraNumero}>{resultado.importados}</p>
            <p className="text-gray-500 mt-0.5" style={letraRotulo}>Atualizadas</p>
          </div>
          <div className={metricCard}>
            <p
              className={cn(
                'tabular-nums',
                resultado.ignorados.length > 0 ? 'text-amber-700' : 'text-emerald-700',
              )}
              style={letraNumero}
            >
              {resultado.ignorados.length}
            </p>
            <p className="text-gray-500 mt-0.5" style={letraRotulo}>Ignorados</p>
          </div>
        </div>

        {resultado.ignorados.length > 0 && (
          <div>
            <p className="text-amber-800 mb-2" style={letraRotulo}>
              Nomes que vieram no arquivo
            </p>
            <div className="max-h-40 overflow-y-auto border border-amber-200 rounded-lg divide-y divide-amber-100">
              {resultado.ignorados.map(nome => (
                <div key={nome} className="px-3 py-2 bg-amber-50/80">
                  <p className="text-amber-900" style={letraCorpo}>{nome}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              setResultado(null);
              setArquivo(null);
              setEtapa('upload');
              if (inputRef.current) inputRef.current.value = '';
            }}
            className={btnSecondary}
            style={btnLetra}
          >
            <RotateCcw className="w-4 h-4" />
            Nova importação
          </button>
          <button
            type="button"
            onClick={handleClose}
            className={cn(btnPrimary, 'flex-1 sm:flex-none')}
            style={{ ...btnLetra, backgroundColor: FD_PRIMARY }}
          >
            <MapPin className="w-4 h-4" />
            Fechar
          </button>
        </div>
      </div>
    );
  };

  const titulos: Record<Etapa, { title: string; desc: string }> = {
    upload: {
      title: 'Importar Coordenadas',
      desc: '',
    },
    resultado: {
      title: 'Relatório de Importação',
      desc: 'Resumo do processamento realizado.',
    },
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 py-4 border-b border-gray-100 shrink-0 text-left space-y-1">
          <DialogTitle
            className="text-gray-900"
            style={letraTitulo}
          >
            {titulos[etapa].title}
          </DialogTitle>
          {titulos[etapa].desc ? (
            <DialogDescription className="text-gray-500" style={letraCorpo}>
              {titulos[etapa].desc}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          {etapa === 'upload' && renderUpload()}
          {etapa === 'resultado' && renderResultado()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ImportarCoordenadasModal;
