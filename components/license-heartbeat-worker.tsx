"use client";

import { useEffect } from "react";

export function LicenseHeartbeatWorker() {
  useEffect(() => {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const timer = setInterval(() => {
      fetch("/api/license/sync", { method: "POST" }).catch(() => { /* non-fatal */ });
    }, TWENTY_FOUR_HOURS);
    return () => clearInterval(timer);
  }, []);
  return null;
}
