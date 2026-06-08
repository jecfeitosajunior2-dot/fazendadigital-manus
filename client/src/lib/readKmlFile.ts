import JSZip from 'jszip';

const EXT_KML = /\.kml$/i;
const EXT_KMZ = /\.kmz$/i;

export function isArquivoCoordenadasValido(nome: string): boolean {
  return EXT_KML.test(nome) || EXT_KMZ.test(nome);
}

/** Lê conteúdo KML de arquivo .kml ou .kmz (extrai doc.kml ou primeiro .kml do zip). */
export async function readKmlFromFile(file: File): Promise<string> {
  const nome = file.name.toLowerCase();

  if (EXT_KML.test(nome)) {
    const texto = await file.text();
    if (!texto.trim()) throw new Error('Arquivo KML vazio');
    return texto;
  }

  if (EXT_KMZ.test(nome)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entradas = Object.keys(zip.files).filter(
      n => !zip.files[n].dir && n.toLowerCase().endsWith('.kml'),
    );
    if (entradas.length === 0) {
      throw new Error('Arquivo KMZ não contém nenhum arquivo KML');
    }
    const preferido = entradas.find(n => /doc\.kml$/i.test(n)) ?? entradas[0];
    const kml = await zip.file(preferido)!.async('string');
    if (!kml.trim()) throw new Error('Arquivo KML dentro do KMZ está vazio');
    return kml;
  }

  throw new Error('Formato inválido. Utilize arquivos .kml ou .kmz');
}
