"use client";

import * as React from "react";
import type { UserRole } from "@prisma/client";

export type ClientAuthSession = {
  userId: string;
  role: UserRole;
  companyId: string | null;
  vendorId: string | null;
  email: string | null;
  displayName: string | null;
} | null;

const AuthSessionContext = React.createContext<ClientAuthSession>(null);

export function AuthSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: ClientAuthSession;
}) {
  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): ClientAuthSession {
  return React.useContext(AuthSessionContext);
}