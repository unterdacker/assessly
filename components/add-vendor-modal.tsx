"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AddVendorModalProps = {
  trigger?: React.ReactNode;
};

export function AddVendorModal({ trigger }: AddVendorModalProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    let hasError = false;
    if (!name.trim()) {
      setNameError("Organization name is required.");
      hasError = true;
    } else {
      setNameError(null);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setEmailError("Security contact email is required.");
      hasError = true;
    } else if (!emailRegex.test(email.trim())) {
      setEmailError("Please enter a valid email address.");
      hasError = true;
    } else {
      setEmailError(null);
    }

    if (hasError) return;

    setPending(true);
    try {
      const formData = new FormData();
      formData.set("name", name.trim());
      formData.set("email", email.trim());
      const res = await fetch("/api/vendors/create", {
        method: "POST",
        body: formData,
      });
      const result = (await res.json()) as { ok: boolean; error?: string };
      if (!result.ok) {
        setEmailError(result.error ?? "Could not save vendor. Try again.");
        return;
      }
      router.refresh();
      handleOpenChange(false);
    } catch {
      setEmailError("Could not save vendor. Try again.");
    } finally {
      setPending(false);
    }
  }

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // Clear states on close
      setTimeout(() => {
        setName("");
        setEmail("");
        setNameError(null);
        setEmailError(null);
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? <Button type="button">Invite vendor</Button>}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Invite vendor</DialogTitle>
            <DialogDescription>
              Send an assessment invitation. The vendor will receive NIS2-aligned
              security questions via Venshield. Data is stored in your Venshield database.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="vendor-name">Organization name</Label>
              <Input
                id="vendor-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Cloud Ltd"
                autoComplete="organization"
                required
                disabled={pending}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "vendor-name-error" : undefined}
              />
              {nameError ? (
                <p id="vendor-name-error" data-slot="form-message" role="alert" className="text-sm text-destructive">
                  {nameError}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-email">Security contact email</Label>
              <Input
                id="vendor-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="security@vendor.example"
                autoComplete="email"
                required
                disabled={pending}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? "vendor-email-error" : undefined}
              />
              {emailError ? (
                <p id="vendor-email-error" data-slot="form-message" role="alert" className="text-sm text-destructive">
                  {emailError}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
