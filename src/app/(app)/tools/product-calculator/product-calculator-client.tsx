"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  OTHER,
  OUTER,
  POPULAR,
  PROMO,
  PRODUCT_BY_ID,
  TIERS,
  TIER_NAME,
  fmtRM,
  fmtVP,
  priceOf,
  type Product,
  type TierKey,
} from "./data";
import styles from "./product-calculator.module.css";

type SectionKey = "other" | "outer" | "promo";

const SECTIONS: { key: SectionKey; label: string; en: string; products: Product[] }[] = [
  { key: "other", label: "其他产品", en: "· More Products", products: OTHER },
  { key: "outer", label: "💆 外在营养护理", en: "· Outer Nutrition", products: OUTER },
  { key: "promo", label: "🛒 辅销工具", en: "· Promo Tools (统一零售价)", products: PROMO },
];

export function ProductCalculatorClient() {
  const [tier, setTier] = useState<TierKey>("d");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    other: false,
    outer: false,
    promo: false,
  });
  const [receiptOpen, setReceiptOpen] = useState(false);

  const cartEntries = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ p: PRODUCT_BY_ID[id], qty })),
    [cart]
  );
  const totalRM = cartEntries.reduce((s, e) => s + priceOf(e.p, tier) * e.qty, 0);
  const totalVP = cartEntries.reduce((s, e) => s + e.p.vp * e.qty, 0);

  function addItem(id: string) {
    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }
  function decItem(id: string) {
    setCart((prev) => {
      const next = { ...prev };
      if (!next[id]) return prev;
      next[id] -= 1;
      if (next[id] <= 0) delete next[id];
      return next;
    });
  }
  function removeItem(id: string) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }
  function clearAll() {
    setCart({});
  }
  function toggleSection(key: SectionKey) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.disp}>Happy Wellness Family</h1>
        <p>Herbalife Malaysia 产品价格计算器 · 点击添加产品</p>
      </div>

      <div className={styles.wrap}>
        <div className={styles.panel}>
          <p className={styles.panelLabel}>
            价格层级 <span className={styles.en}>/ PRICE TIER</span>
          </p>
          <div className={styles.tierRow}>
            {TIERS.map((t) => (
              <div
                key={t.key}
                className={cn(styles.tierBox, t.key === tier && styles.active)}
                onClick={() => setTier(t.key)}
              >
                <div className={styles.tTop}>{t.top}</div>
                <div className={styles.tBottom}>{t.bottom}</div>
              </div>
            ))}
          </div>
        </div>

        <p className={styles.popTitle}>
          常用产品 <span className={styles.en}>· POPULAR PRODUCTS</span>
        </p>
        <div className={styles.grid}>
          {POPULAR.map((p) => (
            <ProductCard key={p.id} p={p} tier={tier} qty={cart[p.id] ?? 0} onAdd={addItem} />
          ))}
        </div>

        {SECTIONS.map((section) => (
          <div key={section.key}>
            <div className={styles.catToggle} onClick={() => toggleSection(section.key)}>
              <span className={styles.chev}>{openSections[section.key] ? "▲" : "▼"}</span>{" "}
              {section.label} <span className={styles.en}>{section.en}</span>
            </div>
            <div className={cn(styles.catBody, openSections[section.key] && styles.open)}>
              <div className={styles.catBodyInner}>
                <div className={styles.grid}>
                  {section.products.map((p) => (
                    <ProductCard key={p.id} p={p} tier={tier} qty={cart[p.id] ?? 0} onAdd={addItem} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className={styles.panel}>
          <div className={styles.selectedHead}>
            <span className={styles.st}>
              已选产品 <span className={styles.en}>· SELECTED</span>
            </span>
            <button className={styles.clearLink} onClick={clearAll}>
              全部清除
            </button>
          </div>

          {cartEntries.length === 0 ? (
            <div className={styles.emptyCart}>
              还没有添加产品
              <br />
              点击上方产品格子添加 / Tap a product above
            </div>
          ) : (
            <div>
              {cartEntries.map((e) => (
                <div key={e.p.id} className={styles.cartRow}>
                  <div className={styles.crName}>
                    <div className={styles.nm}>{e.p.n}</div>
                    <div className={styles.sb}>{e.p.s}</div>
                  </div>
                  <div className={styles.crStep}>
                    <button onClick={() => decItem(e.p.id)}>−</button>
                    <span className={styles.crQty}>{e.qty}</span>
                    <button onClick={() => addItem(e.p.id)}>+</button>
                  </div>
                  <div className={styles.crAmt}>RM {fmtRM(priceOf(e.p, tier) * e.qty)}</div>
                  <button className={styles.crRemove} onClick={() => removeItem(e.p.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={styles.totals}>
            <p className={styles.totalLine}>
              总价格 <span className={styles.lblEn}>/ Total RM</span>
            </p>
            <div className={styles.totalRm}>{fmtRM(totalRM)}</div>
            <p className={styles.totalLine}>
              总分数 <span className={styles.lblEn}>/ Total VP</span>
            </p>
            <div className={styles.totalVp}>{fmtVP(totalVP)} VP</div>
            <button className={styles.btnShare} onClick={() => setReceiptOpen(true)}>
              📋 生成截图 / Share Summary
            </button>
          </div>
        </div>
      </div>

      <div
        className={cn(styles.overlay, receiptOpen && styles.show)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setReceiptOpen(false);
        }}
      >
        <div className={styles.receipt}>
          <div className={styles.rTop}>
            <h3 className={styles.disp}>Happy Wellness Family</h3>
            <p>Herbalife Malaysia · 产品订单 / Product Order</p>
            <div className={styles.rTierBadge}>价格层级 / {TIER_NAME[tier]}</div>
          </div>
          <div className={styles.rList}>
            {cartEntries.length === 0 ? (
              <div className={styles.emptyCart}>没有产品</div>
            ) : (
              cartEntries.map((e) => (
                <div key={e.p.id} className={styles.rLine}>
                  <div>
                    <span className={styles.rn}>
                      {e.p.n}
                      {e.qty > 1 ? ` x${e.qty}` : ""}
                    </span>
                    <span className={styles.rs}>{e.p.s}</span>
                  </div>
                  <span className={styles.ramt}>RM {fmtRM(priceOf(e.p, tier) * e.qty)}</span>
                </div>
              ))
            )}
          </div>
          <div className={styles.rTotals}>
            <p className={styles.totalLine}>
              总价格 <span className={styles.lblEn}>/ Total RM</span>
            </p>
            <div className={styles.totalRm}>{fmtRM(totalRM)}</div>
            <p className={styles.totalLine}>
              总分数 <span className={styles.lblEn}>/ Total VP</span>
            </p>
            <div className={styles.totalVp}>{fmtVP(totalVP)} VP</div>
          </div>
          <button className={styles.rClose} onClick={() => setReceiptOpen(false)}>
            ✕ 关闭 / Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  p,
  tier,
  qty,
  onAdd,
}: {
  p: Product;
  tier: TierKey;
  qty: number;
  onAdd: (id: string) => void;
}) {
  return (
    <div
      className={cn(styles.card, qty > 0 && styles.selected)}
      onClick={() => onAdd(p.id)}
    >
      {qty > 0 && <span className={styles.badge}>{qty}</span>}
      <div className={styles.cName}>{p.n}</div>
      <div className={styles.cSub}>{p.s}</div>
      {p.flat && <div className={styles.cFlat}>统一零售价</div>}
      <div className={styles.cPriceRow}>
        <span className={styles.cRm}>RM {fmtRM(priceOf(p, tier))}</span>
        <span className={styles.cVp}>{fmtVP(p.vp)} VP</span>
      </div>
    </div>
  );
}
