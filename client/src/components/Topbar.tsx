import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { NotificationCenter } from "./NotificationCenter";
import { trpc } from "@/lib/trpc";
import { clearLocalAuthSession, getLocalAuthUser } from "@/lib/localAuth";

const LOGOUT_HREF = "/api/auth/logout";

export default function Topbar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const [showUser, setShowUser] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; right: number } | null>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const localUser = getLocalAuthUser();

  const { data: user } = trpc.auth.me.useQuery(undefined, { retry: false });

  useEffect(() => {
    if (!showUser) return;

    const updatePosition = () => {
      if (!menuBtnRef.current) return;
      const rect = menuBtnRef.current.getBoundingClientRect();
      setMenuStyle({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const closeOnOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userRef.current?.contains(target)) return;
      const menu = document.getElementById("fd-user-menu");
      if (menu?.contains(target)) return;
      setShowUser(false);
    };

    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", closeOnOutside);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showUser]);

  const displayName = user?.name || localUser?.name || "Administrador";
  const displayEmail = user?.email || localUser?.email || "admin@fazendadigital.com.br";
  const initials = displayName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();

  const userMenu = showUser && menuStyle
    ? createPortal(
        <div
          id="fd-user-menu"
          className="w-64 sm:w-56 rounded-xl shadow-2xl border py-1"
          style={{
            position: "fixed",
            top: menuStyle.top,
            right: menuStyle.right,
            zIndex: 9999,
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
            {(user?.role === "admin" || localUser?.role === "admin") && (
              <span
                className="inline-block mt-2 px-2 py-0.5 text-[10px] rounded-full font-semibold"
                style={{ background: "rgba(27,197,189,0.15)", color: "#1BC5BD", border: "1px solid rgba(27,197,189,0.3)" }}
              >
                Admin
              </span>
            )}
          </div>
          <button
            type="button"
            className="w-full text-left px-4 py-3 sm:py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition-colors"
            style={{ minHeight: 48 }}
          >
            <span className="material-icons text-[18px] text-white/40">person</span> Perfil
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-3 sm:py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition-colors"
            style={{ minHeight: 48 }}
          >
            <span className="material-icons text-[18px] text-white/40">settings</span> Configurações
          </button>
          <hr className="my-1" style={{ borderColor: "rgba(255,255,255,0.07)" }} />
          <a
            href={LOGOUT_HREF}
            onClick={() => clearLocalAuthSession()}
            className="w-full text-left px-4 py-3 sm:py-2.5 text-sm flex items-center gap-2.5 transition-colors cursor-pointer no-underline"
            style={{ minHeight: 48, color: "#F87171", display: "flex" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span className="material-icons text-[16px]">logout</span>
            Sair
          </a>
        </div>,
        document.body,
      )
    : null;

  return (
    <header
      className="h-[52px] sm:h-[48px] flex items-center justify-between px-3 sm:px-4 border-b relative z-30"
      style={{
        background: "linear-gradient(135deg, #0F172A 0%, #164E63 60%, #0891B2 100%)",
        borderBottomColor: "rgba(27,197,189,0.15)",
      }}
    >
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="lg:hidden text-white/70 hover:text-white active:text-white active:bg-white/20 rounded-lg transition-colors flex items-center justify-center select-none"
            style={{ minWidth: 48, minHeight: 48, touchAction: "manipulation", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
            aria-label="Abrir menu"
            type="button"
          >
            <span className="material-icons text-[26px]" style={{ pointerEvents: "none" }}>menu</span>
          </button>
        )}
        <div className="lg:hidden flex items-center gap-1.5">
          <div className="grid h-[34px] w-[34px] place-items-center shrink-0">
            <img
              src="/assets/brand/fd-symbol-final-aligned.png"
              alt="Fazenda Digital"
              className="h-[34px] w-[34px] object-contain"
              style={{
                objectPosition: "center",
                filter: "saturate(0.74) contrast(1.01) brightness(0.97)",
              }}
            />
          </div>
          <div className="flex flex-col items-center" style={{ lineHeight: 1, width: "92px" }}>
            <span style={{ width: "100%", textAlign: "center", fontFamily: "'Inter', sans-serif", fontWeight: 820, fontSize: "12px", letterSpacing: "0.058em", color: "white" }}>FAZENDA</span>
            <div style={{ width: "78px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginTop: "4px" }}>
              <span style={{ width: "13px", height: "1px", background: "linear-gradient(90deg, transparent, rgba(120,214,207,0.64))" }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "7.5px", letterSpacing: "0.24em", color: "#78D6CF", transform: "translateX(0.8px)" }}>DIGITAL</span>
              <span style={{ width: "13px", height: "1px", background: "linear-gradient(90deg, rgba(120,214,207,0.64), transparent)" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2" ref={userRef}>
        <div className="text-white/70 hover:text-white">
          <NotificationCenter />
        </div>

        <div className="relative">
          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => setShowUser(open => !open)}
            className="flex items-center gap-2 px-2 rounded-lg hover:bg-white/10 transition-all duration-150"
            style={{ minHeight: 44 }}
            aria-expanded={showUser}
            aria-haspopup="true"
          >
            <div
              className="h-[28px] w-[28px] rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #1BC5BD, #0891B2)" }}
            >
              {initials}
            </div>
            <span className="text-[13px] text-white font-medium hidden md:inline">{displayName}</span>
            <span className="material-icons text-[14px] text-white/50">expand_more</span>
          </button>
        </div>
      </div>

      {userMenu}
    </header>
  );
}
