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
            ? "text-white bg-[#4A2524] font-medium"
            : isChildActive
            ? "text-white bg-[#4A2524]/60"
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

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  return (
    <aside
      className={`${collapsed ? "w-[60px]" : "w-[220px]"} min-h-screen flex flex-col transition-all duration-200 flex-shrink-0`}
      style={{ backgroundColor: "#3C1B1A" }}
    >
      {/* Logo area */}
      <div className="h-[48px] flex items-center px-3 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="material-icons text-[22px]" style={{ color: "#8BC34A" }}>pets</span>
            <span className="text-white font-medium text-[14px]">iRancho</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`${collapsed ? "mx-auto" : "ml-auto"} text-white/60 hover:text-white p-1`}
        >
          <span className="material-icons text-[18px]">{collapsed ? "chevron_right" : "chevron_left"}</span>
        </button>
      </div>

      {/* Menu label */}
      {!collapsed && (
        <div className="px-4 pt-3 pb-1">
          <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Menu</span>
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
          Desenvolvido por iRancho<br />© Copyright 2026
        </div>
      )}
    </aside>
  );
}
