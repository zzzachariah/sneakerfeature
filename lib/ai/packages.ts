export type CreditPackage = {
  id: string;
  credits: number;
  priceYuan: number;
  label: string;
};

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: "p10", credits: 10, priceYuan: 10, label: "10次 ¥10" },
  { id: "p20", credits: 20, priceYuan: 18, label: "20次 ¥18" },
  { id: "p50", credits: 50, priceYuan: 40, label: "50次 ¥40" },
  { id: "p100", credits: 100, priceYuan: 70, label: "100次 ¥70" }
];

export function getPackage(id: string): CreditPackage | null {
  return CREDIT_PACKAGES.find((pkg) => pkg.id === id) ?? null;
}
