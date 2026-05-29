import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { MODULES } from "@/lib/data";
import { FARMS } from "@/lib/data";
import { ChevronsUpDown, Search, Bell, LogOut, User } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppShellProps {
  children: ReactNode;
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  userName?: string;
}

const groupOrder: Array<"Operação" | "Comercial" | "Inteligência" | "Sistema"> = [
  "Operação",
  "Comercial",
  "Inteligência",
  "Sistema",
];

export function AppShell({ children, kicker, title, subtitle, actions, userName = "Paulo Nogueira" }: AppShellProps) {
  const [location, navigate] = useLocation();
  const [farmId, setFarmId] = useState(FARMS[0].id);
  const farm = FARMS.find((f) => f.id === farmId) ?? FARMS[0];

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border relative">
        <div className="px-6 pt-7 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-[var(--harvest)] flex items-center justify-center">
              <span className="font-display text-[var(--bark)] text-xl font-bold leading-none">A</span>
            </div>
            <div>
              <p className="font-display text-lg leading-tight">AgroGestor Pro</p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/60">
                Edição Editorial
              </p>
            </div>
          </div>
        </div>

        <nav className="px-3 pb-6 flex-1 overflow-y-auto">
          {groupOrder.map((group) => {
            const items = MODULES.filter((m) => m.group === group);
            return (
              <div key={group} className="mb-5">
                <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/45">
                  {group}
                </p>
                <ul className="space-y-0.5">
                  {items.map((m) => {
                    const active = location === m.path || (m.path !== "/painel" && location.startsWith(m.path));
                    const Icon = m.icon;
                    return (
                      <li key={m.key}>
                        <Link
                          href={m.path}
                          className={`group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                          }`}
                        >
                          <Icon className="w-4 h-4 opacity-80" />
                          <span>{m.label}</span>
                          {active && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--harvest)]" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="px-6 py-5 border-t border-sidebar-border text-xs text-sidebar-foreground/55">
          <p className="font-mono">v0.9.0 — prévia</p>
          <p>Demonstração original Manus</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 backdrop-blur bg-[color-mix(in_oklch,var(--paper)_85%,transparent)] border-b border-border">
          <div className="flex items-center gap-4 px-6 py-3">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:border-[var(--moss)] transition-colors">
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground leading-none">
                    Fazenda
                  </p>
                  <p className="text-sm font-medium leading-tight">{farm.name}</p>
                </div>
                <ChevronsUpDown className="w-3.5 h-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel>Selecionar fazenda</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {FARMS.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onClick={() => {
                      setFarmId(f.id);
                      toast.success(`Contexto alterado para ${f.name}`);
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.city} · {f.area.toLocaleString("pt-BR")} ha
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1 max-w-md hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card">
              <Search className="w-4 h-4 opacity-50" />
              <input
                placeholder="Buscar animais, lotes, manejos..."
                className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground/70"
              />
              <span className="text-[10px] font-mono text-muted-foreground/70">⌘K</span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => toast("3 alertas operacionais pendentes")}
                className="w-9 h-9 rounded-md border border-border bg-card flex items-center justify-center hover:border-[var(--moss)]"
                aria-label="Notificações"
              >
                <Bell className="w-4 h-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-card hover:border-[var(--moss)] transition-colors">
                  <div className="w-7 h-7 rounded-full bg-[var(--moss-deep)] text-[var(--paper)] flex items-center justify-center text-xs font-semibold">
                    {userName.split(" ").map(n => n[0]).join("").toUpperCase()}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs leading-none font-medium">{userName}</p>
                    <p className="text-[10px] text-muted-foreground leading-none mt-1">Administrador</p>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Conta</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/configuracoes")}> 
                    <User className="w-4 h-4 mr-2" /> Perfil & preferências
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { navigate("/"); }}>
                    <LogOut className="w-4 h-4 mr-2" /> Sair da prévia
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 lg:px-10 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              {kicker && <p className="kicker mb-2">{kicker}</p>}
              <h1 className="font-display text-3xl md:text-4xl leading-[1.05]">{title}</h1>
              {subtitle && (
                <p className="text-muted-foreground mt-2 max-w-2xl text-sm md:text-[15px]">{subtitle}</p>
              )}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
          <div className="editorial-rule mb-6" />
          {children}
        </main>
      </div>
    </div>
  );
}
