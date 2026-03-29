export type PortalActionState = {
  error: string | null;
};

export const initialPortalActionState: PortalActionState = {
  error: null,
};

export type SendInviteState =
  | { status: "idle";  error: null }
  | { status: "error"; error: string }
  | { status: "sent";  maskedPhone: string; error: null };

export const initialSendInviteState: SendInviteState = { status: "idle", error: null };
