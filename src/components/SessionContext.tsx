"use client";

import { createContext, useContext } from "react";
import type { ShopSettings, UserProfile } from "@/lib/auth";

interface SessionContextValue {
  profile: UserProfile;
  settings: ShopSettings;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  profile,
  settings,
  children,
}: {
  profile: UserProfile;
  settings: ShopSettings;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={{ profile, settings }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useAppSession() {
  return useContext(SessionContext);
}
