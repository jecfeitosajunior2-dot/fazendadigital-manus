import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { menuItems, type MenuItem } from "@/lib/data";

const CUSTOM_SIDEBAR_ICONS = new Set([
  "fd_panel_chart",
  "fd_rocket",
  "fd_farm_land",
  "__calf__",
  "fd_supply_bag",
  "fd_tractor",
  "fd_management_checklist",
  "fd_dna",
  "fd_nutrition_grass",
  "fd_cart",
  "fd_finance_cycle",
  "fd_admin_gear_check",
  "fd_reports_doc_chart",
]);

function SidebarIcon({ icon, className = "" }: { icon: string; className?: string }) {
  if (icon === "fd_panel_chart") {
    return (
      <svg
        viewBox="0 0 26 26"
        aria-hidden="true"
        className={className}
        fill="currentColor"
        shapeRendering="geometricPrecision"
      >
        <rect x="4" y="4" width="3" height="18" rx="1.5" />
        <rect x="4" y="19" width="18" height="3" rx="1.5" />
        <rect x="9" y="15" width="3" height="4" rx="1" />
        <rect x="14" y="12" width="3" height="7" rx="1" />
        <rect x="19" y="9" width="3" height="10" rx="1" />
        <path d="M9.55 12.95 13.6 8.9l3.05 3.05L21.2 6.4l1.95 1.62-6.35 7.75-3.2-3.2-2.15 2.15Z" />
        <path d="M18.65 5.45H23a1 1 0 0 1 1 1v4.35l-2.85-2.85Z" />
      </svg>
    );
  }

  if (icon === "fd_rocket") {
    return (
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
      >
        <path
          d="M13.05 25.2a10.15 10.15 0 1 0-.48-18.08"
          strokeWidth="2.7"
        />
        <path
          d="M16.55 4.15h4.95"
          strokeWidth="2.7"
        />
        <path
          d="M19.02 4.15v2.95"
          strokeWidth="2.2"
        />
        <path
          d="M18.15 18.95 22.8 14.3"
          strokeWidth="3"
        />
        <circle cx="17.15" cy="19.95" r="2.05" fill="currentColor" strokeWidth="0" />
        <path
          d="M3.75 11.85h7.85"
          strokeWidth="2.7"
        />
        <path
          d="M2.85 16.2h6.05"
          strokeWidth="2.7"
          opacity=".9"
        />
        <path
          d="M5.25 20.55h7.95"
          strokeWidth="2.7"
          opacity=".95"
        />
      </svg>
    );
  }

  if (icon === "fd_farm_land") {
    return (
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={className}
        fill="none"
        shapeRendering="geometricPrecision"
      >
        <path
          d="M7.2 14.1 16 6.85l8.8 7.25"
          stroke="currentColor"
          strokeWidth="2.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9.4 13.7v12.15h13.2V13.7L16 8.25Z" fill="currentColor" />
        <rect x="13.55" y="12.1" width="2.25" height="2.5" rx=".25" fill="currentColor" opacity=".35" />
        <rect x="16.25" y="12.1" width="2.25" height="2.5" rx=".25" fill="currentColor" opacity=".35" />
        <path d="M12.6 18.05h6.8v7.8h-6.8Z" fill="currentColor" opacity=".35" />
        <path
          d="M12.6 18.05 19.4 25.85M19.4 18.05 12.6 25.85M16 18.05v7.8"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "__calf__") {
    return (
      <img
        src="/assets/icon-nascimentos-green.png"
        alt=""
        aria-hidden="true"
        className={className}
        style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
      />
    );
  }

  if (icon === "fd_supply_bag") {
    return (
      <img
        src="/assets/icon-insumo-saco-green.png"
        alt=""
        aria-hidden="true"
        className={className}
        style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
      />
    );
  }

  if (icon === "fd_tractor") {
    return (
      <img
        src="/assets/icon-maquina-trator-green.png"
        alt=""
        aria-hidden="true"
        className={className}
        style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
      />
    );
  }

  if (icon === "fd_management_checklist") {
    return (
      <img
        src="/assets/icon-manejo-checklist-green.png"
        alt=""
        aria-hidden="true"
        className={className}
        style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
      />
    );
  }

  if (icon === "fd_dna") {
    return (
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
      >
        <path
          d="M9.2 3.9c0 6.1 13.6 6.1 13.6 12.1S9.2 22 9.2 28.1"
          strokeWidth="2.6"
        />
        <path
          d="M22.8 3.9c0 6.1-13.6 6.1-13.6 12.1s13.6 6 13.6 12.1"
          strokeWidth="2.6"
          opacity=".72"
        />
        <path d="M11.1 6.2h9.8" strokeWidth="1.95" />
        <path d="M12.15 10.45h6.4" strokeWidth="1.95" opacity=".86" />
        <path d="M13.65 14.7h4.7" strokeWidth="1.95" />
        <path d="M13.65 17.3h4.7" strokeWidth="1.95" opacity=".72" />
        <path d="M12.15 21.55h6.4" strokeWidth="1.95" />
        <path d="M11.1 25.8h9.8" strokeWidth="1.95" opacity=".86" />
        <path d="M22.55 6.2h1.65" strokeWidth="1.95" />
        <path d="M20.25 10.45h1.65" strokeWidth="1.95" opacity=".86" />
        <path d="M19.95 21.55h1.65" strokeWidth="1.95" />
        <path d="M22.55 25.8h1.65" strokeWidth="1.95" opacity=".86" />
      </svg>
    );
  }

  if (icon === "fd_nutrition_grass") {
    return (
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={className}
        fill="currentColor"
        shapeRendering="geometricPrecision"
      >
        <path
          d="M15.15 27.8c.18-7.65.18-15.95 1-23.6 1.18 7.35 1.13 15.7.7 23.6h-1.7Z"
        />
        <path
          d="M13.8 27.75C12.3 19.1 9.05 11.55 4.9 6.25c5.7 4.35 10.1 12.85 10.7 21.5h-1.8Z"
        />
        <path
          d="M16.55 27.75c.65-8.35 4.15-16.25 9.55-21.6-3.85 6.15-6.5 13.45-7.65 21.6h-1.9Z"
        />
        <path
          d="M11.85 27.75C9.55 22.4 5.75 18.9 1.85 17.95c5.6-.45 10.4 3.55 13.05 9.8h-3.05Z"
        />
        <path
          d="M17.15 27.75c2.9-6.2 7.65-9.55 13-9.9-4.25 1.65-7.75 5.3-9.9 9.9h-3.1Z"
        />
        <path
          d="M14.55 27.8c-.7-5.25-2.3-10.15-4.8-14.4 3.85 3.15 6.25 8.3 6.35 14.4h-1.55Z"
          opacity=".92"
        />
        <path
          d="M16.25 27.8c.45-5.65 2.4-10.45 5.45-14.05-1.85 4.25-3.05 8.95-3.75 14.05h-1.7Z"
          opacity=".92"
        />
        <path
          d="M7.55 26.9h16.9c.75 0 1.35.58 1.35 1.3 0 .72-.6 1.3-1.35 1.3H7.55c-.75 0-1.35-.58-1.35-1.3 0-.72.6-1.3 1.35-1.3Z"
        />
      </svg>
    );
  }

  if (icon === "fd_cart") {
    return (
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
      >
        <path
          d="M5.1 8.65h18.25L20.1 20.1H7.15L5.1 8.65Z"
          strokeWidth="2.8"
        />
        <path
          d="M23.35 8.65 26.9 3.35h2.45"
          strokeWidth="2.9"
        />
        <path
          d="M20.1 20.1c3.35 1.85 4.4 3.75 3.15 5.75H6.55"
          strokeWidth="2.9"
        />
        <path d="M9.7 9.25v10.3" strokeWidth="2" opacity=".9" />
        <path d="M14.2 9.25v10.3" strokeWidth="2" opacity=".9" />
        <path d="M18.7 9.25v10.3" strokeWidth="2" opacity=".9" />
        <path d="M6 13.45h15.95" strokeWidth="2" opacity=".9" />
        <path d="M6.8 17.45h14.05" strokeWidth="2" opacity=".9" />
        <circle cx="9.25" cy="28.15" r="2.2" strokeWidth="2.6" />
        <circle cx="22.35" cy="28.15" r="2.2" strokeWidth="2.6" />
      </svg>
    );
  }

  if (icon === "fd_finance_cycle") {
    return (
      <img
        src="/assets/icon-financeiro-ciclo-green.png"
        alt=""
        aria-hidden="true"
        className={className}
        style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
      />
    );
  }

  if (icon === "fd_admin_gear_check") {
    return (
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
      >
        <path
          d="M14.05 3.3h3.9l.55 3.05c.78.21 1.52.51 2.2.9l2.55-1.78 2.76 2.76-1.78 2.55c.39.68.69 1.42.9 2.2l3.05.55v3.9l-3.05.55a9.46 9.46 0 0 1-.9 2.2l1.78 2.55-2.76 2.76-2.55-1.78c-.68.39-1.42.69-2.2.9l-.55 3.05h-3.9l-.55-3.05a9.46 9.46 0 0 1-2.2-.9l-2.55 1.78-2.76-2.76 1.78-2.55a9.46 9.46 0 0 1-.9-2.2l-3.05-.55v-3.9l3.05-.55c.21-.78.51-1.52.9-2.2L5.99 8.23l2.76-2.76 2.55 1.78c.68-.39 1.42-.69 2.2-.9l.55-3.05Z"
          strokeWidth="2.15"
        />
        <circle cx="16" cy="15.45" r="6.15" strokeWidth="2.15" opacity=".92" />
        <path
          d="M12.65 15.65 15.05 18.05 20.15 12.9"
          strokeWidth="2.65"
        />
      </svg>
    );
  }

  if (icon === "fd_reports_doc_chart") {
    return (
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
      >
        <path
          d="M7.4 3.65h12.05L25.9 10.1v18.25H7.4V3.65Z"
          strokeWidth="2.25"
        />
        <path
          d="M19.45 3.65v6.45h6.45"
          strokeWidth="2.25"
        />
        <path d="M10.95 8.95h5.85" strokeWidth="2.15" opacity=".92" />
        <path d="M10.95 12.8h7.5" strokeWidth="2.15" opacity=".92" />
        <path d="M10.95 25.2h12.35" strokeWidth="2.25" />
        <path d="M11.6 20.3v4.9" strokeWidth="2.45" />
        <path d="M15.25 17.7v7.5" strokeWidth="2.45" />
        <path d="M18.9 21.25v3.95" strokeWidth="2.45" />
        <path d="M22.55 18.85v6.35" strokeWidth="2.45" />
        <path
          d="M12.25 19.25 15.25 16.75l3.65 2.95 4.15-4.55"
          strokeWidth="2.05"
        />
        <circle cx="12.25" cy="19.25" r="1.05" fill="currentColor" strokeWidth="0" />
        <circle cx="15.25" cy="16.75" r="1.05" fill="currentColor" strokeWidth="0" />
        <circle cx="18.9" cy="19.7" r="1.05" fill="currentColor" strokeWidth="0" />
        <circle cx="23.05" cy="15.15" r="1.05" fill="currentColor" strokeWidth="0" />
      </svg>
    );
  }

  return <span className={`material-icons ${className}`}>{icon}</span>;
}

function MenuItemComponent({ item, depth = 0, collapsed, currentPath }: { item: MenuItem; depth?: number; collapsed: boolean; currentPath: string }) {
  const [, setLocation] = useLocation();
  const hasChildren = item.children && item.children.length > 0;
  const isActive = item.path === currentPath;
  const isChildActive = item.children?.some(c => c.path === currentPath) || false;
  const [open, setOpen] = useState(isChildActive);

  useEffect(() => {
    if (isChildActive) setOpen(true);
  }, [isChildActive]);

  const handleClick = () => {
    if (hasChildren) {
      setOpen(!open);
    } else if (item.path) {
      setLocation(item.path);
    }
  };

  if (collapsed && depth === 0) {
    return (
      <div className="relative group">
        <button
          onClick={handleClick}
          style={{ minHeight: 48 }}
          className={`w-full flex items-center justify-center py-3 transition-colors ${
            isActive || isChildActive ? "text-white bg-[#1BC5BD]/20" : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <SidebarIcon
            icon={item.icon}
            className={`${CUSTOM_SIDEBAR_ICONS.has(item.icon) ? "h-[26px] w-[26px]" : "h-5 w-5 text-[20px]"} text-current`}
          />
        </button>
        <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
          {item.label}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleClick}
        style={{ minHeight: depth === 0 ? 48 : 44 }}
        className={`w-full flex items-center text-[13px] transition-colors ${
          depth === 0 ? "px-4 py-2.5" : "pl-10 pr-4 py-[7px]"
        } ${
          isActive
            ? depth > 0
              ? "text-[#1BC5BD] font-semibold bg-white/5"
              : "text-white bg-[#1BC5BD]/20 font-medium border-l-2 border-[#1BC5BD]"
            : isChildActive
            ? "text-white bg-[#1BC5BD]/10"
            : "text-white/80 hover:text-white hover:bg-white/5"
        }`}
      >
        {item.icon && depth === 0 && (
          item.icon === 'pets' ? (
            <img
              src="/assets/icon-rebanho-sidebar.png"
              alt="Rebanho"
              width="26"
              height="26"
              className="mr-3 flex-shrink-0"
              style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
            />
          ) : (
            <SidebarIcon
              icon={item.icon}
              className={`${CUSTOM_SIDEBAR_ICONS.has(item.icon) ? "h-[26px] w-[26px]" : "h-[18px] w-[18px] text-[18px]"} mr-3 opacity-90 text-current`}
            />
          )
        )}
        {depth > 0 && <span className="w-[5px] h-[5px] rounded-full bg-white/40 mr-3 flex-shrink-0" />}
        <span className="flex-1 text-left truncate">{item.label}</span>
        {hasChildren && (
          <span className="material-icons text-[16px] opacity-60 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}>
            expand_more
          </span>
        )}
      </button>
      {hasChildren && open && !collapsed && (
        <div className="bg-black/10">
          {item.children!.map((child, i) => (
            <MenuItemComponent key={i} item={child} depth={depth + 1} collapsed={collapsed} currentPath={currentPath} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const collapsed = false;
  const [location] = useLocation();

  // Fecha o menu mobile APENAS quando a rota muda (navegação).
  // IMPORTANTE: depender somente de `location`. Incluir `mobileOpen` aqui
  // fazia o menu fechar no mesmo instante em que era aberto.
  const prevLocation = useRef(location);
  useEffect(() => {
    if (prevLocation.current !== location) {
      prevLocation.current = location;
      onMobileCloseRef.current?.();
    }
  }, [location]);

  // Mantém a referência mais recente de onMobileClose sem retrigar o effect acima
  const onMobileCloseRef = useRef(onMobileClose);
  useEffect(() => {
    onMobileCloseRef.current = onMobileClose;
  }, [onMobileClose]);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          style={{ touchAction: 'none' }}
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          h-screen flex flex-col flex-shrink-0
          max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50
          lg:relative lg:z-auto
          transition-[width,transform] duration-200 ease-out
          ${mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"}
          lg:translate-x-0
          ${collapsed ? "w-[60px]" : "w-[220px]"}
        `}
        style={{ backgroundColor: "#0F172A", backgroundImage: "linear-gradient(180deg, #0F172A 0%, #0D1B2A 100%)" }}
      >
        {/* Logo area */}
        <div className="h-[58px] flex items-center px-4 border-b border-white/10">
          {!collapsed && (
            <div className="flex w-full items-center gap-1.5">
              <div
                className="grid place-items-center shrink-0"
                style={{
                  width: "44px",
                  height: "44px",
                }}
              >
                <img
                  src="/assets/brand/fd-symbol-final-aligned.png"
                  alt="Fazenda Digital"
                  className="h-[44px] w-[44px] object-contain"
                  style={{
                    objectPosition: "center",
                    filter: "saturate(0.74) contrast(1.01) brightness(0.97)",
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0 items-center" style={{ lineHeight: 1, width: "118px" }}>
                <span style={{ width: "100%", textAlign: "center", fontFamily: "'Inter', sans-serif", fontWeight: 820, fontSize: "15px", letterSpacing: "0.058em", color: "white", textShadow: "0 4px 18px rgba(0,0,0,0.18)" }}>FAZENDA</span>
                <div style={{ width: "104px", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", marginTop: "5px" }}>
                  <span style={{ width: "18px", height: "1px", background: "linear-gradient(90deg, transparent, rgba(120,214,207,0.64))" }} />
                  <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: "9px", letterSpacing: "0.255em", color: "#78D6CF", transform: "translateX(1px)" }}>DIGITAL</span>
                  <span style={{ width: "18px", height: "1px", background: "linear-gradient(90deg, rgba(120,214,207,0.64), transparent)" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Menu label */}
        {!collapsed && (
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[11px] text-white/50 font-medium">Menu</span>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto pb-2 scrollbar-thin">
          {menuItems.map((item, i) => (
            <MenuItemComponent key={i} item={item} collapsed={collapsed} currentPath={location} />
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-3 py-3 border-t border-white/10 text-[10px] text-white/30 text-center leading-snug">
            Fazenda Digital © {new Date().getFullYear()}<br />
            Gestão Pecuária Inteligente
          </div>
        )}
      </aside>
    </>
  );
}
