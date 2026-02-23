import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RadioEntry } from '../types';
import { generateRadioEntry, generateInitialRadioEntries } from '../data/mockRadio';

interface RadioContextType {
  entries: RadioEntry[];
  isLive: boolean;
  toggleLive: () => void;
}

const RadioContext = createContext<RadioContextType | null>(null);

export function RadioProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<RadioEntry[]>(() => generateInitialRadioEntries(10));
  const [isLive, setIsLive] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isLive) {
      const delay = 5000 + Math.random() * 5000;
      intervalRef.current = setInterval(() => {
        setEntries(prev => {
          const next = [...prev, generateRadioEntry()];
          return next.length > 200 ? next.slice(-200) : next;
        });
      }, delay);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLive]);

  const toggleLive = () => setIsLive(l => !l);

  return (
    <RadioContext.Provider value={{ entries, isLive, toggleLive }}>
      {children}
    </RadioContext.Provider>
  );
}

export function useRadio(): RadioContextType {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error('useRadio must be used within RadioProvider');
  return ctx;
}
