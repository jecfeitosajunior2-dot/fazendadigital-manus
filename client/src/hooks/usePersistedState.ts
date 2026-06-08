import { useEffect, useState } from 'react';

export function usePersistedState<T extends object>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) return { ...initial, ...JSON.parse(raw) as Partial<T> };
    } catch {
      // ignora JSON inválido
    }
    return initial;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignora quota excedida
    }
  }, [key, state]);

  return [state, setState];
}
