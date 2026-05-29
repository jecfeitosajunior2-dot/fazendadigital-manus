import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
      <div className="text-center">
        <span className="material-icons text-6xl text-gray-300 mb-4 block">error_outline</span>
        <h1 className="text-3xl font-bold text-gray-700 mb-2">404</h1>
        <p className="text-gray-500 mb-6">Página não encontrada</p>
        <button
          onClick={() => setLocation("/admin/overview")}
          className="px-4 py-2 rounded text-white text-sm font-medium"
          style={{ backgroundColor: "#8BC34A" }}
        >
          Voltar ao Painel de Controle
        </button>
      </div>
    </div>
  );
}
