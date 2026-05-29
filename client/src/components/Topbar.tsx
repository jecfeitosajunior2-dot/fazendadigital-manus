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
  const displayEmail = user?.email || "admin@optigado.com.br";

  return (
    <header className="h-[48px] flex items-center justify-between px-4" style={{ background: "linear-gradient(135deg, #2D5A5A, #4ECDC4)" }}>
      {/* Left: hamburger for mobile */}
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button onClick={onMenuToggle} className="md:hidden text-white/80 hover:text-white p-1">
            <span className="material-icons text-[22px]">menu</span>
          </button>
        )}
        {/* Logo in topbar (visible on mobile when sidebar hidden) */}
        <div className="md:hidden flex items-center gap-2">
          <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/optigado-logo-main-mXWXN4srP6kxgWxXHn5rhA.webp" alt="OptiGado" className="h-[28px] w-[28px] object-contain" />
          <span className="text-white font-extrabold text-[14px]" style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 800, letterSpacing: "0.03em" }}>
            <span>Opti</span><span style={{ color: "#4ECDC4" }}>Gado</span>
          </span>
        </div>
      </div>

      {/* Right side: notification bell + user name */}
      <div className="flex items-center gap-3" ref={userRef}>
        {/* Notification Center */}
        <div className="text-white/70 hover:text-white">
          <NotificationCenter />
        </div>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUser(!showUser)}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/10"
          >
            <span className="material-icons text-[20px] text-white/80">person</span>
            <span className="text-[13px] text-white font-medium hidden sm:inline">{displayName}</span>
            <span className="material-icons text-[14px] text-white/60">expand_more</span>
          </button>
          {showUser && (
            <div className="absolute right-0 top-11 w-52 bg-white rounded shadow-lg border border-gray-200 py-1 z-50">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-800">{displayName}</p>
                <p className="text-xs text-gray-500">{displayEmail}</p>
                {user?.role === "admin" && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 bg-[#2D5A5A]/10 text-[#2D5A5A] text-[10px] rounded font-medium">Admin</span>
                )}
              </div>
              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <span className="material-icons text-[16px] text-gray-400">person</span> Perfil
              </button>
              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <span className="material-icons text-[16px] text-gray-400">settings</span> Configurações
              </button>
              <hr className="my-1 border-gray-100" />
              <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                <span className="material-icons text-[16px]">logout</span> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
