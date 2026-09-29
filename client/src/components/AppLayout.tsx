import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getLocalAuthUser } from "@/lib/localAuth";
import AppFooter from "./AppFooter";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const LayoutShellContext = createContext(false);

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AppLayoutProps) {
  const [, setLocation] = useLocation();
  const localUser = getLocalAuthUser();
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !user && !localUser) {
      setLocation("/entrar");
    }
  }, [user, localUser, isLoading, setLocation]);

  if (isLoading && !user && !localUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2D5A5A] mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user && !localUser) return null;

  return <>{children}</>;
}

export function AppShell({ children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [mobileOpen]);

  return (
    <LayoutShellContext.Provider value={true}>
      <div className="flex min-h-dvh w-full flex-1 flex-col" style={{ backgroundColor: "#F5F5F5" }}>
        <Topbar onMenuToggle={() => setMobileOpen(o => !o)} />
        <div className="relative z-10 flex min-w-0 flex-1">
          <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
          <main className="min-w-0 w-full flex-1 p-4">
            {children}
          </main>
        </div>
        <AppFooter />
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
