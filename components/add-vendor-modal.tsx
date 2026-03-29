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
import { CheckCircle2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { createVendorAction } from "@/app/actions/vendor-actions";

type AddVendorModalProps = {
  trigger?: React.ReactNode;
};

export function AddVendorModal({ trigger }: AddVendorModalProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [successToken, setSuccessToken] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("email", email.trim());
    const result = await createVendorAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccessToken(result.token || null);
    router.refresh();
  }

  const inviteUrl = successToken ? `${window.location.origin}/external/assessment/${successToken}` : "";

  const handleCopy = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // Clear states on close
      setTimeout(() => {
        setSuccessToken(null);
        setName("");
        setEmail("");
        setError(null);
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? <Button type="button">Invite vendor</Button>}
      </DialogTrigger>
      <DialogContent>
        {successToken ? (
          <div className="space-y-6 py-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                Invitation Sent
              </DialogTitle>
              <DialogDescription>
                A secure assessment link has been generated for <strong>{name}</strong>.
                You can copy this link and send it to their security contact.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Unique Assessment Link</Label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
                <code className="flex-1 truncate text-xs font-mono text-slate-600 dark:text-slate-400">
                  {inviteUrl}
                </code>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleCopy}
                  className={cn("h-8 shrink-0", copied && "text-emerald-600")}
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] italic text-slate-400">
                Link expires in 14 days. This link grants exclusive access to this vendor's assessment.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)} className="w-full">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Invite vendor</DialogTitle>
              <DialogDescription>
                Send an assessment invitation. The vendor will receive NIS2-aligned
                security questions via AVRA. Data is stored in your AVRA database.
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
                />
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
                />
              </div>
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
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
                {pending ? "Saving…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
