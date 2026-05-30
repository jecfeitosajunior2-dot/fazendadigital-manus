import React, { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

// ============================================================
// LAYOUT WRAPPER
// ============================================================

function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="p-4 max-w-7xl mx-auto">{children}</div>;
}

// ============================================================
// MÓDULO FAZENDAS
// ============================================================

export function FarmsOverviewPage() {
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data: fazendaList = [], isLoading } = trpc.fazendas.list.useQuery();
  const deleteMutation = trpc.fazendas.delete.useMutation({
    onSuccess: () => { utils.fazendas.list.invalidate(); toast.success("Fazenda excluída!"); },
    onError: (e) => toast.error(e.message),
  });
  const totalArea = fazendaList.reduce((s: number, f: any) => s + parseFloat(f.area || "0"), 0);
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Visão Geral das Fazendas</h1>
        <button onClick={() => setLocation("/fazendas/cadastro")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Fazenda
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <span className="material-icons text-[20px] text-green-600">home_work</span>
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-800">{isLoading ? "..." : fazendaList.length}</div>
              <div className="text-[11px] text-gray-500">Fazendas cadastradas</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="material-icons text-[20px] text-blue-600">landscape</span>
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-800">{isLoading ? "..." : `${totalArea.toFixed(0)} ha`}</div>
              <div className="text-[11px] text-gray-500">Área total</div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Fazenda</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Cidade/Estado</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Área (ha)</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Responsável</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">Carregando...</td></tr>}
            {!isLoading && fazendaList.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Nenhuma fazenda cadastrada. Clique em "Nova Fazenda" para começar.</td></tr>}
            {fazendaList.map((f: any) => (
              <tr key={f.id} className="border-t border-gray-50 hover:bg-gray-50/50 relative">
                <td className="px-3 py-2 text-[#4ECDC4] font-medium">{f.nome}</td>
                <td className="px-3 py-2 text-gray-700">{[f.cidade, f.estado].filter(Boolean).join("/") || "-"}</td>
                <td className="px-3 py-2 text-right text-gray-700">{f.area || "-"}</td>
                <td className="px-3 py-2 text-right text-gray-700">{f.responsavel || "-"}</td>
                <td className="px-3 py-2 text-center relative">
                  <button onClick={() => setMenuOpen(menuOpen === f.id ? null : f.id)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                  {menuOpen === f.id && (
                    <div className="absolute right-2 top-7 z-50 bg-white border border-gray-200 rounded shadow-lg min-w-[120px]">
                      <button onClick={() => { setLocation(`/fazendas/cadastro?id=${f.id}`); setMenuOpen(null); }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-gray-50 flex items-center gap-2">
                        <span className="material-icons text-[13px] text-blue-500">edit</span> Editar
                      </button>
                      <button onClick={() => { if (confirm("Excluir esta fazenda?")) { deleteMutation.mutate({ id: f.id }); setMenuOpen(null); } }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-red-50 text-red-600 flex items-center gap-2">
                        <span className="material-icons text-[13px]">delete</span> Excluir
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function FarmsListPage() {
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data: fazendaList = [], isLoading } = trpc.fazendas.list.useQuery();
  const deleteMutation = trpc.fazendas.delete.useMutation({
    onSuccess: () => { utils.fazendas.list.invalidate(); toast.success("Fazenda excluída!"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Fazendas</h1>
        <button onClick={() => setLocation("/fazendas/cadastro")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Fazenda
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Cidade</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Área (ha)</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">Carregando...</td></tr>}
            {!isLoading && fazendaList.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Nenhuma fazenda cadastrada.</td></tr>}
            {fazendaList.map((f: any) => (
              <tr key={f.id} className="border-t border-gray-50 hover:bg-gray-50/50 relative">
                <td className="px-3 py-2 text-[#4ECDC4] font-medium">{f.nome}</td>
                <td className="px-3 py-2 text-gray-700">{f.cidade || "-"}</td>
                <td className="px-3 py-2 text-gray-700">{f.estado || "-"}</td>
                <td className="px-3 py-2 text-right text-gray-700">{f.area || "-"}</td>
                <td className="px-3 py-2 text-center relative">
                  <button onClick={() => setMenuOpen(menuOpen === f.id ? null : f.id)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                  {menuOpen === f.id && (
                    <div className="absolute right-2 top-7 z-50 bg-white border border-gray-200 rounded shadow-lg min-w-[120px]">
                      <button onClick={() => { setLocation(`/fazendas/cadastro?id=${f.id}`); setMenuOpen(null); }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-gray-50 flex items-center gap-2">
                        <span className="material-icons text-[13px] text-blue-500">edit</span> Editar
                      </button>
                      <button onClick={() => { if (confirm("Excluir esta fazenda?")) { deleteMutation.mutate({ id: f.id }); setMenuOpen(null); } }} className="w-full text-left px-3 py-2 text-[11px] hover:bg-red-50 text-red-600 flex items-center gap-2">
                        <span className="material-icons text-[13px]">delete</span> Excluir
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function SubdivisionsPage() {
  const subdivisions = [
    { name: "Pasto 1", area: "40.00", type: "Pasto", animals: 32 },
    { name: "Pasto 2", area: "35.00", type: "Pasto", animals: 28 },
    { name: "Pasto 3", area: "50.00", type: "Pasto", animals: 41 },
    { name: "Pasto 4", area: "45.00", type: "Pasto", animals: 35 },
    { name: "Retiro Norte", area: "60.00", type: "Retiro", animals: 22 },
    { name: "Retiro Sul", area: "55.00", type: "Retiro", animals: 18 },
    { name: "Confinamento", area: "10.00", type: "Confinamento", animals: 40 },
    { name: "Maternidade", area: "15.00", type: "Maternidade", animals: 12 },
    { name: "Curral", area: "2.00", type: "Curral", animals: 0 },
    { name: "Reserva Legal", area: "80.00", type: "Reserva", animals: 0 },
    { name: "APP", area: "30.00", type: "Reserva", animals: 0 },
    { name: "Sede", area: "28.00", type: "Sede", animals: 15 },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Subdivisões</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Subdivisão
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Área (ha)</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Animais</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {subdivisions.map((s, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{s.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{s.type}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.area}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.animals}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
          Exibindo 1-{subdivisions.length} de {subdivisions.length} itens
        </div>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO REBANHO
// ============================================================

export function HerdOverviewPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">Visão Geral do Rebanho</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {[
          { label: "Total de animais", value: "243", icon: "pets", color: "green" },
          { label: "Machos", value: "108", icon: "male", color: "blue" },
          { label: "Fêmeas", value: "135", icon: "female", color: "pink" },
          { label: "Peso médio", value: "385 kg", icon: "monitor_weight", color: "amber" },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-${kpi.color}-100 flex items-center justify-center`}>
                <span className={`material-icons text-[20px] text-${kpi.color}-600`}>{kpi.icon}</span>
              </div>
              <div>
                <div className="text-[18px] font-bold text-gray-800">{kpi.value}</div>
                <div className="text-[11px] text-gray-500">{kpi.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <h2 className="text-[13px] font-medium text-gray-800 mb-3">Distribuição por atividade</h2>
          <div className="space-y-2">
            {[
              { label: "Cria", value: 145, pct: 60 },
              { label: "Engorda", value: 52, pct: 21 },
              { label: "Recria", value: 46, pct: 19 },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[11px] text-gray-600 w-20">{item.label}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${item.pct}%`, backgroundColor: "#4ECDC4" }} />
                </div>
                <span className="text-[11px] text-gray-700 font-medium w-8 text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <h2 className="text-[13px] font-medium text-gray-800 mb-3">Distribuição por raça</h2>
          <div className="space-y-2">
            {[
              { label: "Nelore", value: 200, pct: 82 },
              { label: "Angus", value: 25, pct: 10 },
              { label: "Senepol", value: 18, pct: 8 },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[11px] text-gray-600 w-20">{item.label}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${item.pct}%`, backgroundColor: "#FF9800" }} />
                </div>
                <span className="text-[11px] text-gray-700 font-medium w-8 text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export function HerdMapPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Mapa do Rebanho</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">swap_horiz</span>
          Nova Movimentação
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Subdivisão</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Machos</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Fêmeas</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Total</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Capacidade</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Pasto 1", m: 12, f: 20, cap: 40 },
              { name: "Pasto 2", m: 10, f: 18, cap: 35 },
              { name: "Pasto 3", m: 15, f: 26, cap: 50 },
              { name: "Retiro Norte", m: 8, f: 14, cap: 30 },
              { name: "Confinamento", m: 25, f: 15, cap: 50 },
              { name: "Maternidade", m: 0, f: 12, cap: 20 },
              { name: "Sede", m: 5, f: 10, cap: 25 },
            ].map((s, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{s.name}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.m}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.f}</td>
                <td className="px-3 py-1.5 text-right font-medium text-gray-800">{s.m + s.f}</td>
                <td className="px-3 py-1.5 text-right text-gray-500">{s.cap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function LotsPage() {
  const lots = [
    { name: "Lote Vacas", animals: 69, activity: "Cria", subdivision: "Pasto 1" },
    { name: "Lote Bezerros (as)", animals: 50, activity: "Cria", subdivision: "Maternidade" },
    { name: "Lote Engorda", animals: 52, activity: "Engorda", subdivision: "Confinamento" },
    { name: "Lote Recria", animals: 46, activity: "Recria", subdivision: "Pasto 3" },
    { name: "Lote novilhas da estação", animals: 26, activity: "Cria", subdivision: "Pasto 2" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Gestão de Lotes</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Novo Lote
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lote</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Atividade</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Subdivisão</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Animais</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-[#4ECDC4] font-medium cursor-pointer hover:underline">{lot.name}</td>
                <td className="px-3 py-1.5 text-gray-700">{lot.activity}</td>
                <td className="px-3 py-1.5 text-gray-500">{lot.subdivision}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{lot.animals}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
          Exibindo 1-{lots.length} de {lots.length} itens
        </div>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO MANEJOS
// ============================================================

function ManagementTabs({ active }: { active: string }) {
  const tabs = ["Meus Manejos", "Criar Manejo", "Listar Manejos", "Manejos Básicos"];
  const paths = ["/manejos/meus", "/manejos/criar", "/manejos/listar", "/manejos/basicos"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function MyManagementsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Meus Manejos</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Novo Manejo
        </button>
      </div>
      <ManagementTabs active="Meus Manejos" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">assignment</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum manejo atribuído a você</p>
      </div>
    </AppLayout>
  );
}

export function CreateManagementPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Criar Manejo</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Cancelar
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            Salvar
          </button>
        </div>
      </div>
      <ManagementTabs active="Criar Manejo" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Tipo de manejo</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700">
              <option>Sanitário</option>
              <option>Reprodutivo</option>
              <option>Pesagem</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Data</label>
            <input type="date" className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Lote</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700">
              <option>Selecione um lote</option>
              <option>Lote Vacas</option>
              <option>Lote Engorda</option>
              <option>Lote Recria</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Responsável</label>
            <input type="text" placeholder="Digite o nome" className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700" />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-[11px] text-gray-600 font-medium mb-1">Observações</label>
          <textarea rows={3} className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 resize-none" placeholder="Notas adicionais..." />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            <span className="material-icons text-[14px]">add</span>
            Adicionar
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

export function ListManagementsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Listar Manejos</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Novo Manejo
        </button>
      </div>
      <ManagementTabs active="Listar Manejos" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lote</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Animais</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Responsável</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-gray-400">Sem Dados</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function BasicManagementsPage() {
  const basics = [
    { name: "Vacinação Aftosa", type: "Sanitário", frequency: "Semestral" },
    { name: "Vermifugação", type: "Sanitário", frequency: "Trimestral" },
    { name: "Pesagem", type: "Pesagem", frequency: "Mensal" },
    { name: "IATF", type: "Reprodutivo", frequency: "Anual" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Manejos Básicos</h1>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
          Clonar
        </button>
      </div>
      <ManagementTabs active="Manejos Básicos" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Frequência</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {basics.map((b, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{b.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{b.type}</td>
                <td className="px-3 py-1.5 text-gray-500">{b.frequency}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO INSUMOS
// ============================================================

function SuppliesTabs({ active }: { active: string }) {
  const tabs = ["Lista de Produtos", "Movimentação", "Monitorados", "Abaixo do Limite"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <button
          key={i}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function SuppliesEntriesPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Insumos - Entradas</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Nova Movimentação
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Cadastrar Produto
          </button>
        </div>
      </div>
      <SuppliesTabs active="Movimentação" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">inventory_2</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de entrada encontrado</p>
      </div>
    </AppLayout>
  );
}

export function SuppliesExitsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Insumos - Saídas</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Movimentação
        </button>
      </div>
      <SuppliesTabs active="Movimentação" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">inventory_2</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de saída encontrado</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO MÁQUINAS
// ============================================================

export function MachineryFuelingPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Abastecimento</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Novo Abastecimento
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Filtros
          </button>
        </div>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Máquina</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Combustível</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Litros</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Custo</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-gray-400">Sem Dados</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function MachineryMaintenancePage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Manutenção</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Manutenção
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">build</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de manutenção</p>
      </div>
    </AppLayout>
  );
}

export function MachineryListPage() {
  const machines = [
    { name: "Trator John Deere 5075", type: "Trator", year: "2020", plate: "-" },
    { name: "Caminhonete Hilux", type: "Veículo", year: "2022", plate: "ABC-1234" },
    { name: "Pulverizador 600L", type: "Implemento", year: "2019", plate: "-" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Máquinas</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Cadastrar Máquina
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Ano</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Placa</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {machines.map((m, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{m.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{m.type}</td>
                <td className="px-3 py-1.5 text-gray-700">{m.year}</td>
                <td className="px-3 py-1.5 text-gray-500">{m.plate}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO REPRODUÇÃO
// ============================================================

function ReproductionTabs({ active }: { active: string }) {
  const tabs = ["Estoque Biológico", "Exposição", "Colheitas"];
  const paths = ["/reproducao/protocolos", "/reproducao/semen", "/reproducao/embrioes"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function ReproductionProtocolsPage() {
  const stock = [
    { name: "Sêmen Nelore PO", type: "Sêmen", qty: 150, batch: "LOT-2025-001" },
    { name: "Sêmen Angus", type: "Sêmen", qty: 80, batch: "LOT-2025-002" },
    { name: "Embrião Nelore", type: "Embrião", qty: 25, batch: "EMB-2025-001" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Estoque Biológico</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Movimentar Estoque
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Novo Estoque Biológico
          </button>
        </div>
      </div>
      <ReproductionTabs active="Estoque Biológico" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Quantidade</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lote</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-20">Ações</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{s.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{s.type}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.qty}</td>
                <td className="px-3 py-1.5 text-gray-500">{s.batch}</td>
                <td className="px-3 py-1.5 text-center flex items-center justify-center gap-1">
                  <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-0.5 rounded hover:bg-gray-100 text-gray-400" title="Extrato">
                    <span className="material-icons text-[14px]">receipt_long</span>
                  </button>
                  <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-0.5 rounded hover:bg-gray-100 text-gray-400" title="Desativar">
                    <span className="material-icons text-[14px]">block</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function ReproductionSemenPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Exposições</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Registrar Nascimento Sem Exposição
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Nova Exposição
          </button>
        </div>
      </div>
      <ReproductionTabs active="Exposição" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">favorite</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de exposição</p>
      </div>
    </AppLayout>
  );
}

export function ReproductionEmbryosPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Colheitas</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Colheita
        </button>
      </div>
      <ReproductionTabs active="Colheitas" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">eco</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de colheita</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO NUTRIÇÃO
// ============================================================

function NutritionTabs({ active }: { active: string }) {
  const tabs = ["Lançamento Nutrição", "Fórmula", "Lote"];
  const paths = ["/nutricao/dietas", "/nutricao/cochos", "/nutricao/cochos"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function NutritionDietsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Nutrição</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Nova Nutrição
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Nova Mistura
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Nova Fórmula
          </button>
        </div>
      </div>
      <NutritionTabs active="Lançamento Nutrição" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">restaurant</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhum lançamento de nutrição</p>
      </div>
    </AppLayout>
  );
}

export function NutritionTroughsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Fórmula</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Adicionar Insumo
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Nova Embalagem
          </button>
        </div>
      </div>
      <NutritionTabs active="Fórmula" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">science</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma fórmula cadastrada</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO COMPRA E VENDA
// ============================================================

function PurchaseSaleTabs({ active }: { active: string }) {
  const tabs = ["Borderô de Compra", "Entrada de Animais", "Vendas", "Relatório de Vendas"];
  const paths = ["/compra-venda/compras", "/compra-venda/compras", "/compra-venda/vendas", "/compra-venda/vendas"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function PurchasesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ data: "", fornecedor: "", quantidade: "", valorTotal: "", observacoes: "" });
  const { data: compras, refetch, isLoading } = trpc.compras.list.useQuery();
  const createMutation = trpc.compras.create.useMutation({
    onSuccess: () => { toast.success("Compra registrada com sucesso!"); setShowForm(false); setForm({ data: "", fornecedor: "", quantidade: "", valorTotal: "", observacoes: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.compras.delete.useMutation({
    onSuccess: () => { toast.success("Compra removida."); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <AppLayout>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Borderô de Compra</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Data</Label><Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
            <div><Label>Fornecedor</Label><Input placeholder="Nome do fornecedor" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} /></div>
            <div><Label>Quantidade de Animais</Label><Input type="number" placeholder="0" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} /></div>
            <div><Label>Valor Total (R$)</Label><Input type="number" placeholder="0.00" value={form.valorTotal} onChange={e => setForm(f => ({ ...f, valorTotal: e.target.value }))} /></div>
            <div><Label>Observações</Label><Textarea placeholder="Observações..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate({ data: form.data, fornecedor: form.fornecedor, quantidadeAnimais: parseInt(form.quantidade) || 0, valorTotal: form.valorTotal || "0", observacoes: form.observacoes })} disabled={createMutation.isPending || !form.fornecedor || !form.data}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Borderô de Compra</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">Buscar Borderôs</button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>Novo Borderô
          </button>
        </div>
      </div>
      <PurchaseSaleTabs active="Borderô de Compra" />
      {isLoading ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center"><p className="text-[12px] text-gray-400">Carregando...</p></div>
      ) : !compras?.length ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <span className="material-icons text-4xl text-gray-200 mb-2 block">shopping_cart</span>
          <p className="text-[12px] text-gray-400">Sem Dados</p>
          <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de compra</p>
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Fornecedor</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qtd</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Valor Total</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c: any) => (
                <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-gray-700">{c.data}</td>
                  <td className="px-3 py-1.5 text-gray-700 font-medium">{c.fornecedor}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{c.quantidade}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">R$ {Number(c.valorTotal).toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <button onClick={() => { if (confirm("Remover esta compra?")) deleteMutation.mutate({ id: c.id }); }} className="p-0.5 rounded hover:bg-red-50 text-red-400" title="Excluir">
                      <span className="material-icons text-[14px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}

export function SalesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ data: "", comprador: "", quantidade: "", valorTotal: "", observacoes: "" });
  const { data: vendas, refetch, isLoading } = trpc.vendas.list.useQuery();
  const createMutation = trpc.vendas.create.useMutation({
    onSuccess: () => { toast.success("Venda registrada com sucesso!"); setShowForm(false); setForm({ data: "", comprador: "", quantidade: "", valorTotal: "", observacoes: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.vendas.delete.useMutation({
    onSuccess: () => { toast.success("Venda removida."); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <AppLayout>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Nova Venda</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Data</Label><Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
            <div><Label>Comprador</Label><Input placeholder="Nome do comprador" value={form.comprador} onChange={e => setForm(f => ({ ...f, comprador: e.target.value }))} /></div>
            <div><Label>Quantidade de Animais</Label><Input type="number" placeholder="0" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} /></div>
            <div><Label>Valor Total (R$)</Label><Input type="number" placeholder="0.00" value={form.valorTotal} onChange={e => setForm(f => ({ ...f, valorTotal: e.target.value }))} /></div>
            <div><Label>Observações</Label><Textarea placeholder="Observações..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate({ data: form.data, comprador: form.comprador, quantidadeAnimais: parseInt(form.quantidade) || 0, valorTotal: form.valorTotal || "0", observacoes: form.observacoes })} disabled={createMutation.isPending || !form.comprador || !form.data}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Vendas</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">Buscar Vendas</button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>Registrar Nova Venda
          </button>
        </div>
      </div>
      <PurchaseSaleTabs active="Vendas" />
      {isLoading ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center"><p className="text-[12px] text-gray-400">Carregando...</p></div>
      ) : !vendas?.length ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <span className="material-icons text-4xl text-gray-200 mb-2 block">point_of_sale</span>
          <p className="text-[12px] text-gray-400">Sem Dados</p>
          <p className="text-[11px] text-gray-300 mt-1">Nenhum registro de venda</p>
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Comprador</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qtd</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Valor Total</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v: any) => (
                <tr key={v.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-gray-700">{v.data}</td>
                  <td className="px-3 py-1.5 text-gray-700 font-medium">{v.comprador}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{v.quantidade}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">R$ {Number(v.valorTotal).toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <button onClick={() => { if (confirm("Remover esta venda?")) deleteMutation.mutate({ id: v.id }); }} className="p-0.5 rounded hover:bg-red-50 text-red-400" title="Excluir">
                      <span className="material-icons text-[14px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}

// ============================================================
// MÓDULO FINANCEIRO
// ============================================================

function FinancialTabs({ active }: { active: string }) {
  const tabs = ["Contas", "Importar Extrato", "Movimentações", "Rateio de Custo", "Listagem Rateio", "Receita x Despesa"];
  const paths = ["/financeiro/contas", "/financeiro/movimentacao", "/financeiro/movimentacao", "/financeiro/categorias", "/financeiro/categorias", "/financeiro/pessoas"];
  return (
    <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function FinancialTransactionsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Movimentações</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4CAF50" }}>
            Lançar Receita
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#F44336" }}>
            Lançar Despesa
          </button>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Lançar Transferência
          </button>
        </div>
      </div>
      <FinancialTabs active="Movimentações" />
      {/* Navegação por mês */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <span className="material-icons text-[18px]">chevron_left</span>
        </button>
        <span className="text-[13px] font-medium text-gray-700">Maio 2026</span>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <span className="material-icons text-[18px]">chevron_right</span>
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">account_balance</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma movimentação neste período</p>
      </div>
    </AppLayout>
  );
}

export function FinancialCategoriesPage() {
  const categories = [
    { name: "Alimentação Animal", type: "Despesa", icon: "restaurant" },
    { name: "Medicamentos", type: "Despesa", icon: "medical_services" },
    { name: "Combustível", type: "Despesa", icon: "local_gas_station" },
    { name: "Mão de Obra", type: "Despesa", icon: "people" },
    { name: "Venda de Animais", type: "Receita", icon: "payments" },
    { name: "Venda de Leite", type: "Receita", icon: "water_drop" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Categorias</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Categoria
        </button>
      </div>
      <FinancialTabs active="Rateio de Custo" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Categoria</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium flex items-center gap-2">
                  <span className="material-icons text-[14px] text-gray-400">{c.icon}</span>
                  {c.name}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${c.type === "Receita" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {c.type}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function FinancialPeoplePage() {
  const people = [
    { name: "João Silva", type: "Funcionário", role: "Vaqueiro" },
    { name: "Agropecuária Central", type: "Fornecedor", role: "Insumos" },
    { name: "Frigorífico São Paulo", type: "Cliente", role: "Comprador" },
    { name: "Maria Santos", type: "Funcionário", role: "Administrativa" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Pessoas</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Pessoa
        </button>
      </div>
      <FinancialTabs active="Receita x Despesa" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Função</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((p, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{p.name}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                    p.type === "Funcionário" ? "bg-blue-100 text-blue-700" :
                    p.type === "Fornecedor" ? "bg-amber-100 text-amber-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {p.type}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-500">{p.role}</td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO RELATÓRIOS
// ============================================================

function ReportsTabs({ active }: { active: string }) {
  const tabs = ["Gerenciais", "Evolução", "Reprodutivos", "Operacionais"];
  const paths = ["/relatorios/gerenciais", "/relatorios/evolucao", "/relatorios/reprodutivos", "/relatorios/operacionais"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#4ECDC4] text-[#4ECDC4]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function ReportsManagerialPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Relatórios Gerenciais</h1>
      <ReportsTabs active="Gerenciais" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[
          { title: "Visão Geral", icon: "dashboard", desc: "Relatório geral da fazenda" },
          { title: "Mapa de Manejos", icon: "map", desc: "Mapa de atividades de manejo" },
          { title: "Custo Unitário Animal", icon: "attach_money", desc: "Custo por unidade animal" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#4ECDC4" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

export function ReportsEvolutionPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Relatórios de Evolução</h1>
      <ReportsTabs active="Evolução" />
      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Evolução de Peso", icon: "trending_up", desc: "Acompanhe o ganho de peso ao longo do tempo" },
          { title: "Evolução de Escore", icon: "star", desc: "Acompanhamento do escore de condição corporal" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#4ECDC4" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

export function ReportsReproductivePage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Relatórios Reprodutivos</h1>
      <ReportsTabs active="Reprodutivos" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[
          { title: "Índices Reprodutivos", icon: "analytics", desc: "Taxas de concepção e prenhez" },
          { title: "Reproduções", icon: "favorite", desc: "Histórico de reproduções" },
          { title: "Previsão de Partos", icon: "event", desc: "Calendário de partos previstos" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#4ECDC4" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

export function ReportsOperationalPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Relatórios Operacionais</h1>
      <ReportsTabs active="Operacionais" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[
          { title: "Movimentação de Estoque", icon: "inventory", desc: "Entradas e saídas de insumos" },
          { title: "Abastecimento", icon: "local_gas_station", desc: "Histórico de abastecimentos" },
          { title: "Manutenções", icon: "build", desc: "Registro de manutenções realizadas" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#4ECDC4" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO SIMULAÇÕES
// ============================================================

export function SimulationsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Minhas Simulações</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Simulação
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">calculate</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma simulação cadastrada</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO ADMINISTRATIVO
// ============================================================

export function AdminOverviewPage() {
  const [, setLocation] = useLocation();
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">Administrativo - Visão Geral</h1>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <h2 className="text-[13px] font-medium text-gray-800 mb-3">Benfeitorias</h2>
          <div className="text-center py-4">
            <span className="material-icons text-3xl text-gray-200">construction</span>
            <p className="text-[11px] text-gray-400 mt-2">Nenhuma benfeitoria cadastrada</p>
          </div>
          <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="w-full mt-2 flex items-center justify-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
            <span className="material-icons text-[14px]">add</span>
            Cadastrar Benfeitoria
          </button>
        </div>
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <h2 className="text-[13px] font-medium text-gray-800 mb-3">Acesso Rápido</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Cadastrar Fazenda", icon: "home_work", path: "/fazendas/cadastro" },
              { label: "Cadastrar Rebanho", icon: "pets" },
              { label: "Cadastrar Insumo", icon: "inventory_2" },
              { label: "Cadastrar Máquina", icon: "agriculture" },
            ].map((item, i) => (
              <button
                onClick={() => item.path ? setLocation(item.path) : toast.info("Funcionalidade em desenvolvimento")}
                key={i}
                className="flex items-center gap-2 px-3 py-2 rounded border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <span className="material-icons text-[16px] text-gray-400">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO SIMULAÇÕES - CONFINAMENTO / SEMI-CONFINAMENTO
// ============================================================

export function SimulationsFeedlotPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Simulação - Confinamento</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Simulação
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">calculate</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma simulação de confinamento cadastrada</p>
      </div>
    </AppLayout>
  );
}

export function SimulationsSemiFeedlotPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Simulação - Semi-Confinamento</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Nova Simulação
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">calculate</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma simulação de semi-confinamento cadastrada</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MÓDULO ADMINISTRATIVO - BENFEITORIAS
// ============================================================

export function AdministrativeOverviewPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">Benfeitorias - Visão Geral</h1>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">construction</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma benfeitoria cadastrada</p>
      </div>
    </AppLayout>
  );
}

export function ImprovementsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Lista de Benfeitorias</h1>
        <button onClick={() => toast.info("Funcionalidade em desenvolvimento")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4ECDC4" }}>
          <span className="material-icons text-[14px]">add</span>
          Cadastrar Benfeitoria
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">construction</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">Nenhuma benfeitoria cadastrada</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// ACESSO RÁPIDO
// ============================================================

export function QuickAccessPage() {
  const [, setLocation] = useLocation();
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">Acesso Rápido</h1>
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Cadastrar Fazenda", icon: "home_work", path: "/fazendas/cadastro" },
          { label: "Cadastrar Rebanho", icon: "pets", path: "/rebanho/lista-animais" },
          { label: "Cadastrar Insumo", icon: "inventory_2", path: "/insumos/estoque" },
          { label: "Cadastrar Máquina", icon: "agriculture", path: "/maquinas/lista-maquinas" },
          { label: "Lançar Manejo", icon: "assignment", path: "/manejos/criar" },
          { label: "Lançar Financeiro", icon: "account_balance", path: "/financeiro/movimentacao" },
        ].map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLocation(item.path)}
            className="flex items-center gap-3 p-4 bg-white rounded shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-left w-full"
          >
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <span className="material-icons text-[20px]" style={{ color: "#4ECDC4" }}>{item.icon}</span>
            </div>
            <span className="text-[13px] font-medium text-gray-700">{item.label}</span>
          </button>
        ))}
      </div>
    </AppLayout>
  );
}
