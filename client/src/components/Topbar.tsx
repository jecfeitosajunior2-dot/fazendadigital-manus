import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";

export default function Topbar({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const [, setLocation] = useLocation();
  const [showUser, setShowUser] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const user = JSON.parse(localStorage.getItem("user") || '{"name":"Pedro Gomes","email":"pngomes1@teste.com"}');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUser(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    setLocation("/entrar");
  };

  return (
    <header className="h-[48px] flex items-center justify-between px-4" style={{ backgroundColor: "#3B2110" }}>
      {/* Left: hamburger for mobile */}
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button onClick={onMenuToggle} className="md:hidden text-white/80 hover:text-white p-1">
            <span className="material-icons text-[22px]">menu</span>
          </button>
        )}
        {/* Logo in topbar (visible on mobile when sidebar hidden) */}
        <div className="md:hidden flex items-center gap-2">
          <span className="material-icons text-[20px] text-white">pets</span>
          <span className="text-white font-medium text-[14px]">iRancho</span>
        </div>
      </div>

      {/* Right side: notification bell + user name */}
      <div className="flex items-center gap-3" ref={userRef}>
        {/* Notification bell */}
        <button className="relative text-white/70 hover:text-white p-1">
          <span className="material-icons text-[20px]">notifications_none</span>
          <span
            className="absolute -top-0.5 -right-0.5 w-[16px] h-[16px] rounded-full text-[9px] font-bold flex items-center justify-center text-white bg-red-500"
          >
            1
          </span>
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUser(!showUser)}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/10"
          >
            <span className="material-icons text-[20px] text-white/80">person</span>
            <span className="text-[13px] text-white font-medium hidden sm:inline">{user.name}</span>
            <span className="material-icons text-[14px] text-white/60">expand_more</span>
          </button>
          {showUser && (
            <div className="absolute right-0 top-11 w-52 bg-white rounded shadow-lg border border-gray-200 py-1 z-50">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-800">{user.name}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
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
