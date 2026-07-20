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

const SECTIONS: { key: SectionKey; label: string; products: Product[] }[] = [
  { key: "other", label: "More Products", products: OTHER },
  { key: "outer", label: "💆 Outer Nutrition", products: OUTER },
  { key: "promo", label: "🛒 Promo Tools (Flat Retail Price)", products: PROMO },
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
        <h1 className={styles.disp}>Product VP Calculator</h1>
        <p>Herbalife Malaysia Product Price Calculator · Tap a product to add it</p>
      </div>

      <div className={styles.wrap}>
        <div className={styles.panel}>
          <p className={styles.panelLabel}>Price Tier</p>
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

        <p className={styles.popTitle}>Popular Products</p>
        <div className={styles.grid}>
          {POPULAR.map((p) => (
            <ProductCard key={p.id} p={p} tier={tier} qty={cart[p.id] ?? 0} onAdd={addItem} />
          ))}
        </div>

        {SECTIONS.map((section) => (
          <div key={section.key}>
            <div className={styles.catToggle} onClick={() => toggleSection(section.key)}>
              <span className={styles.chev}>{openSections[section.key] ? "▲" : "▼"}</span>{" "}
              {section.label}
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
            <span className={styles.st}>Selected</span>
            <button className={styles.clearLink} onClick={clearAll}>
              Clear All
            </button>
          </div>

          {cartEntries.length === 0 ? (
            <div className={styles.emptyCart}>
              No products added yet.
              <br />
              Tap a product above to add it.
            </div>
          ) : (
            <div>
              {cartEntries.map((e) => (
                <div key={e.p.id} className={styles.cartRow}>
                  <div className={styles.crName}>
                    <div className={styles.nm}>{e.p.s}</div>
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
            <p className={styles.totalLine}>Total RM</p>
            <div className={styles.totalRm}>{fmtRM(totalRM)}</div>
            <p className={styles.totalLine}>Total VP</p>
            <div className={styles.totalVp}>{fmtVP(totalVP)} VP</div>
            <button className={styles.btnShare} onClick={() => setReceiptOpen(true)}>
              📋 Share Summary
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
            <h3 className={styles.disp}>Product VP Calculator</h3>
            <p>Herbalife Malaysia · Product Order</p>
            <div className={styles.rTierBadge}>{TIER_NAME[tier]}</div>
          </div>
          <div className={styles.rList}>
            {cartEntries.length === 0 ? (
              <div className={styles.emptyCart}>No products</div>
            ) : (
              cartEntries.map((e) => (
                <div key={e.p.id} className={styles.rLine}>
                  <span className={styles.rn}>
                    {e.p.s}
                    {e.qty > 1 ? ` x${e.qty}` : ""}
                  </span>
                  <span className={styles.ramt}>RM {fmtRM(priceOf(e.p, tier) * e.qty)}</span>
                </div>
              ))
            )}
          </div>
          <div className={styles.rTotals}>
            <p className={styles.totalLine}>Total RM</p>
            <div className={styles.totalRm}>{fmtRM(totalRM)}</div>
            <p className={styles.totalLine}>Total VP</p>
            <div className={styles.totalVp}>{fmtVP(totalVP)} VP</div>
          </div>
          <button className={styles.rClose} onClick={() => setReceiptOpen(false)}>
            ✕ Close
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
      <div className={styles.cName}>{p.s}</div>
      {p.flat && <div className={styles.cFlat}>Flat Retail Price</div>}
      <div className={styles.cPriceRow}>
        <span className={styles.cRm}>RM {fmtRM(priceOf(p, tier))}</span>
        <span className={styles.cVp}>{fmtVP(p.vp)} VP</span>
      </div>
    </div>
  );
}
