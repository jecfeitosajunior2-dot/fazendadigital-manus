import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";

export default function Topbar() {
  const [, setLocation] = useLocation();
  const [showUser, setShowUser] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const user = JSON.parse(localStorage.getItem("user") || '{"name":"Pedro Gomes","email":"pngomes1@gmail.com"}');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUser(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    setLocation("/entrar");
  };

  const initials = user.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-[48px] flex items-center justify-end px-4 bg-white border-b border-gray-200">
      {/* Right side: notification bell + user name + dropdown */}
      <div className="flex items-center gap-3" ref={userRef}>
        {/* Notification bell */}
        <button className="relative text-gray-500 hover:text-gray-700 p-1">
          <span className="material-icons text-[20px]">notifications_none</span>
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: "#8BC34A" }}
          >
            0
          </span>
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUser(!showUser)}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50"
          >
            {/* Avatar circle */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-medium"
              style={{ backgroundColor: "#8BC34A" }}
            >
              {initials}
            </div>
            <span className="text-[13px] text-gray-700 font-medium">{user.name}</span>
            <span className="material-icons text-[14px] text-gray-400">expand_more</span>
          </button>
          {showUser && (
            <div className="absolute right-0 top-11 w-52 bg-white rounded shadow-lg border border-gray-200 py-1 z-50">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-800">{user.name}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <span className="material-icons text-[16px] text-gray-400">person</span> Profile
              </button>
              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <span className="material-icons text-[16px] text-gray-400">settings</span> Settings
              </button>
              <hr className="my-1 border-gray-100" />
              <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                <span className="material-icons text-[16px]">logout</span> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
