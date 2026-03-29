"use server";

export async function generateInviteToken(vendorId: string) {
  if (!vendorId) {
    return { ok: false, error: "Vendor ID is required." };
  }

  return {
    ok: false,
    error:
      "Magic link invites are disabled. Generate an access code and share /portal instead.",
  };
}
