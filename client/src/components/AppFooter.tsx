export default function AppFooter() {
  return (
    <footer
      className="relative z-0 shrink-0 px-4 py-2.5 text-center text-[11px] leading-snug"
      style={{
        backgroundColor: "var(--app-shell-bg)",
        color: "rgba(248, 250, 252, 0.88)",
      }}
    >
      Fazenda Digital © {new Date().getFullYear()} · Gestão Pecuária Inteligente
    </footer>
  );
}
