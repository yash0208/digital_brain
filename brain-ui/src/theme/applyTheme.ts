import { colors } from "./colors";
import { spacing } from "./spacing";
import { typography } from "./typography";

export const applyThemeVariables = () => {
  const root = document.documentElement;
  root.style.setProperty("--obs-bg", colors.background);
  root.style.setProperty("--obs-bg-alt", colors.backgroundAlt);
  root.style.setProperty("--obs-surface", colors.surface);
  root.style.setProperty("--obs-border", colors.border);
  root.style.setProperty("--obs-text", colors.textPrimary);
  root.style.setProperty("--obs-text-muted", colors.textMuted);
  root.style.setProperty("--obs-accent", colors.accent);
  root.style.setProperty("--font-family-base", typography.fontFamily);
  root.style.setProperty("--font-size-xs", typography.sizeXs);
  root.style.setProperty("--font-size-sm", typography.sizeSm);
  root.style.setProperty("--font-size-md", typography.sizeMd);
  root.style.setProperty("--font-size-lg", typography.sizeLg);
  root.style.setProperty("--space-xs", spacing.xs);
  root.style.setProperty("--space-sm", spacing.sm);
  root.style.setProperty("--space-md", spacing.md);
  root.style.setProperty("--space-lg", spacing.lg);
  root.style.setProperty("--radius-sm", spacing.radiusSm);
  root.style.setProperty("--radius-md", spacing.radiusMd);
  root.style.setProperty("--radius-pill", spacing.radiusPill);
};
