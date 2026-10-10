import { z } from "zod";

// Stable persisted identifiers; theme-specific values live in this one palette.
export const listColors = [
  {
    id: "auto",
    name: "Automatisch",
    light: "var(--purple)",
    dark: "var(--purple)",
  },
  { id: "sage", name: "Salbei", light: "#48745d", dark: "#9fc5ad" },
  { id: "terracotta", name: "Terrakotta", light: "#a0513e", dark: "#d89c88" },
  { id: "ochre", name: "Ocker", light: "#86631e", dark: "#d4b577" },
  { id: "rose", name: "Altrosa", light: "#96536a", dark: "#d4a0b0" },
  { id: "mauve", name: "Mauve", light: "#805e91", dark: "#bca4cf" },
  { id: "blue", name: "Gedecktes Blau", light: "#466b93", dark: "#9eb9d6" },
  { id: "teal", name: "Petrol", light: "#327678", dark: "#8dbfc0" },
  { id: "olive", name: "Oliv", light: "#6b703e", dark: "#b8be8d" },
  { id: "sand", name: "Sand", light: "#806951", dark: "#c9b49a" },
  { id: "slate", name: "Schiefer", light: "#626c79", dark: "#acb5c1" },
] as const;
export type ListColor = (typeof listColors)[number]["id"];
export const listColorSchema = z.enum(listColors.map((c) => c.id));
export function normalizeListColor(value: unknown): ListColor {
  const parsed = listColorSchema.safeParse(value);
  return parsed.success ? parsed.data : "auto";
}
export function listColorStyle(value: unknown, shared = false) {
  const color = listColors.find((c) => c.id === normalizeListColor(value))!;
  const legacy = shared ? "var(--green)" : "var(--purple)";
  return {
    "--list-light": color.id === "auto" ? legacy : color.light,
    "--list-dark": color.id === "auto" ? legacy : color.dark,
  };
}
