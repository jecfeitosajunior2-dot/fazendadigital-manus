export type LatLng = { lat: number; lng: number };

/** Converte o JSON salvo em `pastos.coordenadas` para pontos do Google Maps (lat/lng). */
export function parseCoordenadasPasto(coordenadas: string | null | undefined): LatLng[] | null {
  if (!coordenadas?.trim()) return null;

  try {
    const dados = JSON.parse(coordenadas) as { coordinates?: string };
    const raw = dados.coordinates?.trim();
    if (!raw) return null;

    const path: LatLng[] = [];
    for (const token of raw.split(/\s+/)) {
      if (!token) continue;
      const [lngRaw, latRaw] = token.split(",");
      const lng = Number(lngRaw);
      const lat = Number(latRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      path.push({ lat, lng });
    }

    return path.length >= 2 ? path : null;
  } catch {
    return null;
  }
}

export function parseFazendaCentro(latitude?: string | null, longitude?: string | null): LatLng | null {
  const lat = Number(String(latitude ?? "").trim().replace(",", "."));
  const lng = Number(String(longitude ?? "").trim().replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
