import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { menuItems, type MenuItem } from "@/lib/data";

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
          <span className="material-icons text-[20px]">{item.icon}</span>
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
              src="/manus-storage/icon-rebanho-sidebar-v3_c7170531.png"
              alt="Rebanho"
              width="18"
              height="18"
              className="mr-3 flex-shrink-0"
              style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
            />
          ) : (
            <span className="material-icons text-[18px] mr-3 opacity-90">{item.icon}</span>
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
  const [collapsed, setCollapsed] = useState(false);
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
        <div className="h-[48px] flex items-center px-3 border-b border-white/10">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/fd-logo-new-icon-hDRpA4ewivnQJS943anC5c.webp"
                alt="Fazenda Digital"
                className="h-[36px] w-[36px] object-contain"
              />
              <div className="flex flex-col" style={{ lineHeight: 1 }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: "13px", letterSpacing: "0.05em", color: "white" }}>FAZENDA</span>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                  <span style={{ flex: 1, height: "1px", background: "#1BC5BD", opacity: 0.6 }} />
                  <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "9px", letterSpacing: "0.2em", color: "#1BC5BD" }}>DIGITAL</span>
                  <span style={{ flex: 1, height: "1px", background: "#1BC5BD", opacity: 0.6 }} />
                </div>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              if (window.innerWidth < 1024 && onMobileClose) {
                onMobileClose();
              } else {
                setCollapsed(!collapsed);
              }
            }}
            className={`${collapsed ? "mx-auto" : "ml-auto"} text-white/60 hover:text-white p-1`}
          >
            <span className="material-icons text-[18px]">{collapsed ? "chevron_right" : "chevron_left"}</span>
          </button>
        </div>

        {/* Menu label */}
        {!collapsed && (
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[11px] text-white/50 font-medium">Menu</span>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-white/50 hover:text-white hidden md:block"
            >
              <span className="material-icons text-[16px]">chevron_left</span>
            </button>
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
          <div className="px-3 py-3 border-t border-white/10 text-[9px] text-white/30 text-center leading-tight">
            Desenvolvido por Fazenda Digital<br />© Copyright 2026
            <br />
            <span className="text-white/40">build 2026-06-08-19h00</span>
          </div>
        )}
      </aside>
    </>
  );
}
