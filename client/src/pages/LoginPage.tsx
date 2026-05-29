import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  useEffect(() => {
    if (user) {
      setLocation("/admin/overview");
    }
  }, [user, setLocation]);

  const handleLogin = () => {
    // Redirect to Manus OAuth
    const origin = window.location.origin;
    const returnPath = "/admin/overview";
    const state = btoa(JSON.stringify({ origin, returnPath }));
    const redirectUri = `${origin}/api/oauth/callback`;
    const oauthUrl = `${import.meta.env.VITE_OAUTH_PORTAL_URL || "https://manus.im"}/oauth/authorize?client_id=${import.meta.env.VITE_APP_ID || ""}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
    window.location.href = oauthUrl;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2D5A5A] mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "#2D5A5A" }}>
            <span className="material-icons text-white text-3xl">agriculture</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "#2D5A5A" }}>OptiGado</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de Gestão Pecuária</p>
        </div>

        {/* Login Button */}
        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "#2D5A5A" }}
          >
            <span className="material-icons text-[20px]">login</span>
            Entrar com Manus
          </button>
          
          <p className="text-center text-xs text-gray-400">
            Autenticação segura via Manus OAuth
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            OptiGado © 2024 — Gestão Pecuária Inteligente
          </p>
        </div>
      </div>
    </div>
  );
}
