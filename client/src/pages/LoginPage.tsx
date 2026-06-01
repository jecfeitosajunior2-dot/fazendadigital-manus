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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d1b2e" }}>
        <div className="text-center">
          <div
            className="h-10 w-10 rounded-full border-2 border-transparent animate-spin mx-auto mb-4"
            style={{ borderTopColor: "#1BC5BD", borderRightColor: "#0891B2" }}
          />
          <p className="text-white/50 text-sm font-medium">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: "#0d1b2e",
        backgroundImage: `url('https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/fd-login-bg-eEvanysYRdc4cQz3Zr2BKR.webp')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(10,18,32,0.72)" }} />


      {/* Glow top-right */}
      <div
        className="absolute top-0 right-0 pointer-events-none"
        style={{
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(27,197,189,0.07) 0%, transparent 65%)",
          transform: "translate(30%, -30%)",
        }}
      />
      {/* Glow bottom-left */}
      <div
        className="absolute bottom-0 left-0 pointer-events-none"
        style={{
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(8,145,178,0.06) 0%, transparent 65%)",
          transform: "translate(-30%, 30%)",
        }}
      />

      {/* Login Card */}
      <div
        className="relative z-10 w-full mx-4"
        style={{ maxWidth: "480px" }}
      >
        <div
          className="rounded-2xl p-8 sm:p-10"
          style={{
            background: "rgba(13,27,46,0.85)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(27,197,189,0.18)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(27,197,189,0.06)",
          }}
        >
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/fd-icon-bull-new-9aYJEWBxP7vf2ogfzT5b8k.webp"
              alt="Fazenda Digital"
              className="h-[60px] w-[60px] rounded-xl flex-shrink-0"
              style={{ boxShadow: "0 4px 20px rgba(27,197,189,0.4)" }}
            />
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "20px", letterSpacing: "0.08em", color: "white" }}>
                FAZENDA
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "3px" }}>
                <span style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, transparent, #1BC5BD)" }} />
                <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "9px", letterSpacing: "0.3em", color: "#1BC5BD" }}>DIGITAL</span>
                <span style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, #1BC5BD, transparent)" }} />
              </div>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "1.6rem", color: "white", marginBottom: "6px" }}>
              Bem-vindo de volta
            </h2>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px", fontFamily: "'Inter', sans-serif" }}>
              Acesse sua conta para continuar
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "11px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "7px",
              }}>
                E-MAIL OU USUÁRIO
              </label>
              <div className="relative">
                <span className="material-icons absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  person
                </span>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-3 text-sm rounded-xl transition-all focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "white",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "14px",
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = "rgba(27,197,189,0.6)";
                    e.currentTarget.style.background = "rgba(27,197,189,0.06)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(27,197,189,0.1)";
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "11px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                display: "block",
                marginBottom: "7px",
              }}>
                SENHA
              </label>
              <div className="relative">
                <span className="material-icons absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  lock
                </span>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 text-sm rounded-xl transition-all focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "white",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "14px",
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = "rgba(27,197,189,0.6)";
                    e.currentTarget.style.background = "rgba(27,197,189,0.06)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(27,197,189,0.1)";
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
                >
                  <span className="material-icons text-[18px]">{showPass ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
            </div>

            {/* Error */}
            {loginMutation.isError && (
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-2.5"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
              >
                <span className="material-icons text-[16px] flex-shrink-0" style={{ color: "#F87171" }}>error</span>
                <p style={{ fontSize: "13px", color: "#F87171", fontFamily: "'Inter', sans-serif" }}>
                  Usuário ou senha inválidos.
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoggingIn || !email || !password}
              className="w-full py-3.5 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #1BC5BD 0%, #0891B2 100%)",
                color: "white",
                fontFamily: "'Inter', sans-serif",
                fontSize: "15px",
                fontWeight: 600,
                boxShadow: "0 4px 24px rgba(27,197,189,0.3)",
                marginTop: "4px",
              }}
              onMouseEnter={e => { if (!isLoggingIn) e.currentTarget.style.boxShadow = "0 6px 32px rgba(27,197,189,0.45)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 4px 24px rgba(27,197,189,0.3)"; }}
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
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", fontFamily: "'Inter', sans-serif" }}>ou</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* OAuth */}
          <button
            onClick={handleOAuth}
            className="w-full py-3 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{
              background: "rgba(27,197,189,0.08)",
              border: "1px solid rgba(27,197,189,0.25)",
              color: "#1BC5BD",
              fontFamily: "'Inter', sans-serif",
              fontSize: "14px",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(27,197,189,0.14)";
              e.currentTarget.style.borderColor = "rgba(27,197,189,0.45)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(27,197,189,0.08)";
              e.currentTarget.style.borderColor = "rgba(27,197,189,0.25)";
            }}
          >
            <span className="material-icons text-[18px]">verified_user</span>
            Entrar com Manus OAuth
          </button>

          {/* Footer */}
          <p className="text-center mt-6" style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)", fontFamily: "'Inter', sans-serif" }}>
            Fazenda Digital © 2024 — Gestão Pecuária Inteligente
          </p>
        </div>
      </div>
    </div>
  );
}
