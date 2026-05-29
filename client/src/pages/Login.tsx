import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const LOGIN_BG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/agrogestor_login-3fyWBB9xHpxfuqa85zQEC6.webp";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("demo@agrogestor.app");
  const [password, setPassword] = useState("preview2026");
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Bem-vindo à prévia AgroGestor Pro");
      navigate("/painel");
    }, 600);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden lg:block">
        <img
          src={LOGIN_BG}
          alt="Pasto ao amanhecer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[var(--bark)]/85 via-[var(--bark)]/40 to-transparent" />
        <div className="relative h-full flex flex-col justify-between p-10 text-[var(--paper)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[var(--harvest)] flex items-center justify-center">
              <span className="font-display text-[var(--bark)] text-xl font-bold">A</span>
            </div>
            <div>
              <p className="font-display text-xl">AgroGestor Pro</p>
              <p className="text-[10px] uppercase tracking-[0.22em] opacity-70">Edição Editorial</p>
            </div>
          </div>

          <div className="max-w-md">
            <p className="kicker text-[var(--harvest)] mb-3">Prévia · Manus</p>
            <h1 className="font-display text-4xl xl:text-5xl leading-[1.05] mb-4">
              A gestão da fazenda com a precisão de uma redação editorial.
            </h1>
            <p className="text-sm opacity-80">
              Protótipo navegável original construído a partir das melhores práticas observadas em sistemas
              modernos de pecuária. Dados fictícios para fins de demonstração.
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs opacity-70">
            <span className="font-mono">v0.9.0</span>
            <span className="editorial-rule flex-1 bg-[var(--paper)]/30" />
            <span>Demonstração</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={submit} className="w-full max-w-md surface-card p-8">
          <p className="kicker mb-2">Acesso à prévia</p>
          <h2 className="font-display text-2xl mb-6">Entrar</h2>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full mt-6 bg-[var(--moss-deep)] hover:bg-[var(--moss)] text-[var(--paper)]" disabled={loading}>
            {loading ? "Entrando…" : "Entrar na prévia"}
          </Button>

          <div className="mt-5 text-xs text-muted-foreground space-y-1">
            <p>Use as credenciais sugeridas ou clique direto em entrar.</p>
            <p className="font-mono">demo@agrogestor.app / preview2026</p>
          </div>
        </form>
      </div>
    </div>
  );
}
