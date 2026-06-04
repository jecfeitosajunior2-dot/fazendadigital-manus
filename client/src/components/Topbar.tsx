import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { NotificationCenter } from "./NotificationCenter";
import { trpc } from "@/lib/trpc";

export default function Topbar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const [, setLocation] = useLocation();
  const [showUser, setShowUser] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => setLocation("/entrar"),
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUser(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const displayName = user?.name || "Administrador";
  const displayEmail = user?.email || "admin@fazendadigital.com.br";
  const initials = displayName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header
      className="h-[52px] sm:h-[48px] flex items-center justify-between px-3 sm:px-4 border-b"
      style={{
        background: "linear-gradient(135deg, #0F172A 0%, #164E63 60%, #0891B2 100%)",
        borderBottomColor: "rgba(27,197,189,0.15)",
      }}
    >
      {/* Left: hamburger for mobile */}
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="lg:hidden text-white/70 hover:text-white rounded transition-colors flex items-center justify-center"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label="Abrir menu"
          >
            <span className="material-icons text-[24px]">menu</span>
          </button>
        )}
        {/* Logo in topbar (visible on mobile when sidebar hidden) */}
        <div className="lg:hidden flex items-center gap-2">
          <div
            className="h-[30px] w-[30px] rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1BC5BD, #0891B2)" }}
          >
            <span className="material-icons text-white text-[18px]">agriculture</span>
          </div>
          <div className="flex flex-col" style={{ lineHeight: 1 }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "12px", letterSpacing: "0.05em", color: "white" }}>FAZENDA</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "8px", letterSpacing: "0.2em", color: "#1BC5BD" }}>DIGITAL</span>
          </div>
        </div>
      </div>

      {/* Right side: notification bell + user */}
      <div className="flex items-center gap-2" ref={userRef}>
        {/* Notification Center */}
        <div className="text-white/70 hover:text-white">
          <NotificationCenter />
        </div>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUser(!showUser)}
            className="flex items-center gap-2 px-2 rounded-lg hover:bg-white/10 transition-all duration-150"
            style={{ minHeight: 44 }}
          >
            {/* Avatar circle */}
            <div
              className="h-[28px] w-[28px] rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #1BC5BD, #0891B2)" }}
            >
              {initials}
            </div>
            <span className="text-[13px] text-white font-medium hidden md:inline">{displayName}</span>
            <span className="material-icons text-[14px] text-white/50">expand_more</span>
          </button>

          {showUser && (
            <div
              className="absolute right-0 top-[52px] sm:top-12 w-64 sm:w-56 rounded-xl shadow-2xl border py-1 z-50"
              style={{
                background: "#0F172A",
                borderColor: "rgba(27,197,189,0.2)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(27,197,189,0.1)",
              }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-[32px] w-[32px] rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                    style={{ background: "linear-gradient(135deg, #1BC5BD, #0891B2)" }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                    <p className="text-xs text-white/40 truncate">{displayEmail}</p>
                  </div>
                </div>
                {user?.role === "admin" && (
                  <span
                    className="inline-block mt-2 px-2 py-0.5 text-[10px] rounded-full font-semibold"
                    style={{ background: "rgba(27,197,189,0.15)", color: "#1BC5BD", border: "1px solid rgba(27,197,189,0.3)" }}
                  >
                    Admin
                  </span>
                )}
              </div>
              <button className="w-full text-left px-4 py-3 sm:py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition-colors" style={{ minHeight: 48 }}>
                <span className="material-icons text-[18px] text-white/40">person</span> Perfil
              </button>
              <button className="w-full text-left px-4 py-3 sm:py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition-colors" style={{ minHeight: 48 }}>
                <span className="material-icons text-[18px] text-white/40">settings</span> Configurações
              </button>
              <hr className="my-1" style={{ borderColor: "rgba(255,255,255,0.07)" }} />
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 sm:py-2.5 text-sm flex items-center gap-2.5 transition-colors"
                style={{ minHeight: 48, color: "#F87171" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span className="material-icons text-[16px]">logout</span> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
