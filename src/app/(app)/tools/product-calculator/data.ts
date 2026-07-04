// Product data ported from the reference calculator (happy-family-calculator.html).
// Tier keys: r=Retail, d=Distributor 25%, c=Senior Consultant 35%,
// q=Qualifying Producer 42%, u=Supervisor 50%.

export type TierKey = "r" | "d" | "c" | "q" | "u";

export interface TieredProduct {
  id: string;
  n: string;
  s: string;
  vp: number;
  r: number;
  d: number;
  c: number;
  q: number;
  u: number;
  flat?: false;
}

export interface FlatProduct {
  id: string;
  n: string;
  s: string;
  vp: number;
  price: number;
  flat: true;
}

export type Product = TieredProduct | FlatProduct;

export function priceOf(p: Product, tier: TierKey): number {
  return p.flat ? p.price : p[tier];
}

export const POPULAR: Product[] = [
  { id: "pop-f1", n: "奶昔", s: "Shake / F1", vp: 23.95, r: 212.03, d: 163.55, c: 144.16, q: 130.58, u: 115.07 },
  { id: "pop-tea51", n: "小茶", s: "Small Tea 51g", vp: 19.95, r: 177.25, d: 136.72, c: 120.51, q: 109.16, u: 96.19 },
  { id: "pop-tea102", n: "大茶", s: "Big Tea 102g", vp: 34.95, r: 307.14, d: 236.91, c: 208.82, q: 189.16, u: 166.68 },
  { id: "pop-aloe", n: "芦荟", s: "Aloe Vera", vp: 24.95, r: 228.15, d: 175.98, c: 155.12, q: 140.51, u: 123.81 },
  { id: "pop-f3", n: "F3", s: "Protein Powder", vp: 17.95, r: 174.41, d: 136.18, c: 120.89, q: 110.19, u: 97.95 },
  { id: "pop-nite", n: "夜宁新", s: "Niteworks", vp: 48.75, r: 421.62, d: 325.22, c: 286.66, q: 259.66, u: 228.81 },
  { id: "pop-omega", n: "鱼油", s: "Omega 3 Fish Oil", vp: 25.75, r: 209.19, d: 161.36, c: 142.22, q: 128.83, u: 113.52 },
  { id: "pop-nrg", n: "NRG", s: "NRG Guarana", vp: 14.75, r: 130.4, d: 100.58, c: 88.66, q: 80.31, u: 70.77 },
  { id: "pop-fibre", n: "纤维饮", s: "Mixed Fibres", vp: 22.95, r: 203.0, d: 156.58, c: 138.02, q: 125.02, u: 110.17 },
];

export const OTHER: Product[] = [
  { id: "oth-f1select", n: "纯植物", s: "F1 Select", vp: 30.65, r: 293.96, d: 226.74, c: 199.86, q: 181.04, u: 159.53 },
  { id: "oth-immu", n: "ImmuLift", s: "ImmuLift", vp: 9.5, r: 82.64, d: 63.74, c: 56.19, q: 50.9, u: 44.85 },
  { id: "oth-collagen", n: "胶原蛋白", s: "Collagen Plus", vp: 43.55, r: 372.04, d: 286.97, c: 252.95, q: 229.13, u: 201.9 },
  { id: "oth-turmerix", n: "TurmeriX", s: "TurmeriX 336mg", vp: 22.3, r: 196.99, d: 151.95, c: 133.93, q: 121.32, u: 106.9 },
  { id: "oth-multivit", n: "综合维他命", s: "Multivitamins", vp: 19.95, r: 144.8, d: 111.69, c: 98.45, q: 89.18, u: 78.58 },
  { id: "oth-calcium", n: "钙片", s: "Calcium Plus", vp: 10.25, r: 88.32, d: 68.12, c: 60.05, q: 54.39, u: 47.93 },
  { id: "oth-celactivo", n: "Celactivo", s: "Celactivo", vp: 20.5, r: 166.3, d: 128.27, c: 113.06, q: 102.42, u: 90.25 },
  { id: "oth-garlic", n: "香蒜片", s: "Garlic Plus", vp: 12.95, r: 107.59, d: 82.99, c: 73.15, q: 66.26, u: 58.39 },
  { id: "oth-tcformula", n: "TC Formula", s: "TC Formula", vp: 32.95, r: 271.95, d: 209.77, c: 184.89, q: 167.48, u: 147.58 },
  { id: "oth-nrg", n: "NRG", s: "NRG Guarana", vp: 14.75, r: 130.4, d: 100.58, c: 88.66, q: 80.31, u: 70.77 },
  { id: "oth-cr7", n: "CR7 Drive", s: "CR7 Drive", vp: 24.9, r: 212.64, d: 167.19, c: 149.01, q: 136.28, u: 121.73 },
  { id: "oth-h24sport", n: "H24 Sport", s: "H24 F1 Sport", vp: 28.0, r: 243.97, d: 188.19, c: 165.87, q: 150.26, u: 132.4 },
  { id: "oth-rspro", n: "RS Pro", s: "RS Pro Energy", vp: 68.45, r: 640.95, d: 504.72, c: 450.23, q: 412.08, u: 368.49 },
  { id: "oth-retreat", n: "Herbal Retreat", s: "Herbal Retreat", vp: 37.65, r: 325.6, d: 251.15, c: 221.37, q: 200.53, u: 176.7 },
  { id: "oth-coffee", n: "金质咖啡", s: "Protein Coffee", vp: 30.55, r: 249.24, d: 192.25, c: 169.46, q: 153.5, u: 135.26 },
];

export const OUTER: Product[] = [
  { id: "out-cleanserdry", n: "芦荟洁面乳(干性)", s: "Aloe Cleanser Dry", vp: 16.75, r: 128.37, d: 99.02, c: 87.28, q: 79.06, u: 69.66 },
  { id: "out-cleanseroily", n: "柑橘洁面乳(油性)", s: "Citrus Cleanser Oily", vp: 16.75, r: 128.37, d: 99.02, c: 87.28, q: 79.06, u: 69.66 },
  { id: "out-toner50", n: "活力草本爽肤水50ml", s: "Herbal Toner 50ml", vp: 12.7, r: 100.69, d: 77.67, c: 68.46, q: 62.01, u: 54.64 },
  { id: "out-serum", n: "淡化细纹精华素", s: "Line Minimizing Serum", vp: 37.7, r: 298.32, d: 230.11, c: 202.83, q: 183.73, u: 161.9 },
  { id: "out-dailyglow", n: "焕肤滋润霜", s: "Daily Glow Moisturizer", vp: 28.4, r: 224.6, d: 173.24, c: 152.7, q: 138.32, u: 121.89 },
  { id: "out-eyegel", n: "结实眼胶", s: "Firming Eye Gel", vp: 26.35, r: 208.48, d: 160.81, c: 141.74, q: 128.39, u: 113.14 },
  { id: "out-eyecream", n: "保湿眼霜", s: "Hydrating Eye Cream", vp: 26.35, r: 208.48, d: 160.81, c: 141.74, q: 128.39, u: 113.14 },
  { id: "out-claymask", n: "纯净薄荷黏土面膜", s: "Mint Clay Mask", vp: 14.2, r: 112.66, d: 86.9, c: 76.6, q: 69.38, u: 61.14 },
  { id: "out-nightcream", n: "焕肤晚霜", s: "Replenishing Night Cream", vp: 28.4, r: 224.6, d: 173.24, c: 152.7, q: 138.32, u: 121.89 },
  { id: "out-toner150", n: "活力草本爽肤水150ml", s: "Herbal Toner 150ml", vp: 32.3, r: 256.95, d: 198.2, c: 174.7, q: 158.25, u: 139.44 },
  { id: "out-spf30", n: "防晒日霜SPF30", s: "Protective Moisturizer", vp: 28.4, r: 224.6, d: 173.24, c: 152.7, q: 138.32, u: 121.89 },
  { id: "out-vitmask", n: "维他命面膜-保湿", s: "Vitamin Facial Mask", vp: 9.5, r: 80.71, d: 62.94, c: 55.83, q: 50.86, u: 45.17 },
  { id: "out-bodywash", n: "草本芦荟沐浴露", s: "Herbal Aloe Body Wash", vp: 8.3, r: 53.03, d: 40.9, c: 36.05, q: 32.66, u: 28.78 },
  { id: "out-soothinggel", n: "草本芦荟舒缓凝胶", s: "Herbal Aloe Soothing Gel", vp: 8.3, r: 53.03, d: 40.9, c: 36.05, q: 32.66, u: 28.78 },
  { id: "out-bodycream", n: "草本芦荟乳液", s: "Herbal Aloe Body Cream", vp: 8.3, r: 53.03, d: 40.9, c: 36.05, q: 32.66, u: 28.78 },
  { id: "out-shampoo", n: "芦荟洗发露", s: "Aloe Strengthening Shampoo", vp: 8.3, r: 53.03, d: 40.9, c: 36.05, q: 32.66, u: 28.78 },
  { id: "out-conditioner", n: "芦荟护发乳", s: "Aloe Strengthening Conditioner", vp: 8.3, r: 53.03, d: 40.9, c: 36.05, q: 32.66, u: 28.78 },
];

// Promo tools: flat / uniform retail price regardless of tier (统一零售价).
export const PROMO: Product[] = [
  { id: "pr-spoon1", n: "量匙 (1个)", s: "Measuring Spoon x1", vp: 0.1, price: 3.9, flat: true },
  { id: "pr-spoon10", n: "量匙 (10个套装)", s: "Measuring Spoon x10", vp: 1.2, price: 36.7, flat: true },
  { id: "pr-shaker1", n: "HLN摇摇杯 (1个)", s: "HLN Shaker Cup x1", vp: 0.33, price: 12.98, flat: true },
  { id: "pr-shaker5", n: "HLN摇摇杯 (5个套装)", s: "HLN Shaker Cup x5", vp: 1.65, price: 58.81, flat: true },
  { id: "pr-bottle1l", n: "1L Tritan水瓶", s: "1L Tritan Water Bottle", vp: 1.25, price: 41.27, flat: true },
  { id: "pr-bottle2l", n: "2L Tritan水瓶", s: "2L Tritan Water Bottle", vp: 1.45, price: 48.87, flat: true },
  { id: "pr-hdp", n: "会员包", s: "Herbalife Distributor Pack", vp: 0, price: 97.24, flat: true },
];

// 'oth-nrg' and 'pop-nrg' share an id prefix collision risk but are distinct
// ids, so both are addressable independently — matches the original site.
export const ALL_PRODUCTS: Product[] = [...POPULAR, ...OTHER, ...OUTER, ...PROMO];
export const PRODUCT_BY_ID: Record<string, Product> = Object.fromEntries(
  ALL_PRODUCTS.map((p) => [p.id, p])
);

export const TIERS: { key: TierKey; top: string; bottom: string }[] = [
  { key: "r", top: "零售", bottom: "Retail" },
  { key: "d", top: "25%", bottom: "直销商" },
  { key: "c", top: "35%", bottom: "资深顾问" },
  { key: "q", top: "42%", bottom: "合格生产者" },
  { key: "u", top: "50%", bottom: "直销领班" },
];

export const TIER_NAME: Record<TierKey, string> = {
  r: "零售价 Retail",
  d: "直销商 Distributor 25%",
  c: "资深顾问 Senior Consultant 35%",
  q: "合格生产者 Qualifying Producer 42%",
  u: "直销领班 Supervisor 50%",
};

export function fmtRM(n: number): string {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function fmtVP(n: number): string {
  // Strip trailing zeros like the original site (9.50 -> 9.5, 28.00 -> 28).
  return String(Math.round(n * 100) / 100);
}
