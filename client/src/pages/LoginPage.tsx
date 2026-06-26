import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getLocalAuthUser, signInLocal } from "@/lib/localAuth";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [accessPanel, setAccessPanel] = useState<"none" | "forgot" | "register">("none");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [accessFeedback, setAccessFeedback] = useState("");
  const [localUser, setLocalUser] = useState(() => getLocalAuthUser());
  const currentYear = new Date().getFullYear();

  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnMount: "always",
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      setIsLoggingIn(false);
      setLocation("/admin/overview");
    },
    onError: () => {
      const session = signInLocal(email, password);
      if (session) {
        setLocalUser(session);
        setIsLoggingIn(false);
        setLocation("/admin/overview");
        return;
      }

      setIsLoggingIn(false);
    },
  });

  useEffect(() => {
    if (isLoading) return;

    const session = getLocalAuthUser();
    if (user || session) {
      setLocalUser(session);
      setLocation("/admin/overview");
    }
  }, [user, isLoading, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoggingIn(true);
    loginMutation.mutate({ username: email, password });
  };

  const openAccessPanel = (panel: "forgot" | "register") => {
    setAccessFeedback("");
    setAccessPanel(panel);
    if (panel === "forgot") {
      setRecoveryEmail(email);
    }
    if (panel === "register") {
      setRegisterEmail(email);
    }
  };

  if (isLoading && !localUser) {
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
        backgroundImage: `url('/assets/fd-login-bg.webp')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Balanced overlay for readability */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(10,18,32,0.56)" }} />


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
          {/* Brand access header */}
          <div className="mb-8">
            <div className="flex flex-col items-center text-center">
              <div
                className="relative mb-1 grid place-items-center"
                style={{
                  width: "132px",
                  height: "116px",
                }}
              >
                <img
                  src="/assets/brand/fd-symbol-final-aligned.png"
                  alt="Fazenda Digital"
                  className="relative h-[120px] w-[132px]"
                  style={{
                    objectFit: "contain",
                    objectPosition: "center",
                    filter: "saturate(0.74) contrast(1.01) brightness(0.97)",
                  }}
                />
              </div>

              <div style={{ lineHeight: 1 }}>
                <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 820, fontSize: "28px", letterSpacing: "0.058em", color: "white", textShadow: "0 4px 18px rgba(0,0,0,0.18)" }}>
                  FAZENDA
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "6px" }}>
                  <span style={{ width: "28px", height: "1px", background: "linear-gradient(90deg, transparent, rgba(120,214,207,0.64))" }} />
                  <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "12px", letterSpacing: "0.255em", color: "#78D6CF" }}>
                    DIGITAL
                  </span>
                  <span style={{ width: "28px", height: "1px", background: "linear-gradient(90deg, rgba(120,214,207,0.64), transparent)" }} />
                </div>
              </div>
            </div>

            <div className="mt-7">
              <h2 style={{ fontFamily: "'Inter', sans-serif", fontWeight: 750, fontSize: "1.52rem", color: "white", marginBottom: "7px", letterSpacing: "-0.025em" }}>
                Bem-vindo de volta
              </h2>
            </div>
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
              <div className="mb-[7px] flex items-center justify-between gap-3">
                <label style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.5)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  display: "block",
                }}>
                  SENHA
                </label>
                <button
                  type="button"
                  onClick={() => openAccessPanel("forgot")}
                  className="transition-colors"
                  style={{
                    color: accessPanel === "forgot" ? "#4ECDC4" : "rgba(255,255,255,0.45)",
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#4ECDC4")}
                  onMouseLeave={e => (e.currentTarget.style.color = accessPanel === "forgot" ? "#4ECDC4" : "rgba(255,255,255,0.45)")}
                >
                  Esqueceu sua senha?
                </button>
              </div>
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

            <div className="text-center" style={{ marginTop: "2px" }}>
              <span style={{ color: "rgba(255,255,255,0.36)", fontSize: "12.5px", fontFamily: "'Inter', sans-serif" }}>
                Ainda não é usuário?
              </span>{" "}
              <button
                type="button"
                onClick={() => openAccessPanel("register")}
                className="transition-colors"
                style={{
                  color: accessPanel === "register" ? "#4ECDC4" : "rgba(78,205,196,0.88)",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "12.5px",
                  fontWeight: 700,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "#8EF4EA")}
                onMouseLeave={e => (e.currentTarget.style.color = accessPanel === "register" ? "#4ECDC4" : "rgba(78,205,196,0.88)")}
              >
                Cadastre-se
              </button>
            </div>

            {accessPanel !== "none" && (
              <div
                className="rounded-2xl p-4"
                style={{
                  background: "rgba(255,255,255,0.045)",
                  border: "1px solid rgba(78,205,196,0.18)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 style={{ color: "white", fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 700 }}>
                      {accessPanel === "forgot" ? "Recuperar acesso" : "Solicitar cadastro"}
                    </h3>
                    <p style={{ marginTop: "3px", color: "rgba(255,255,255,0.44)", fontFamily: "'Inter', sans-serif", fontSize: "12px", lineHeight: 1.4 }}>
                      {accessPanel === "forgot"
                        ? "Informe seu e-mail para iniciar a recuperação."
                        : "Preencha seus dados para solicitar acesso ao sistema."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccessPanel("none");
                      setAccessFeedback("");
                    }}
                    className="grid place-items-center rounded-lg transition-colors"
                    style={{ width: "28px", height: "28px", color: "rgba(255,255,255,0.42)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.42)")}
                    aria-label="Fechar"
                  >
                    <span className="material-icons text-[18px]">close</span>
                  </button>
                </div>

                {accessPanel === "forgot" ? (
                  <div className="space-y-3">
                    <input
                      type="email"
                      value={recoveryEmail}
                      onChange={e => setRecoveryEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full px-4 py-3 text-sm rounded-xl transition-all focus:outline-none"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "white",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: "13px",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setAccessFeedback("Solicitação de recuperação registrada.")}
                      disabled={!recoveryEmail}
                      className="w-full py-2.5 rounded-xl font-semibold transition-all active:scale-[0.98] disabled:opacity-40"
                      style={{
                        background: "rgba(78,205,196,0.14)",
                        border: "1px solid rgba(78,205,196,0.28)",
                        color: "#8EF4EA",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: "13px",
                      }}
                    >
                      Enviar instruções
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={registerName}
                      onChange={e => setRegisterName(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full px-4 py-3 text-sm rounded-xl transition-all focus:outline-none"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "white",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: "13px",
                      }}
                    />
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={e => setRegisterEmail(e.target.value)}
                      placeholder="E-mail de acesso"
                      className="w-full px-4 py-3 text-sm rounded-xl transition-all focus:outline-none"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "white",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: "13px",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setAccessFeedback("Solicitação de cadastro registrada.")}
                      disabled={!registerName || !registerEmail}
                      className="w-full py-2.5 rounded-xl font-semibold transition-all active:scale-[0.98] disabled:opacity-40"
                      style={{
                        background: "rgba(78,205,196,0.14)",
                        border: "1px solid rgba(78,205,196,0.28)",
                        color: "#8EF4EA",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: "13px",
                      }}
                    >
                      Solicitar cadastro
                    </button>
                  </div>
                )}

                {accessFeedback && (
                  <div
                    className="mt-3 rounded-xl px-3 py-2 flex items-center gap-2"
                    style={{ background: "rgba(78,205,196,0.09)", border: "1px solid rgba(78,205,196,0.18)" }}
                  >
                    <span className="material-icons text-[15px]" style={{ color: "#4ECDC4" }}>check_circle</span>
                    <span style={{ color: "rgba(255,255,255,0.66)", fontFamily: "'Inter', sans-serif", fontSize: "12px" }}>
                      {accessFeedback}
                    </span>
                  </div>
                )}
              </div>
            )}
          </form>

          {/* Footer */}
          <p className="text-center mt-6" style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)", fontFamily: "'Inter', sans-serif" }}>
            Fazenda Digital © {currentYear} - Gestão Pecuária Inteligente
          </p>
        </div>
      </div>
    </div>
  );
}
