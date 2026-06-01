import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPass, setShowPass] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0F172A" }}>
        <div className="text-center">
          <div
            className="h-10 w-10 rounded-full border-2 border-transparent animate-spin mx-auto mb-4"
            style={{ borderTopColor: "#1BC5BD", borderRightColor: "#0891B2" }}
          />
          <p className="text-white/50 text-sm font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>
            Verificando sessão...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex relative overflow-hidden"
      style={{ background: "#0F172A" }}
    >
      {/* Background image with overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(/manus-storage/cattle-bg2_e020b600.jpg)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: 0.12,
        }}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, #0F172A 0%, #0F172A 40%, rgba(8,145,178,0.15) 100%)",
        }}
      />

      {/* Decorative glow */}
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(27,197,189,0.08) 0%, transparent 70%)",
          transform: "translate(20%, -20%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(8,145,178,0.06) 0%, transparent 70%)",
          transform: "translate(-30%, 30%)",
        }}
      />

      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex flex-col justify-between flex-1 relative z-10 p-12 max-w-[55%]">
        {/* Top logo */}
        <div className="flex items-center gap-3">
          <div
            className="h-[40px] w-[40px] rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1BC5BD, #0891B2)" }}
          >
            <span className="material-icons text-white text-[22px]">agriculture</span>
          </div>
          <div className="flex flex-col" style={{ lineHeight: 1 }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "15px", letterSpacing: "0.06em", color: "white" }}>FAZENDA</span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "3px" }}>
              <span style={{ flex: 1, height: "1px", background: "#1BC5BD", opacity: 0.5 }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "9px", letterSpacing: "0.25em", color: "#1BC5BD" }}>DIGITAL</span>
              <span style={{ flex: 1, height: "1px", background: "#1BC5BD", opacity: 0.5 }} />
            </div>
          </div>
        </div>

        {/* Center tagline */}
        <div>
          <h1
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: "3.2rem",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "white",
              marginBottom: "1.5rem",
            }}
          >
            Inteligência que<br />
            <span style={{ background: "linear-gradient(135deg, #1BC5BD, #0891B2)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              transforma dados
            </span><br />
            em resultados.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "1rem", fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}>
            Gestão pecuária de precisão para produtores<br />
            que buscam resultados reais.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            {["Gestão Pecuária", "Inteligência de Dados", "Tecnologia", "Escalabilidade"].map((tag) => (
              <span
                key={tag}
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "11px",
                  fontWeight: 500,
                  padding: "4px 12px",
                  borderRadius: "100px",
                  background: "rgba(27,197,189,0.1)",
                  color: "#1BC5BD",
                  border: "1px solid rgba(27,197,189,0.2)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "12px", fontFamily: "'Inter', sans-serif" }}>
          Fazenda Digital © 2024 — Gestão Pecuária Inteligente
        </p>
      </div>

      {/* Right login panel */}
      <div className="relative z-10 w-full lg:w-[480px] flex items-center justify-center p-6 lg:p-12">
        <div
          className="w-full max-w-[400px] rounded-2xl p-8"
          style={{
            background: "rgba(15,23,42,0.85)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(27,197,189,0.15)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(27,197,189,0.08)",
          }}
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div
              className="h-[36px] w-[36px] rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #1BC5BD, #0891B2)" }}
            >
              <span className="material-icons text-white text-[20px]">agriculture</span>
            </div>
            <div className="flex flex-col" style={{ lineHeight: 1 }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "14px", letterSpacing: "0.06em", color: "white" }}>FAZENDA</span>
              <div style={{ display: "flex", alignItems: "center", gap: "3px", marginTop: "2px" }}>
                <span style={{ flex: 1, height: "1px", background: "#1BC5BD", opacity: 0.5 }} />
                <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "8px", letterSpacing: "0.25em", color: "#1BC5BD" }}>DIGITAL</span>
                <span style={{ flex: 1, height: "1px", background: "#1BC5BD", opacity: 0.5 }} />
              </div>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "1.5rem", color: "white", marginBottom: "4px" }}>
              Bem-vindo de volta
            </h2>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", fontFamily: "'Inter', sans-serif" }}>
              Acesse sua conta para continuar
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "6px" }}
              >
                E-mail ou Usuário
              </label>
              <div className="relative">
                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  person
                </span>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg transition-all focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "white",
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(27,197,189,0.5)"; e.currentTarget.style.background = "rgba(27,197,189,0.05)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label
                style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "6px" }}
              >
                Senha
              </label>
              <div className="relative">
                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  lock
                </span>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg transition-all focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "white",
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "rgba(27,197,189,0.5)"; e.currentTarget.style.background = "rgba(27,197,189,0.05)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
                >
                  <span className="material-icons text-[18px]">{showPass ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
            </div>

            {loginMutation.isError && (
              <div
                className="rounded-lg px-3 py-2.5 flex items-center gap-2"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
              >
                <span className="material-icons text-[16px]" style={{ color: "#F87171" }}>error</span>
                <p style={{ fontSize: "12px", color: "#F87171", fontFamily: "'Inter', sans-serif" }}>
                  Usuário ou senha inválidos.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn || !email || !password}
              className="w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed mt-1"
              style={{
                background: isLoggingIn || !email || !password ? "rgba(27,197,189,0.4)" : "linear-gradient(135deg, #1BC5BD, #0891B2)",
                color: "white",
                fontFamily: "'Inter', sans-serif",
                fontSize: "14px",
                boxShadow: "0 4px 20px rgba(27,197,189,0.25)",
              }}
              onMouseEnter={e => { if (!isLoggingIn && email && password) e.currentTarget.style.boxShadow = "0 6px 28px rgba(27,197,189,0.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(27,197,189,0.25)"; }}
            >
              {isLoggingIn ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
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
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", fontFamily: "'Inter', sans-serif" }}>ou</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* OAuth button */}
          <button
            onClick={handleOAuth}
            className="w-full py-2.5 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{
              background: "rgba(27,197,189,0.08)",
              border: "1px solid rgba(27,197,189,0.25)",
              color: "#1BC5BD",
              fontFamily: "'Inter', sans-serif",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(27,197,189,0.14)"; e.currentTarget.style.borderColor = "rgba(27,197,189,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(27,197,189,0.08)"; e.currentTarget.style.borderColor = "rgba(27,197,189,0.25)"; }}
          >
            <span className="material-icons text-[18px]">verified_user</span>
            Entrar com Manus OAuth
          </button>

          {/* Footer */}
          <div className="mt-6 pt-5 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", fontFamily: "'Inter', sans-serif" }}>
              Fazenda Digital © 2024 — Gestão Pecuária Inteligente
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
