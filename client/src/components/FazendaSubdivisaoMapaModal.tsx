import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadMapScript } from "@/components/Map";
import { parseCoordenadasPasto, parseFazendaCentro, type LatLng } from "@/lib/parseCoordenadasPasto";

const FD_PRIMARY = "#4ECDC4";
const FD_PRIMARY_DARK = "#2D8A82";

export type SubdivisaoMapaItem = {
  id: number;
  nome: string;
  sigla?: string | null;
  coordenadas?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  fazendaNome: string;
  fazendaLatitude?: string | null;
  fazendaLongitude?: string | null;
  subdivisoes: SubdivisaoMapaItem[];
  pastoDestaqueId: number;
  pastoDestaqueNome: string;
};

type OverlayEntry = {
  id: number;
  nome: string;
  path: LatLng[];
  overlay: google.maps.Polygon | google.maps.Polyline;
};

function desenharContorno(
  map: google.maps.Map,
  path: LatLng[],
  destacado: boolean,
): google.maps.Polygon | google.maps.Polyline {
  const opcoesBase = {
    map,
    path,
    clickable: false,
  };

  if (path.length >= 3) {
    return new google.maps.Polygon({
      ...opcoesBase,
      fillColor: destacado ? FD_PRIMARY : "#94A3B8",
      fillOpacity: destacado ? 0.42 : 0.18,
      strokeColor: destacado ? FD_PRIMARY_DARK : "#64748B",
      strokeOpacity: destacado ? 1 : 0.7,
      strokeWeight: destacado ? 3 : 1.5,
      zIndex: destacado ? 2 : 1,
    });
  }

  return new google.maps.Polyline({
    ...opcoesBase,
    strokeColor: destacado ? FD_PRIMARY_DARK : "#64748B",
    strokeOpacity: destacado ? 1 : 0.7,
    strokeWeight: destacado ? 3 : 1.5,
    zIndex: destacado ? 2 : 1,
  });
}

export function FazendaSubdivisaoMapaModal({
  open,
  onClose,
  fazendaNome,
  fazendaLatitude,
  fazendaLongitude,
  subdivisoes,
  pastoDestaqueId,
  pastoDestaqueNome,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<OverlayEntry[]>([]);
  const [mapaErro, setMapaErro] = useState<string | null>(null);
  const [mapaCarregando, setMapaCarregando] = useState(false);

  const subdivisoesComMapa = subdivisoes
    .map(s => ({ ...s, path: parseCoordenadasPasto(s.coordenadas) }))
    .filter((s): s is SubdivisaoMapaItem & { path: LatLng[] } => s.path != null);

  const outrasComMapa = subdivisoesComMapa.filter(s => s.id !== pastoDestaqueId).length;

  useEffect(() => {
    if (!open) return;

    let ativo = true;
    setMapaErro(null);
    setMapaCarregando(true);

    const init = async () => {
      try {
        if (!import.meta.env.VITE_FRONTEND_FORGE_API_KEY) {
          throw new Error("Chave do Google Maps não configurada no ambiente.");
        }

        await loadMapScript();
        if (!ativo || !mapContainerRef.current || !window.google?.maps) return;

        overlaysRef.current.forEach(entry => {
          entry.overlay.setMap(null);
        });
        overlaysRef.current = [];

        const centroFazenda = parseFazendaCentro(fazendaLatitude, fazendaLongitude);
        const centroDestaque = subdivisoesComMapa.find(s => s.id === pastoDestaqueId)?.path[0]
          ?? subdivisoesComMapa[0]?.path[0]
          ?? centroFazenda
          ?? { lat: -15.78, lng: -47.93 };

        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
            center: centroDestaque,
            zoom: 14,
            mapTypeId: "hybrid",
            mapTypeControl: true,
            fullscreenControl: true,
            zoomControl: true,
            streetViewControl: false,
            mapId: "FD_FAZENDA_MAP",
          });
        } else {
          mapRef.current.setCenter(centroDestaque);
        }

        const map = mapRef.current;
        const bounds = new window.google.maps.LatLngBounds();

        for (const subdivisao of subdivisoesComMapa) {
          const destacado = subdivisao.id === pastoDestaqueId;
          const overlay = desenharContorno(map, subdivisao.path, destacado);
          overlaysRef.current.push({
            id: subdivisao.id,
            nome: subdivisao.nome,
            path: subdivisao.path,
            overlay,
          });
          subdivisao.path.forEach(p => bounds.extend(p));
        }

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 48);
        } else if (ativo) {
          setMapaErro("Nenhuma coordenada válida encontrada para exibir no mapa.");
        }

        if (ativo) setMapaCarregando(false);
      } catch (error) {
        if (!ativo) return;
        setMapaCarregando(false);
        setMapaErro(error instanceof Error ? error.message : "Não foi possível carregar o mapa.");
      }
    };

    void init();

    return () => {
      ativo = false;
    };
  }, [
    open,
    fazendaLatitude,
    fazendaLongitude,
    pastoDestaqueId,
    subdivisoes,
  ]);

  useEffect(() => {
    if (open) return;
    overlaysRef.current.forEach(entry => entry.overlay.setMap(null));
    overlaysRef.current = [];
    setMapaErro(null);
    setMapaCarregando(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-100">
          <DialogTitle className="text-[15px] font-semibold text-gray-800">
            {fazendaNome} — {pastoDestaqueNome}
          </DialogTitle>
          <p className="text-[11px] text-gray-500 mt-1">
            Mapa geral da fazenda com a subdivisão selecionada em destaque.
          </p>
        </DialogHeader>

        <div className="px-6 py-4 space-y-3">
          <div className="relative rounded border border-gray-200 overflow-hidden bg-gray-50">
            <div ref={mapContainerRef} className="w-full h-[420px]" />

            {mapaCarregando && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] text-gray-600">
                Carregando mapa...
              </div>
            )}

            {mapaErro && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90 px-6 text-center text-[12px] text-red-600">
                {mapaErro}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm border-2" style={{ borderColor: FD_PRIMARY_DARK, backgroundColor: `${FD_PRIMARY}66` }} />
                {pastoDestaqueNome}
              </span>
              {outrasComMapa > 0 && (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm border border-slate-400 bg-slate-300/40" />
                  Outras subdivisões ({outrasComMapa})
                </span>
              )}
            </div>
            <span>{subdivisoesComMapa.length} subdivisão(ões) com coordenadas no mapa</span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 transition"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FazendaSubdivisaoMapaModal;
