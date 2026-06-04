import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#1BC5BD";

interface BottomNavProps {
  onOpenMenu: () => void;
  menuOpen?: boolean;
}

interface NavItem {
  label: string;
  icon: string;
  path?: string;
  /** prefixos de rota que marcam este item como ativo */
  match?: string[];
  action?: "menu";
}

const ITEMS: NavItem[] = [
  { label: "Início", icon: "dashboard", path: "/admin/overview", match: ["/admin"] },
  { label: "Rebanho", icon: "pets", path: "/rebanho/lista-animais", match: ["/rebanho"] },
  { label: "Máquinas", icon: "agriculture", path: "/maquinas/visao-geral", match: ["/maquinas"] },
  { label: "Financeiro", icon: "account_balance_wallet", path: "/financeiro/visao-geral", match: ["/financeiro", "/compra-venda"] },
  { label: "Menu", icon: "menu", action: "menu" },
];

export default function BottomNav({ onOpenMenu, menuOpen }: BottomNavProps) {
  const [location, setLocation] = useLocation();

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -2px 12px rgba(15,23,42,0.06)",
      }}
    >
      <div className="grid grid-cols-5">
        {ITEMS.map(item => {
          const isMenu = item.action === "menu";
          const isActive = isMenu
            ? menuOpen
            : item.match?.some(m => location.startsWith(m)) ?? false;

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                if (isMenu) {
                  onOpenMenu();
                } else if (item.path) {
                  setLocation(item.path);
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 active:scale-[0.94] transition",
                isActive ? "text-[#0F9E97]" : "text-gray-400"
              )}
              style={{ minHeight: 56 }}
            >
              <span
                className="material-icons text-[22px] leading-none"
                style={isActive && !isMenu ? { color: FD_PRIMARY } : undefined}
              >
                {item.icon}
              </span>
              <span className="text-[10.5px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
