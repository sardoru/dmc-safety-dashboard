import { createContext, useContext, useState, type ReactNode } from 'react';
import type { UserProfile } from '../types';

interface ProfileContextType {
  profile: UserProfile | null;
  setProfile: (p: UserProfile | null) => void;
  isRegistered: boolean;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

function loadProfile(): UserProfile | null {
  try {
    const saved = localStorage.getItem('dmc-profile');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile | null>(loadProfile);

  const setProfile = (p: UserProfile | null) => {
    setProfileState(p);
    if (p) {
      localStorage.setItem('dmc-profile', JSON.stringify(p));
    } else {
      localStorage.removeItem('dmc-profile');
    }
  };

  return (
    <ProfileContext.Provider value={{ profile, setProfile, isRegistered: !!profile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextType {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
