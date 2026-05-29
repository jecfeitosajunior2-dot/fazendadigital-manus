import React, { createContext, useContext, useState } from 'react';

export interface CattleRecord {
  id: number;
  number: string;
  electronicId: string;
  birthDate: string;
  sex: 'Macho' | 'Fêmea';
  breed: string;
  lot: string;
  activity: string;
  sanitaryStatus: 'Vacinado' | 'Não Vacinado' | 'Pendente';
  lastVaccine?: string;
  salePrice?: number;
  saleDate?: string;
  financialStatus: 'Ativo' | 'Vendido' | 'Descartado';
}

interface CattleContextType {
  cattle: CattleRecord[];
  setCattle: (cattle: CattleRecord[]) => void;
  addCattle: (cattle: CattleRecord[]) => void;
  clearCattle: () => void;
  getCattleStats: () => {
    total: number;
    vaccinated: number;
    notVaccinated: number;
    pending: number;
    sold: number;
    active: number;
    discarded: number;
    totalRevenue: number;
    averagePrice: number;
  };
}

const CattleContext = createContext<CattleContextType | undefined>(undefined);

export const CattleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cattle, setCattle] = useState<CattleRecord[]>([]);

  const addCattle = (newCattle: CattleRecord[]) => {
    setCattle(prev => [...prev, ...newCattle]);
  };

  const clearCattle = () => {
    setCattle([]);
  };

  const getCattleStats = () => {
    const total = cattle.length;
    const vaccinated = cattle.filter(c => c.sanitaryStatus === 'Vacinado').length;
    const notVaccinated = cattle.filter(c => c.sanitaryStatus === 'Não Vacinado').length;
    const pending = cattle.filter(c => c.sanitaryStatus === 'Pendente').length;
    const sold = cattle.filter(c => c.financialStatus === 'Vendido').length;
    const active = cattle.filter(c => c.financialStatus === 'Ativo').length;
    const discarded = cattle.filter(c => c.financialStatus === 'Descartado').length;
    
    const totalRevenue = cattle
      .filter(c => c.salePrice)
      .reduce((sum, c) => sum + (c.salePrice || 0), 0);
    
    const averagePrice = sold > 0 ? totalRevenue / sold : 0;

    return {
      total,
      vaccinated,
      notVaccinated,
      pending,
      sold,
      active,
      discarded,
      totalRevenue,
      averagePrice,
    };
  };

  return (
    <CattleContext.Provider value={{ cattle, setCattle, addCattle, clearCattle, getCattleStats }}>
      {children}
    </CattleContext.Provider>
  );
};

export const useCattle = () => {
  const context = useContext(CattleContext);
  if (!context) {
    throw new Error('useCattle must be used within CattleProvider');
  }
  return context;
};
