import { useEffect } from "react";
import { useLocation } from "wouter";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (!user && location !== "/entrar") {
      setLocation("/entrar");
    }
  }, [location, setLocation]);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        {/* Trial banner */}
        <div
          className="px-4 py-2 flex items-center gap-2 text-white text-[12px]"
          style={{ backgroundColor: "#E65100" }}
        >
          <span className="material-icons text-[16px]">warning</span>
          <span>
            You are using an iRancho trial version and still have <strong>7 trial days</strong> left.
          </span>
          <a href="#" className="ml-1 underline text-white/90 hover:text-white">
            To subscribe, contact us: (62)99981-1720 / contato@irancho.com.br
          </a>
        </div>
        {/* Content area */}
        <main className="flex-1 p-5 overflow-y-auto">
          {children}
        </main>
        {/* Footer */}
        <footer className="px-4 py-3 text-center text-[11px] text-gray-400 border-t border-gray-200">
          © Copyright 2026 | Developed by iRancho
        </footer>
      </div>
    </div>
  );
}
