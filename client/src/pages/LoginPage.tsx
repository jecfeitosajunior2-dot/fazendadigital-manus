import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      setLocation("/admin/overview");
    },
    onError: () => {
      setIsLoggingIn(false);
    },
  });

  useEffect(() => {
    if (user) {
      setLocation("/admin/overview");
    }
  }, [user, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoggingIn(true);
    loginMutation.mutate({ username: email, password });
  };

  const handleOAuth = () => {
    const origin = window.location.origin;
    const returnPath = "/admin/overview";
    const state = btoa(JSON.stringify({ origin, returnPath }));
    const redirectUri = `${origin}/api/oauth/callback`;
    const oauthUrl = `${import.meta.env.VITE_OAUTH_PORTAL_URL || "https://manus.im"}/oauth/authorize?client_id=${import.meta.env.VITE_APP_ID || ""}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
    window.location.href = oauthUrl;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a2e1a]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4ECDC4] mx-auto mb-4"></div>
          <p className="text-gray-300 text-sm">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-end relative overflow-hidden"
      style={{
        backgroundImage: `url(/manus-storage/cattle-bg2_e020b600.jpg)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Login card — right side */}
      <div className="relative z-10 w-full max-w-md mr-0 md:mr-16 lg:mr-24 px-4 md:px-0">
        <div
          className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8"
          style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/optigado-logo-main-mXWXN4srP6kxgWxXHn5rhA.webp"
                alt="Fazenda Digital"
                className="w-14 h-14 object-contain"
              />
              <h1 className="text-3xl" style={{ color: "#2D5A5A", fontFamily: "'Fraunces', serif", fontWeight: 600, letterSpacing: "-0.01em" }}>
                Fazenda Digital
              </h1>
            </div>
            <p className="text-gray-500 text-sm" style={{ fontFamily: "'Fraunces', serif" }}>Inteligência Pecuária. Resultados Reais.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                E-mail ou Usuário
              </label>
              <div className="relative">
                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
                  person
                </span>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  style={{ "--tw-ring-color": "#4ECDC4" } as React.CSSProperties}
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                Senha
              </label>
              <div className="relative">
                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
                  lock
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  style={{ "--tw-ring-color": "#4ECDC4" } as React.CSSProperties}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {loginMutation.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="material-icons text-red-400 text-[16px]">error</span>
                <p className="text-xs text-red-600">Usuário ou senha inválidos.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn || !email || !password}
              className="w-full py-3 px-4 rounded-lg text-white font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{ backgroundColor: "#2D5A5A" }}
            >
              {isLoggingIn ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Entrando...
                </>
              ) : (
                <>
                  <span className="material-icons text-[18px]">login</span>
                  Entrar
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">ou</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* OAuth button */}
          <button
            onClick={handleOAuth}
            className="w-full py-2.5 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] border"
            style={{ borderColor: "#4ECDC4", color: "#2D5A5A" }}
          >
            <span className="material-icons text-[18px]" style={{ color: "#4ECDC4" }}>
              verified_user
            </span>
            Entrar com Manus OAuth
          </button>

          {/* Footer */}
          <div className="mt-6 pt-5 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Fazenda Digital © 2024 — Gestão Pecuária Inteligente
            </p>
          </div>
        </div>
      </div>

      {/* Left side branding overlay */}
      <div className="absolute left-8 bottom-8 z-10 hidden md:block">
        <p className="text-white/80 text-sm font-light max-w-xs leading-relaxed drop-shadow">
          Inteligência Pecuária.<br />
          <span className="font-semibold text-white">Resultados Reais.</span>
        </p>
      </div>
    </div>
  );
}
