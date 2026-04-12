# Internationalisation

## Supported Locales

| Locale | Language |
|--------|----------|
| `en` | English (default) |
| `de` | German |

---

## Implementation

Venshield uses [next-intl](https://next-intl-docs.vercel.app/) v4 for route-based internationalisation.

### Routing Configuration (`i18n/routing.ts`)

```typescript
export const routing = defineRouting({
  locales: ["de", "en"],
  defaultLocale: "en",
  localePrefix: "always",  // Every URL includes /en/ or /de/
  localeDetection: false,  // Users must explicitly choose a locale
});
```

The `localePrefix: "always"` setting ensures all URLs are fully localised (e.g. `/en/dashboard`, `/de/vendors`). There is no redirect from `/` — the root page redirects to the locale-prefixed path.

### Middleware Integration

The `createMiddleware(routing)` function from next-intl is applied first in the middleware chain, before the security and session checks. This ensures locale detection and path normalisation happens before the auth guard runs.

---

## Translation Files

| File | Language |
|------|----------|
| `messages/en.json` | English strings |
| `messages/de.json` | German strings |

### Structure

The message files are flat JSON with namespace keys:

```json
{
  "dashboard": {
    "title": "Dashboard",
    "riskPosture": "Risk Posture"
  },
  "vendors": {
    "addVendor": "Add Vendor",
    "riskLevel": "Risk Level"
  },
  "nis2": {
    "categories": {
      "governance": "Governance & Risk Management",
      "access": "Access & Identity"
    }
  }
}
```

---

## Usage in Components

### Server Components

```typescript
import { getTranslations } from "next-intl/server";

const t = await getTranslations("dashboard");
return <h1>{t("title")}</h1>;
```

### Client Components

```typescript
import { useTranslations } from "next-intl";

const t = useTranslations("vendors");
return <button>{t("addVendor")}</button>;
```

---

## Locale Toggle

The `LanguageToggle` component (`components/language-toggle.tsx`) provides a UI switcher that redirects the user to the same page in the alternate locale using next-intl's `Link` component.

---

## Adding a New Locale

1. Add the locale code to the `locales` array in `i18n/routing.ts`
2. Create `messages/<locale>.json` with all translation keys
3. Update the `LanguageToggle` component to include the new option
4. Test all routes with the new locale prefix
