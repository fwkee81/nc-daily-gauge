"use client";

import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  GOAL_LABELS,
  computeReport,
  kcalFor,
  verdictText,
  type Gender,
  type Goal,
  type ReportResult,
} from "./logic";
import styles from "./wellness-evaluation.module.css";

interface FormState {
  name: string;
  contact: string;
  date: string;
  coachName: string;
  gender: Gender;
  age: string;
  height: string;
  weight: string;
  bodyFat: string;
  water: string;
  muscle: string;
  bmr: string;
  metaAge: string;
  bone: string;
  visceral: string;
  rating: number;
}

const INITIAL_FORM: FormState = {
  name: "",
  contact: "",
  date: format(new Date(), "yyyy-MM-dd"),
  coachName: "",
  gender: "F",
  age: "",
  height: "",
  weight: "",
  bodyFat: "",
  water: "",
  muscle: "",
  bmr: "",
  metaAge: "",
  bone: "",
  visceral: "",
  rating: 5,
};

interface ReportMeta {
  name: string;
  contact: string;
  date: string;
  coachName: string;
  gender: Gender;
  age: number;
  height: number;
  weight: number;
}

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

export function WellnessEvaluationClient() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [view, setView] = useState<"form" | "report">("form");
  const [error, setError] = useState(false);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal>("maintain");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleGenerate() {
    const name = form.name.trim();
    const age = parseFloat(form.age);
    const height = parseFloat(form.height);
    const weight = parseFloat(form.weight);
    const bmr = parseFloat(form.bmr);

    if (!name || !form.gender || !age || !height || !weight || !bmr) {
      setError(true);
      return;
    }
    setError(false);

    const result = computeReport({
      gender: form.gender,
      age,
      height,
      weight,
      bmr,
      bodyFat: numOrNull(form.bodyFat),
      water: numOrNull(form.water),
      muscle: numOrNull(form.muscle),
      metaAge: numOrNull(form.metaAge),
      bone: numOrNull(form.bone),
      visceral: numOrNull(form.visceral),
      rating: form.rating,
    });

    setMeta({
      name,
      contact: form.contact.trim(),
      date: form.date,
      coachName: form.coachName.trim(),
      gender: form.gender,
      age,
      height,
      weight,
    });
    setReport(result);
    setSelectedGoal(result.autoGoal);
    setView("report");
    window.scrollTo(0, 0);
  }

  function handleExport() {
    const inIframe = window.self !== window.top;
    if (inIframe) {
      alert(
        "当前是预览模式，浏览器的打印/导出PDF功能在这里无法使用。\n\n请先把网址在手机浏览器（Safari/Chrome）直接打开，这个按钮就能正常导出PDF。"
      );
      return;
    }
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isIOSNonSafari = isIOS && /CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIOSNonSafari) {
      alert(
        "iPhone 上的 Chrome / Firefox / Edge 不支持打印功能，这是苹果系统的限制（只有 Safari 有这个权限）。\n\n请改用 Safari 打开这个网页，再按一次「⬇ PDF」即可。"
      );
      return;
    }
    try {
      window.print();
    } catch {
      alert("导出PDF时发生问题，请改用浏览器分享/打印功能手动导出。");
    }
  }

  if (view === "report" && report && meta) {
    const kcal = kcalFor(report.tmr, report.adjBase, selectedGoal);
    const goalLabel = GOAL_LABELS[selectedGoal];
    const diffAbs = Math.abs(report.weightDiff);
    const diffDone = diffAbs < 0.5;

    return (
      <div className={styles.root}>
        <div className={styles.topmark}>
          <div className={styles.word}>WELLNESS EVALUATION</div>
          <div className={styles.sub}>健康评估表 · 体测数据分析</div>
          <div className={styles.rule} />
        </div>

        <div className={styles.wrap}>
          <div className={styles.reportTopbar}>
            <div className={styles.rName}>{meta.name}</div>
            <div className={styles.rMetaRow}>
              {meta.gender === "F" ? "女 Female" : "男 Male"} · {meta.age}岁 · {meta.height}cm
            </div>
            <div className={styles.rMetaRow}>
              📅 {meta.date}
              {meta.contact ? `  ·  📞 ${meta.contact}` : ""}
              {meta.coachName ? `  ·  教练 ${meta.coachName}` : ""}
            </div>
            <div className={styles.topbarBtns}>
              <button className={styles.btnEdit} onClick={handleExport}>
                ⬇ PDF
              </button>
              <button className={styles.btnEdit} onClick={() => setView("form")}>
                ← 修改 Edit
              </button>
            </div>
          </div>

          <div className={styles.statusTitle}>体测状况 · STATUS</div>
          <div className={styles.statusList}>
            {report.cards.map((c) => (
              <div key={c.key} className={cn(styles.scard, styles[c.grade])}>
                <div className={styles.dot}>{c.grade === "good" ? "✓" : c.grade === "warn" ? "!" : "✕"}</div>
                <div className={styles.mid}>
                  <div className={styles.nm}>{c.nm}</div>
                  <div className={styles.ref}>{c.ref}</div>
                </div>
                <div className={styles.right}>
                  <div className={styles.val}>{c.val}</div>
                  <div className={styles.verdict}>{verdictText(c.grade, c.dir)}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={cn(styles.panel, styles.targetPanel)}>
            <h2>
              <span className={styles.cn}>体重目标</span>TARGET WEIGHT
            </h2>
            <div className={styles.tgRow}>
              <span className={styles.k}>目前体重 Current</span>
              <span className={styles.v}>{meta.weight.toFixed(1)} kg</span>
            </div>
            <div className={styles.tgRow}>
              <span className={styles.k}>理想体重 Target</span>
              <span className={styles.v}>{report.targetWeight.toFixed(1)} kg</span>
            </div>
            <div className={styles.tgRow}>
              <span className={styles.k}>差距 Difference</span>
              <span className={cn(styles.v, diffDone ? styles.diffGood : styles.diffBad)}>
                {diffDone
                  ? "已达标 ✓"
                  : `${report.weightDiff > 0 ? "需减 " : "需增 "}${diffAbs.toFixed(1)} kg`}
              </span>
            </div>
          </div>

          <div className={styles.hero}>
            <div className={styles.eyebrow}>今日建议 · DAILY TARGETS</div>
            <span
              className={cn(
                styles.goalTag,
                selectedGoal === "maintain" ? styles.isMaintain : styles.isAction
              )}
            >
              {goalLabel}
            </span>

            <div className={styles.goalToggleRow}>
              {(["loss", "maintain", "gain"] as Goal[]).map((g) => (
                <button
                  key={g}
                  className={cn(styles.goalToggleBtn, selectedGoal === g && styles.active)}
                  onClick={() => setSelectedGoal(g)}
                >
                  {g === "loss" ? "减重 Loss" : g === "maintain" ? "维持 Maintain" : "增重 Gain"}
                </button>
              ))}
            </div>

            <div className={styles.heroMain}>
              <div className={styles.heroMainValue}>{kcal}</div>
              <div className={styles.heroMainLabel}>KCAL / 天 · 每日建议摄取</div>
            </div>

            <div className={styles.heroSubGrid}>
              <div className={styles.heroSub}>
                <div className={styles.heroSubLabel}>蛋白质 PROTEIN</div>
                <div className={styles.heroSubValue}>
                  {report.proteinLo}–{report.proteinHi} g
                </div>
              </div>
              <div className={styles.heroSub}>
                <div className={styles.heroSubLabel}>水分 WATER</div>
                <div className={styles.heroSubValue}>
                  {report.waterLo}–{report.waterHi} ml
                </div>
              </div>
            </div>

            <div className={styles.heroSummary}>{report.summary}</div>
          </div>

          <div className={styles.footerNote}>
            本报告依据体测仪数据与一般健康参考值计算，仅供生活方式建议参考，不作为医疗诊断。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.topmark}>
        <div className={styles.word}>WELLNESS EVALUATION</div>
        <div className={styles.sub}>健康评估表 · 体测数据分析</div>
        <div className={styles.rule} />
      </div>

      <div className={styles.wrap}>
        <div className={styles.panel}>
          <h2>
            <span className={styles.cn}>客户资料</span>CLIENT INFO
          </h2>
          <div className={styles.field}>
            <label>姓名 Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="客户姓名"
            />
          </div>
          <div className={styles.field}>
            <label>
              联络号码 Contact <span className={styles.optTag}>非必填</span>
            </label>
            <input
              type="text"
              inputMode="tel"
              value={form.contact}
              onChange={(e) => set("contact", e.target.value)}
              placeholder="012-3456789"
            />
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>日期 Date</label>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>
                教练 Coach <span className={styles.optTag}>非必填</span>
              </label>
              <input
                type="text"
                value={form.coachName}
                onChange={(e) => set("coachName", e.target.value)}
                placeholder="教练姓名"
              />
            </div>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>性别 Gender</label>
              <div className={styles.btnGroup}>
                <div
                  className={cn(styles.opt, form.gender === "F" && styles.active)}
                  onClick={() => set("gender", "F")}
                >
                  女 Female
                </div>
                <div
                  className={cn(styles.opt, form.gender === "M" && styles.active)}
                  onClick={() => set("gender", "M")}
                >
                  男 Male
                </div>
              </div>
            </div>
            <div className={styles.field}>
              <label>年龄 Age</label>
              <input
                type="number"
                inputMode="numeric"
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                placeholder="30"
              />
            </div>
          </div>
          <div className={styles.field}>
            <label>身高 Height (cm)</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.height}
              onChange={(e) => set("height", e.target.value)}
              placeholder="160"
            />
          </div>
        </div>

        <div className={styles.panel}>
          <h2>
            <span className={styles.cn}>体测数据</span>TANITA READINGS
          </h2>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>体重 Weight (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.weight}
                onChange={(e) => set("weight", e.target.value)}
                placeholder="60"
              />
            </div>
            <div className={styles.field}>
              <label>体脂% Body Fat</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.bodyFat}
                onChange={(e) => set("bodyFat", e.target.value)}
                placeholder="28"
              />
            </div>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>水分% Body Water</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.water}
                onChange={(e) => set("water", e.target.value)}
                placeholder="52"
              />
            </div>
            <div className={styles.field}>
              <label>肌肉量 Muscle (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.muscle}
                onChange={(e) => set("muscle", e.target.value)}
                placeholder="38"
              />
            </div>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>基础代谢率 BMR (kcal)</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.bmr}
                onChange={(e) => set("bmr", e.target.value)}
                placeholder="1200"
              />
            </div>
            <div className={styles.field}>
              <label>代谢年龄 Metabolic Age</label>
              <input
                type="number"
                inputMode="numeric"
                value={form.metaAge}
                onChange={(e) => set("metaAge", e.target.value)}
                placeholder="35"
              />
            </div>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>骨量 Bone Mass (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                value={form.bone}
                onChange={(e) => set("bone", e.target.value)}
                placeholder="2.1"
              />
            </div>
            <div className={styles.field}>
              <label>内脏脂肪 Visceral Fat</label>
              <input
                type="number"
                inputMode="numeric"
                value={form.visceral}
                onChange={(e) => set("visceral", e.target.value)}
                placeholder="5"
              />
            </div>
          </div>
          <div className={styles.field}>
            <label>身体体格 Physical Rating (1-9)</label>
            <div className={cn(styles.btnGroup, styles.ratingGrid)}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => (
                <div
                  key={r}
                  className={cn(styles.opt, form.rating === r && styles.active)}
                  onClick={() => set("rating", r)}
                >
                  {r}
                </div>
              ))}
            </div>
            <div className={styles.hint}>1-3 肥胖需减重 · 4 营养不良 · 5 标准 · 6,8,9 运动型 · 7 过瘦需增重</div>
          </div>
        </div>

        <button className={styles.btnGenerate} onClick={handleGenerate}>
          生成报告 Generate Report
        </button>
        {error && (
          <div className={styles.errMsg}>请先填写姓名、性别、年龄、身高、体重与基础代谢率。</div>
        )}
      </div>
    </div>
  );
}
