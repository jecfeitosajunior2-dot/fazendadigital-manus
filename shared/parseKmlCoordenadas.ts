/**
 * Extrai coordenadas de Placemarks em arquivos KML (iRancho).
 * Suporta Polygon, LineString e MultiGeometry.
 */

export type PlacemarkCoordenadas = {
  nome: string;
  coordinates: string;
};

export function normalizarNomeSubdivisao(nome: string): string {
  return nome.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Extrai pares nome → coordenadas; nomes duplicados no arquivo: o último prevalece. */
export function extrairCoordenadasKml(kml: string): PlacemarkCoordenadas[] {
  const lista: PlacemarkCoordenadas[] = [];
  const placemarkRegex = /<Placemark[\s>][\s\S]*?<\/Placemark>/gi;
  let bloco: RegExpExecArray | null;

  while ((bloco = placemarkRegex.exec(kml)) !== null) {
    const trecho = bloco[0];
    const nome = extrairTag(trecho, 'name');
    const coordinates = extrairCoordinates(trecho);
    if (nome && coordinates) {
      lista.push({ nome, coordinates });
    }
  }

  return lista;
}

/** Mapa nome normalizado → coordenadas (último prevalece em duplicatas). */
export function mapaCoordenadasPorNome(placemarks: PlacemarkCoordenadas[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const p of placemarks) {
    mapa.set(normalizarNomeSubdivisao(p.nome), p.coordinates);
  }
  return mapa;
}

function extrairTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return null;
  return decodeXmlEntities(match[1].trim());
}

function extrairCoordinates(xml: string): string | null {
  const matches = [...xml.matchAll(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi)];
  if (matches.length === 0) return null;

  const partes = matches
    .map(m => m[1].trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  return partes.length > 0 ? partes.join(' ') : null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}
