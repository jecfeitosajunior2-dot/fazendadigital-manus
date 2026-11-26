import { useLocation, useSearch } from "wouter";
import AppLayout from "@/components/AppLayout";
import { FazendaSubdivisoesPanel } from "@/components/FazendaSubdivisoesPanel";
import BenfeitoriasListPage from "@/pages/BenfeitoriasListPage";
import {
  FAZENDA_LISTA_PATH,
  SEM_VALOR_LISTA_FAZENDA,
  abaFichaDaBusca,
  areaTotalHa,
  caminhoFichaFazenda,
  corSituacaoFazenda,
  fazendaIdDaFicha,
  municipioUf,
  pastagemHaCadastrada,
  rotuloSituacaoFazenda,
  type AbaFichaFazenda,
} from "@/lib/fazendasListagem";
import { trpc } from "@/lib/trpc";

const fonte = "'Inter', sans-serif";
const titulo = { fontFamily: fonte, fontSize: "24px", fontWeight: 600, color: "#172033" };
const info = { fontFamily: fonte, fontSize: "14px", fontWeight: 400 };
const secao = { fontFamily: fonte, fontSize: "14px", fontWeight: 600, color: "#374151" };

type FazendaFicha = {
  id: number;
  nome: string;
  cidade?: string | null;
  estado?: string | null;
  area?: unknown;
  areaPastagem?: unknown;
  situacao?: string | null;
  responsavel?: string | null;
  atividadePrincipal?: string | null;
  endereco?: string | null;
};

export default function FazendaFichaPage() {
  const busca = useSearch();
  const [, setLocation] = useLocation();
  const id = fazendaIdDaFicha(busca);
  const aba = abaFichaDaBusca(busca);
  const fazendaQuery = trpc.fazendas.get.useQuery(
    { id: id ?? 0 },
    { enabled: id != null, retry: false },
  );
  const pastosQuery = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: id ?? 0 },
    { enabled: id != null },
  );
  const benfeitoriasQuery = trpc.benfeitorias.list.useQuery(undefined, { enabled: id != null });
  const fazenda = fazendaQuery.data as FazendaFicha | undefined;
  const qtdSub = pastosQuery.data?.length;
  const qtdBen = (benfeitoriasQuery.data ?? []).filter((item) => item.fazendaId === id).length;

  const voltar = () => setLocation(FAZENDA_LISTA_PATH);
  const irAba = (proxima: AbaFichaFazenda) => {
    if (id == null) return;
    setLocation(caminhoFichaFazenda(id, proxima));
  };

  return (
    <AppLayout>
      <button
        type="button"
        onClick={voltar}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span className="text-[13px]" style={{ fontFamily: fonte }}>Voltar</span>
      </button>

      {id == null || fazendaQuery.isError ? (
        <div className="bg-white border border-gray-200 rounded shadow-sm p-8 text-center text-gray-500" style={info}>
          Essa fazenda não está disponível nesta conta.
        </div>
      ) : fazendaQuery.isLoading || !fazenda ? (
        <div className="bg-white border border-gray-200 rounded shadow-sm p-8 text-center text-gray-400" style={info}>
          Carregando...
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded shadow-sm mb-4">
            <div className="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-gray-900" style={titulo}>{fazenda.nome}</h1>
                <p className="mt-2 text-gray-600" style={info}>
                  {municipioUf(fazenda.cidade, fazenda.estado)}
                  <span className="mx-2 text-gray-300">·</span>
                  <span style={{ color: corSituacaoFazenda(fazenda.situacao) }}>{rotuloSituacaoFazenda(fazenda.situacao)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLocation(`/fazendas/cadastro?id=${fazenda.id}`)}
                className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-full border border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                style={{ fontFamily: fonte, fontSize: "14px", fontWeight: 600 }}
              >
                Editar Fazenda
              </button>
            </div>
            <div className="px-5 flex flex-wrap gap-2 border-t border-gray-100" role="tablist">
              <Aba atual={aba} id="dados" onClick={irAba}>Dados da Fazenda</Aba>
              <Aba atual={aba} id="subdivisoes" onClick={irAba}>
                Subdivisões ({pastosQuery.isLoading ? "…" : qtdSub ?? 0})
              </Aba>
              <Aba atual={aba} id="benfeitorias" onClick={irAba}>
                Benfeitorias ({benfeitoriasQuery.isLoading ? "…" : qtdBen})
              </Aba>
            </div>
          </div>

          {aba === "dados" && (
            <section className="bg-white border border-gray-200 rounded shadow-sm p-5">
              <h2 className="mb-4" style={secao}>Informações gerais</h2>
              <dl className="space-y-3" style={info}>
                <Linha rotulo="Nome da fazenda" valor={fazenda.nome} />
                <Linha rotulo="Nome do proprietário" valor={textoOuTraco(fazenda.responsavel)} />
                <Linha rotulo="Município/UF" valor={municipioUf(fazenda.cidade, fazenda.estado)} />
                <Linha rotulo="Área total" valor={hectareOuTraco(areaTotalHa(fazenda.area))} />
                <Linha rotulo="Área de pastagem" valor={hectareOuTraco(pastagemHaCadastrada(fazenda.areaPastagem))} />
                <Linha rotulo="Atividade principal" valor={textoOuTraco(fazenda.atividadePrincipal)} />
                <Linha rotulo="Endereço da fazenda" valor={textoOuTraco(fazenda.endereco)} />
              </dl>
            </section>
          )}

          {aba === "subdivisoes" && (
            <FazendaSubdivisoesPanel fazenda={{ id: fazenda.id, nome: fazenda.nome, responsavel: fazenda.responsavel }} />
          )}

          {aba === "benfeitorias" && <BenfeitoriasListPage fazendaFixa={fazenda.id} />}
        </>
      )}
    </AppLayout>
  );
}

function Aba({
  id,
  atual,
  onClick,
  children,
}: {
  id: AbaFichaFazenda;
  atual: AbaFichaFazenda;
  onClick: (aba: AbaFichaFazenda) => void;
  children: string;
}) {
  const ativa = atual === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={() => onClick(id)}
      className={`min-h-[44px] border-b-2 px-3 text-[14px] ${ativa ? "border-[#0E7490] text-[#0E7490] font-semibold" : "border-transparent text-gray-600 hover:text-gray-800"}`}
      style={{ fontFamily: fonte }}
    >
      {children}
    </button>
  );
}

function textoOuTraco(valor?: string | null) {
  const texto = String(valor ?? "").trim();
  return texto || SEM_VALOR_LISTA_FAZENDA;
}

function hectareOuTraco(valor: string) {
  return valor === SEM_VALOR_LISTA_FAZENDA ? valor : `${valor} ha`;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-gray-500">{rotulo}</dt>
      <dd className="text-right text-gray-800">{valor}</dd>
    </div>
  );
}
