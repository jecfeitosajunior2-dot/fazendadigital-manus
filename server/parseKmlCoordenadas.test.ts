import { describe, it, expect } from 'vitest';
import {
  extrairCoordenadasKml,
  mapaCoordenadasPorNome,
  normalizarNomeSubdivisao,
} from '../shared/parseKmlCoordenadas';

const KML_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Pasto A</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>-47.1,-15.2,0 -47.2,-15.3,0 -47.1,-15.2,0</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>Pasto B</name>
      <Polygon>
        <coordinates>-48.0,-16.0,0 -48.1,-16.1,0</coordinates>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>Pasto A</name>
      <Polygon>
        <coordinates>-50.0,-17.0,0 -50.1,-17.1,0</coordinates>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

describe('parseKmlCoordenadas', () => {
  it('extrai placemarks com nome e coordenadas', () => {
    const lista = extrairCoordenadasKml(KML_SAMPLE);
    expect(lista).toHaveLength(3);
    expect(lista[0].nome).toBe('Pasto A');
    expect(lista[0].coordinates).toContain('-47.1,-15.2,0');
  });

  it('último placemark com mesmo nome prevalece no mapa', () => {
    const mapa = mapaCoordenadasPorNome(extrairCoordenadasKml(KML_SAMPLE));
    expect(mapa.get('pasto a')).toContain('-50.0,-17.0,0');
  });

  it('normaliza nomes sem acento e case-insensitive', () => {
    expect(normalizarNomeSubdivisao('  Pátio São ')).toBe('patio sao');
  });
});
