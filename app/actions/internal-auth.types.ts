export type InternalSignInState = {
  error: string | null;
  /** Set on success. The client performs window.location.href to bust the RSC cache. */
  redirectTo?: string;
};
