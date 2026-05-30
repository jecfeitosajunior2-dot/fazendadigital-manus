import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const LayoutShellContext = createContext(false);

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AppLayoutProps) {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/entrar");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2D5A5A] mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

export function AppShell({ children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <LayoutShellContext.Provider value={true}>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#F5F5F5" }}>
        <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Topbar onMenuToggle={() => setMobileOpen(o => !o)} />
          <main className="flex-1 overflow-y-auto p-4">
            {children}
          </main>
        </div>
      </div>
    </LayoutShellContext.Provider>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  const insideShell = useContext(LayoutShellContext);

  if (insideShell) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
