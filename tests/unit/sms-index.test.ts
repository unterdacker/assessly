// SMS functionality removed in migration 20260415000000_invite_link_flow.
// These tests are no longer applicable.
// See: lib/sms/index.ts (disabled), app/actions/send-invite.ts (email-only flow)

import { describe, it } from "vitest";
describe("SMS (removed)", () => {
  it("SMS functionality has been removed", () => {
    // No-op: SMS was replaced by email invite-link flow
  });
});
