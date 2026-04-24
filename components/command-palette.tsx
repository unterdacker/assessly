"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type VendorItem = {
  id: string;
  name: string;
  serviceType: string | null;
};

type PaletteItem = {
  id: string;
  label: string;
  path: string;
  group: "navigation" | "vendors";
};

type CommandPaletteProps = {
  locale: string;
};

export function CommandPalette({ locale }: CommandPaletteProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const t = useTranslations("commandPalette");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [vendors, setVendors] = React.useState<VendorItem[]>([]);
  const [vendorsLoaded, setVendorsLoaded] = React.useState(false);
  const [loadingVendors, setLoadingVendors] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const navItems = React.useMemo(
    () => [
      { label: t("navigation.dashboard"), path: `/${locale}/dashboard` },
      { label: t("navigation.vendors"), path: `/${locale}/vendors` },
      { label: t("navigation.settings"), path: `/${locale}/settings` },
      { label: t("navigation.auditLogs"), path: `/${locale}/admin/audit-logs` },
    ],
    [locale, t],
  );

  const isExternal = pathname.startsWith(`/${locale}/external/`);
  const isAuth = pathname.startsWith(`/${locale}/auth/`);
  const isVendorInvite = pathname.startsWith(`/${locale}/vendor/accept-invite`);
  const isDisabledRoute = isExternal || isAuth || isVendorInvite;

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isDisabledRoute) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDisabledRoute]);

  React.useEffect(() => {
    if (isDisabledRoute || !open || vendorsLoaded || loadingVendors) {
      return;
    }

    let mounted = true;
    setLoadingVendors(true);

    fetch("/api/vendors/names", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return { ok: false, vendors: [] as VendorItem[] };
        }
        return (await response.json()) as { ok: boolean; vendors: VendorItem[] };
      })
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setVendors(Array.isArray(payload.vendors) ? payload.vendors : []);
        setVendorsLoaded(true);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setVendors([]);
        setVendorsLoaded(true);
      })
      .finally(() => {
        if (mounted) {
          setLoadingVendors(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isDisabledRoute, open, vendorsLoaded, loadingVendors]);

  const items = React.useMemo<PaletteItem[]>(() => {
    const needle = query.trim().toLowerCase();
    const filteredNav = navItems.filter((item) => item.label.toLowerCase().includes(needle));
    const filteredVendors = vendors.filter((vendor) => {
      const haystack = `${vendor.name} ${vendor.serviceType ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });

    return [
      ...filteredNav.map((item) => ({
        id: `nav-${item.path}`,
        label: item.label,
        path: item.path,
        group: "navigation" as const,
      })),
      ...filteredVendors.map((vendor) => ({
        id: `vendor-${vendor.id}`,
        label: vendor.name,
        path: `/${locale}/vendors/${vendor.id}/assessment`,
        group: "vendors" as const,
      })),
    ];
  }, [locale, navItems, query, vendors]);

  React.useEffect(() => {
    if (items.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= items.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, items.length]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }

    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [open]);

  const activeItem = items[activeIndex] ?? null;
  const listId = "command-palette-results";
  const activeOptionId = activeItem ? `command-palette-option-${activeItem.id}` : undefined;

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length > 0) {
        setActiveIndex((current) => (current + 1) % items.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length > 0) {
        setActiveIndex((current) => (current - 1 + items.length) % items.length);
      }
      return;
    }

    if (event.key === "Enter") {
      if (!activeItem) {
        return;
      }
      event.preventDefault();
      router.push(activeItem.path);
      setOpen(false);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  if (isDisabledRoute) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 dark:bg-slate-950/60" />
        <Dialog.Content
          className="fixed left-1/2 top-24 z-50 w-[min(92vw,36rem)] -translate-x-1/2 rounded-lg border border-slate-200 bg-card shadow-xl dark:border-slate-800"
          aria-label="Command Palette"
        >
          <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
          <div className="border-b border-border px-3 py-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={t("placeholder")}
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={activeOptionId}
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {loadingVendors ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">{t("loadingVendors")}</p>
            ) : items.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">{t("noResults")}</p>
            ) : (
              <ul id={listId} role="listbox" className="space-y-2">
                <li role="presentation" className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("groupNavigation")}
                </li>
                {items
                  .filter((item) => item.group === "navigation")
                  .map((item) => {
                    const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
                    const selected = itemIndex === activeIndex;
                    const optionId = `command-palette-option-${item.id}`;

                    return (
                      <li
                        id={optionId}
                        key={item.id}
                        role="option"
                        aria-selected={selected}
                        className={cn(
                          "cursor-pointer rounded-md px-2 py-2 text-sm",
                          selected
                            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                            : "text-foreground hover:bg-muted",
                        )}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={() => {
                          router.push(item.path);
                          setOpen(false);
                        }}
                      >
                        {item.label}
                      </li>
                    );
                  })}

                <li role="presentation" className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("groupVendors")}
                </li>
                {items
                  .filter((item) => item.group === "vendors")
                  .map((item) => {
                    const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
                    const selected = itemIndex === activeIndex;
                    const optionId = `command-palette-option-${item.id}`;

                    return (
                      <li
                        id={optionId}
                        key={item.id}
                        role="option"
                        aria-selected={selected}
                        className={cn(
                          "cursor-pointer rounded-md px-2 py-2 text-sm",
                          selected
                            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                            : "text-foreground hover:bg-muted",
                        )}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={() => {
                          router.push(item.path);
                          setOpen(false);
                        }}
                      >
                        {item.label}
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
