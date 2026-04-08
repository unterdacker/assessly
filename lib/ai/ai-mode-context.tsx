"use client";

import { createContext, useContext } from "react";

interface AiModeContextValue {
  aiDisabled: boolean;
}

const AiModeContext = createContext<AiModeContextValue>({ aiDisabled: true });

export function AiModeProvider({
  aiDisabled,
  children,
}: {
  aiDisabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <AiModeContext.Provider value={{ aiDisabled }}>
      {children}
    </AiModeContext.Provider>
  );
}

export function useAiMode() {
  return useContext(AiModeContext);
}
