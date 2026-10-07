import {
  Droplets,
  Package,
  Pill,
  Shirt,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { PackingColorKey } from "./kind-colors";

/** 持ち物のカテゴリ, in the order they are offered: name, icon, colour key (設定 › カテゴリの色). */
export const packingCategories: [string, LucideIcon, PackingColorKey][] = [
  ["書類・お金", Wallet, "pack-docs"],
  ["衣類", Shirt, "pack-clothes"],
  ["洗面・コスメ", Droplets, "pack-toiletries"],
  ["薬", Pill, "pack-medicine"],
  ["電子機器", Smartphone, "pack-devices"],
  ["その他", Package, "pack-other"],
];
export const defaultPackingCategory = "その他";

const entry = (category: string) =>
  packingCategories.find(([name]) => name === category);

export const isListedCategory = (category: string) => Boolean(entry(category));

/** The colour key for `data-kind`; a legacy free-text category is その他's. */
export const categoryColorKey = (category: string): PackingColorKey =>
  entry(category)?.[2] ?? "pack-other";

/** A category's icon (a legacy free-text one borrows その他's). */
export function CategoryIcon({ category }: { category: string }) {
  const Icon = entry(category)?.[1] ?? Package;
  return <Icon size={16} aria-hidden="true" />;
}

/** The categories present: listed ones in list order, then legacy texts. */
export function presentCategories(categories: string[]) {
  const seen = new Set(categories);
  return [
    ...packingCategories.map(([name]) => name).filter((name) => seen.has(name)),
    ...[...seen].filter((name) => !isListedCategory(name)),
  ];
}
