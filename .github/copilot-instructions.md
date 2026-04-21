## Design Context

### Users
Information security officers, their teams, and CISOs at organizations subject to NIS2/DORA compliance obligations. These are experienced GRC and security management professionals — not pure engineers, but not non-technical either. They use the product during compliance review cycles and ongoing vendor monitoring. They arrive with high standards and low tolerance for noise: they need fast answers about risk posture, not a tour of interface flourishes.

### Brand Personality
**Three words: precise, grounded, trustworthy.**

The interface should feel like it was built by people who understand compliance — not by a startup trying to look enterprise. No attention-grabbing decoration. No aggressive animations. Every element present because it serves a function. The product earns confidence through restraint and consistency, not through visual flair.

### Emotional Goal
Users should feel **safe and in control** after working in the product. A CISO finishing a vendor review session should feel they have a clear, credible picture of organizational risk — not overwhelmed, not uncertain about what they're seeing. The interface should reduce cognitive load, not add to it.

### Aesthetic Direction
- **Visual tone:** Understated enterprise. Think Bloomberg terminal clarity without the darkness, or Notion's precision with more authority. Clean grid-based layouts, strong typographic hierarchy, generous white space.
- **Theme:** Light mode as primary experience. Dark mode fully supported and selectable. No decorative glass, no glowing accents, no gradients as ornamentation.
- **Motion:** Minimal. Transitions only for functional state changes (loading, expansion, navigation). Nothing decorative. Reduced-motion respected by default.
- **Anti-references:** Vibecoded SaaS apps with gradient hero sections, card grids with large rounded icons, neon-on-dark dashboards, anything that looks like a Figma community template.

### Technical Constraints
- **Framework:** Next.js 15 + React 19 + Tailwind CSS 3 + Radix UI + Framer Motion
- **Existing palette:** Indigo primary (HSL 239 84% 57%) with slate neutrals — can evolve but maintain continuity
- **Accessibility:** WCAG 2.1 AA minimum. Full keyboard navigation, focus rings, sufficient contrast ratios, reduced-motion support.
- **Fonts:** Current stack is Geist Sans + Geist Mono. Future work should explore alternatives that signal authority and precision — avoid the reflex_fonts list.

### Design Principles
1. **Hierarchy before decoration.** Risk posture, compliance status, and critical alerts must be scannable within seconds. Visual weight is earned by importance, not by styling.
2. **Restraint is craft.** Do not add an element because it looks richer. Add it because it communicates something. The absence of clutter is a design decision.
3. **Trust through consistency.** Predictable patterns, stable component behavior, no surprises. CISOs notice when an interface behaves unexpectedly — and it erodes confidence.
4. **Accessible by default.** WCAG 2.1 AA is a constraint, not a feature. Color is never the only signal. Interactive elements are keyboard-operable and screen-reader friendly.
5. **Density with breathing room.** Compliance tools carry a lot of data. Layouts should be information-dense but not claustrophobic — use whitespace to group and separate, not to decorate.
