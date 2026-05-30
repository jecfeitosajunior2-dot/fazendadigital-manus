import { useState, useEffect } from "react";
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
          className={`w-full flex items-center justify-center py-3 transition-colors ${
            isActive || isChildActive ? "text-white bg-white/10" : "text-white/70 hover:text-white hover:bg-white/5"
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
        className={`w-full flex items-center text-[13px] transition-colors ${
          depth === 0 ? "px-4 py-2.5" : "pl-10 pr-4 py-[7px]"
        } ${
          isActive
            ? "text-white bg-[#4ECDC4]/20 font-medium border-l-2 border-[#4ECDC4]"
            : isChildActive
            ? "text-white bg-[#4ECDC4]/10"
            : "text-white/80 hover:text-white hover:bg-white/5"
        }`}
      >
        {item.icon && depth === 0 && (
          <span className="material-icons text-[18px] mr-3 opacity-90">{item.icon}</span>
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

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-50 md:z-auto
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
          ${collapsed ? "w-[60px]" : "w-[220px]"}
          h-screen md:min-h-screen flex flex-col transition-all duration-200 flex-shrink-0
        `}
        style={{ backgroundColor: "#3D4E5C", backgroundImage: "linear-gradient(180deg, #3D4E5C 0%, #2D5A5A 100%)" }}
      >
        {/* Logo area */}
        <div className="h-[48px] flex items-center px-3 border-b border-white/10">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/optigado-logo-main-mXWXN4srP6kxgWxXHn5rhA.webp" alt="Fazenda Digital" className="h-[32px] w-[32px] rounded-md object-cover" />
              <div className="flex flex-col leading-tight">
                <span className="font-extrabold text-[14px]" style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 800, letterSpacing: "0.03em" }}>
                  <span className="text-white">Fazenda</span><span style={{ color: "#4ECDC4" }}>Digital</span>
                </span>
                <span className="text-white/50 text-[9px] font-medium" style={{ fontFamily: "'Manrope', sans-serif" }}>Inteligência Pecuária</span>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              if (window.innerWidth < 768 && onMobileClose) {
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
          </div>
        )}
      </aside>
    </>
  );
}
