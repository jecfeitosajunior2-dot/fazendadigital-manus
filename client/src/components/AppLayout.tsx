import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (!user && location !== "/entrar") {
      setLocation("/entrar");
    }
  }, [location, setLocation]);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#F4F3EF" }}>
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
        {/* Trial banner */}
        <div
          className="px-4 py-2 flex flex-wrap items-center gap-1 text-white text-[12px]"
          style={{ backgroundColor: "#EC5D24" }}
        >
          <span className="hidden sm:inline">
            Você está utilizando uma versão de teste do iRancho e ainda possui <strong>7 dias de teste</strong> restantes.
          </span>
          <span className="sm:hidden text-[11px]">
            Versão de teste — <strong>7 dias</strong> restantes.
          </span>
          <a href="#" className="underline text-white/90 hover:text-white ml-1">
            Para assinar, entre em contato: (62)99981-1720 / contato@irancho.com.br
          </a>
        </div>
        {/* Content area */}
        <main className="flex-1 p-3 sm:p-5 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
        {/* Footer */}
        <footer className="px-4 py-3 text-center text-[11px] text-gray-400 border-t border-gray-200">
          © Copyright 2026 | Desenvolvido por iRancho
        </footer>
      </div>
    </div>
  );
}
