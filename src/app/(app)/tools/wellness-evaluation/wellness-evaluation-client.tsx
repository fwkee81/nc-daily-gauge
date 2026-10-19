"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ScannedForm } from "@/app/api/wellness-evaluation/read-form/route";
import {
  GOAL_LABELS,
  computeReport,
  kcalFor,
  toWhatsAppNumber,
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
  rating: string;
  bmr: string;
  metaAge: string;
  bone: string;
  visceral: string;
}

type TextKey = Exclude<keyof FormState, "gender">;

function emptyForm(coachName = ""): FormState {
  return {
    name: "",
    contact: "",
    date: format(new Date(), "yyyy-MM-dd"),
    coachName,
    gender: "F",
    age: "",
    height: "",
    weight: "",
    bodyFat: "",
    water: "",
    muscle: "",
    rating: "",
    bmr: "",
    metaAge: "",
    bone: "",
    visceral: "",
  };
}

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

/* ---------- photo scan ---------- */

const READ_FORM_URL = "/api/wellness-evaluation/read-form";

// scanned field → form field
const SCAN_TO_FORM: Partial<Record<keyof ScannedForm, TextKey>> = {
  name: "name",
  contact: "contact",
  date: "date",
  coach: "coachName",
  age: "age",
  height: "height",
  weight: "weight",
  bodyfat: "bodyFat",
  water: "water",
  muscle: "muscle",
  rating: "rating",
  bmr: "bmr",
  metaage: "metaAge",
  bone: "bone",
  visceral: "visceral",
};

const SCAN_LABELS: Record<string, string> = {
  name: "Name", contact: "Contact", date: "Date", coach: "Coach", gender: "Gender",
  age: "Age", height: "Height", weight: "Weight", bodyfat: "Body Fat", water: "Body Water",
  muscle: "Muscle Mass", rating: "Physical Rating", bmr: "BMR", metaage: "Metabolic Age",
  bone: "Bone Mass", visceral: "Visceral Fat",
};

const REQUIRED_SCAN: (keyof ScannedForm)[] = ["name", "gender", "age", "height", "weight", "bmr"];

type AiMark = "filled" | "uncertain";
type ScanStatus = { kind: "busy" | "ok" | "warn" | "err"; text: string } | null;

/* Phone photos are large: shrink to ≤2000px JPEG so the upload is fast and stays under Vercel's body limit. */
function compressImage(file: File): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 2000;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      resolve({ dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open this image. Please use a JPG or PNG photo."));
    };
    img.src = url;
  });
}

/* ---------- PDF ---------- */

function pdfFilename(meta: ReportMeta) {
  return `Wellness_Evaluation_${meta.name || "Report"}_${meta.date}`.replace(/[\\/:*?"<>|\s]+/g, "_") + ".pdf";
}

async function buildPdf(el: HTMLElement, filename: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    ignoreElements: (node) => node instanceof HTMLElement && node.dataset.pdfHide !== undefined,
    onclone: (doc) => {
      // the cards' soft gradient renders as a smudge — use a flat background in the PDF
      doc.querySelectorAll<HTMLElement>("[data-pdf-flat]").forEach((n) => {
        n.style.background = "var(--card)";
      });
    },
  });
  // one tall page (no awkward page breaks) — easy to scroll on a phone
  const w = 210;
  const h = (canvas.height * w) / canvas.width;
  const pdf = new jsPDF({ unit: "mm", format: [w, h], orientation: h > w ? "portrait" : "landscape" });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
  return new File([pdf.output("blob")], filename, { type: "application/pdf" });
}

function downloadFile(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function WellnessEvaluationClient() {
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [view, setView] = useState<"form" | "report">("form");
  const [error, setError] = useState(false);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [reportId, setReportId] = useState(0);
  const [selectedGoal, setSelectedGoal] = useState<Goal>("maintain");

  const [aiMarks, setAiMarks] = useState<Partial<Record<keyof FormState, AiMark>>>({});
  const [scanStatus, setScanStatus] = useState<ScanStatus>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);
  const pdfPromiseRef = useRef<Promise<File> | null>(null);
  const [pdfReadyKey, setPdfReadyKey] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // once the coach edits a highlighted field, it's been checked — drop the highlight
    setAiMarks((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function generate(values: FormState): boolean {
    const name = values.name.trim();
    const age = parseFloat(values.age);
    const height = parseFloat(values.height);
    const weight = parseFloat(values.weight);
    const bmr = parseFloat(values.bmr);

    if (!name || !values.gender || !age || !height || !weight || !bmr) {
      setError(true);
      return false;
    }
    setError(false);

    const ratingRaw = parseInt(values.rating, 10);
    const result = computeReport({
      gender: values.gender,
      age,
      height,
      weight,
      bmr,
      bodyFat: numOrNull(values.bodyFat),
      water: numOrNull(values.water),
      muscle: numOrNull(values.muscle),
      metaAge: numOrNull(values.metaAge),
      bone: numOrNull(values.bone),
      visceral: numOrNull(values.visceral),
      rating: ratingRaw >= 1 && ratingRaw <= 9 ? ratingRaw : null,
    });

    setMeta({
      name,
      contact: values.contact.trim(),
      date: values.date,
      coachName: values.coachName.trim(),
      gender: values.gender,
      age,
      height,
      weight,
    });
    setReport(result);
    setReportId((n) => n + 1);
    setSelectedGoal(result.autoGoal);
    setShareNote("");
    setView("report");
    window.scrollTo(0, 0);
    return true;
  }

  function resetForNewClient() {
    setForm((prev) => emptyForm(prev.coachName));
    setAiMarks({});
    setScanStatus(null);
    setPhotoUrl(null);
    setError(false);
    setMeta(null);
    setReport(null);
    setShareNote("");
    pdfPromiseRef.current = null;
    setView("form");
    window.scrollTo(0, 0);
  }

  async function readForm(file: File) {
    setError(false);
    let img;
    try {
      img = await compressImage(file);
    } catch (e) {
      setScanStatus({ kind: "err", text: "✕ " + (e as Error).message });
      return;
    }
    setPhotoUrl(img.dataUrl);
    setScanStatus({ kind: "busy", text: "Reading the form… this takes about 5–15 seconds" });

    let fields: ScannedForm;
    try {
      const res = await fetch(READ_FORM_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: img.base64, mediaType: img.mediaType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.fields) {
        setScanStatus({
          kind: "err",
          text: "✕ " + (data.message || `Reading failed (${res.status}). Try again or fill in manually.`),
        });
        return;
      }
      fields = data.fields;
    } catch {
      setScanStatus({ kind: "err", text: "✕ Cannot reach the server. Check your connection and try again." });
      return;
    }

    const uncertain = new Set(fields.uncertain);
    const next: FormState = { ...form };
    const marks: Partial<Record<keyof FormState, AiMark>> = {};
    for (const [scanKey, formKey] of Object.entries(SCAN_TO_FORM) as [keyof ScannedForm, TextKey][]) {
      const v = fields[scanKey];
      if (v === null || v === undefined || v === "") continue;
      next[formKey] = String(v);
      marks[formKey] = uncertain.has(scanKey) ? "uncertain" : "filled";
    }
    if (fields.gender) {
      next.gender = fields.gender;
      if (uncertain.has("gender")) marks.gender = "uncertain";
    }
    setForm(next);
    setAiMarks(marks);

    const names = (keys: string[]) => keys.map((k) => SCAN_LABELS[k] || k).join(", ");
    const missing = REQUIRED_SCAN.filter((k) => fields[k] === null || fields[k] === undefined);
    const unsure = [...uncertain];

    if (missing.length) {
      setScanStatus({
        kind: "warn",
        text:
          `⚠ Form read, but missing: ${names(missing)}. Fill these in below, then tap "Generate Report".` +
          (unsure.length ? ` Yellow fields were hard to read: ${names(unsure)} — please check them.` : ""),
      });
      return;
    }
    if (unsure.length) {
      setScanStatus({
        kind: "warn",
        text: `⚠ Form read. Yellow fields were hard to read: ${names(unsure)}. Check them against the photo, then tap "Generate Report".`,
      });
      return;
    }
    setScanStatus({
      kind: "ok",
      text: '✓ Done — the report has been generated. To change anything, tap "Edit" at the top of the report.',
    });
    generate(next);
  }

  function handleExport() {
    const inIframe = window.self !== window.top;
    if (inIframe) {
      alert(
        "Printing / PDF export is not available in preview mode.\n\nOpen this page directly in your phone browser (Safari/Chrome) and this button will work."
      );
      return;
    }
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isIOSNonSafari = isIOS && /CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIOSNonSafari) {
      alert(
        'Chrome / Firefox / Edge on iPhone cannot print — this is an Apple restriction (only Safari can).\n\nPlease open this page in Safari and tap "⬇ PDF" again.'
      );
      return;
    }
    try {
      window.print();
    } catch {
      alert("Something went wrong exporting the PDF. Please use the browser share / print menu instead.");
    }
  }

  /* Build the PDF right after the report renders (and whenever the goal changes), so the
     share button can open the share sheet straight away — phones only allow sharing right after a tap. */
  const pdfKey = view === "report" && meta ? `${reportId}|${selectedGoal}` : null;
  useEffect(() => {
    if (!pdfKey || !meta || !reportRef.current) return;
    const el = reportRef.current;
    const filename = pdfFilename(meta);
    const p = new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 50))).then(() =>
      buildPdf(el, filename)
    );
    pdfPromiseRef.current = p;
    p.then(
      () => {
        if (pdfPromiseRef.current === p) setPdfReadyKey(pdfKey);
      },
      (e) => console.error("PDF build failed", e)
    );
  }, [pdfKey, meta]);

  async function handleSharePdf() {
    const p = pdfPromiseRef.current;
    if (!p) return;
    let file: File;
    try {
      file = await p;
    } catch (e) {
      setShareNote("✕ Could not create the PDF: " + (e as Error).message);
      return;
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: file.name,
          text: "Wellness Evaluation Report" + (meta?.name ? ` – ${meta.name}` : ""),
        });
        setShareNote("");
      } catch (e) {
        const name = (e as Error).name;
        if (name === "AbortError") return; // closed the share sheet
        if (name === "NotAllowedError") {
          setShareNote('The PDF is ready — please tap "Share PDF" again.');
          return;
        }
        downloadFile(file);
        setShareNote("Sharing could not open, so the PDF was downloaded instead.");
      }
    } else {
      downloadFile(file);
      setShareNote(
        "This browser cannot share files, so the PDF was downloaded. Send it on WhatsApp yourself. (Sharing works directly on phones.)"
      );
    }
  }

  if (view === "report" && report && meta) {
    const kcal = kcalFor(report.tmr, report.adjBase, selectedGoal);
    const goalLabel = GOAL_LABELS[selectedGoal];
    const diffAbs = Math.abs(report.weightDiff);
    const diffDone = diffAbs < 0.5;
    const pdfReady = pdfReadyKey === pdfKey;

    const waNumber = meta.contact ? toWhatsAppNumber(meta.contact) : null;
    const waText =
      `Hi ${meta.name}, here are your Wellness Evaluation results (${meta.date}):\n` +
      `• Current weight: ${meta.weight.toFixed(1)} kg | Ideal weight: ${report.targetWeight.toFixed(1)} kg\n` +
      `• Daily calorie target: ${kcal} kcal\n` +
      `• Protein: ${report.proteinLo}–${report.proteinHi} g | Water: ${report.waterLo}–${report.waterHi} ml\n\n` +
      "I'll send you the full report PDF separately 😊";
    const waNote = !meta.contact
      ? "No phone number entered, so WhatsApp is not available."
      : !waNumber
        ? `⚠ Phone number "${meta.contact}" is not valid, so no WhatsApp link could be made.`
        : "";

    return (
      <div className={styles.root} ref={reportRef}>
        <div className={styles.topmark}>
          <div className={styles.word}>WELLNESS EVALUATION</div>
          <div className={styles.sub}>Body Composition Analysis</div>
          <div className={styles.rule} />
        </div>

        <div className={styles.wrap}>
          <div className={styles.reportTopbar}>
            <div className={styles.rName}>{meta.name}</div>
            <div className={styles.rMetaRow}>
              {meta.gender === "F" ? "Female" : "Male"} · {meta.age} yrs · {meta.height} cm
            </div>
            <div className={styles.rMetaRow}>
              📅 {meta.date}
              {meta.contact ? `  ·  📞 ${meta.contact}` : ""}
              {meta.coachName ? `  ·  Coach ${meta.coachName}` : ""}
            </div>
            <div className={styles.topbarBtns} data-pdf-hide>
              <button className={styles.btnEdit} onClick={handleExport}>
                ⬇ PDF
              </button>
              <button className={styles.btnEdit} onClick={() => setView("form")}>
                ← Edit
              </button>
              <button
                className={cn(styles.btnEdit, styles.btnNew)}
                onClick={() => {
                  if (
                    confirm(
                      "Start a new client? This report will be cleared.\n(If you have not sent it yet, tap WhatsApp / Share PDF first.)"
                    )
                  )
                    resetForNewClient();
                }}
              >
                ＋ New Client
              </button>
            </div>
            <div className={styles.shareBtns} data-pdf-hide>
              {waNumber ? (
                <a
                  className={cn(styles.btnShare, styles.btnWa)}
                  href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Send to +${waNumber}`}
                >
                  💬 WhatsApp
                </a>
              ) : (
                <span className={cn(styles.btnShare, styles.btnWa, styles.btnDisabled)}>💬 WhatsApp</span>
              )}
              <button className={cn(styles.btnShare, styles.btnPdf)} onClick={handleSharePdf} disabled={!pdfReady}>
                {pdfReady ? "📤 Share PDF" : "⏳ Preparing PDF…"}
              </button>
            </div>
            {(shareNote || waNote) && (
              <div className={styles.shareNote} data-pdf-hide>
                {shareNote || waNote}
              </div>
            )}
          </div>

          <div className={styles.statusTitle}>STATUS</div>
          <div className={styles.statusList}>
            {report.cards.map((c) => (
              <div key={c.key} className={cn(styles.scard, styles[c.grade])} data-pdf-flat>
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
            <h2>TARGET WEIGHT</h2>
            <div className={styles.tgRow}>
              <span className={styles.k}>Current</span>
              <span className={styles.v}>{meta.weight.toFixed(1)} kg</span>
            </div>
            <div className={styles.tgRow}>
              <span className={styles.k}>Target</span>
              <span className={styles.v}>{report.targetWeight.toFixed(1)} kg</span>
            </div>
            <div className={styles.tgRow}>
              <span className={styles.k}>Difference</span>
              <span className={cn(styles.v, diffDone ? styles.diffGood : styles.diffBad)}>
                {diffDone ? "On target ✓" : `${report.weightDiff > 0 ? "Lose " : "Gain "}${diffAbs.toFixed(1)} kg`}
              </span>
            </div>
          </div>

          <div className={styles.hero}>
            <div className={styles.eyebrow}>DAILY TARGETS</div>
            <span
              className={cn(
                styles.goalTag,
                selectedGoal === "maintain" ? styles.isMaintain : styles.isAction
              )}
            >
              {goalLabel}
            </span>

            <div className={styles.goalToggleRow} data-pdf-hide>
              {(["loss", "maintain", "gain"] as Goal[]).map((g) => (
                <button
                  key={g}
                  className={cn(styles.goalToggleBtn, selectedGoal === g && styles.active)}
                  onClick={() => setSelectedGoal(g)}
                >
                  {g === "loss" ? "Lose" : g === "maintain" ? "Maintain" : "Gain"}
                </button>
              ))}
            </div>

            <div className={styles.heroMain}>
              <div className={styles.heroMainValue}>{kcal}</div>
              <div className={styles.heroMainLabel}>KCAL / DAY · RECOMMENDED INTAKE</div>
            </div>

            <div className={styles.heroSubGrid}>
              <div className={styles.heroSub}>
                <div className={styles.heroSubLabel}>PROTEIN</div>
                <div className={styles.heroSubValue}>
                  {report.proteinLo}–{report.proteinHi} g
                </div>
              </div>
              <div className={styles.heroSub}>
                <div className={styles.heroSubLabel}>WATER</div>
                <div className={styles.heroSubValue}>
                  {report.waterLo}–{report.waterHi} ml
                </div>
              </div>
            </div>

            <div className={styles.heroSummary}>{report.summary}</div>
          </div>

          <div className={styles.footerNote}>
            This report is calculated from body composition analyzer readings and general health reference
            values. It is for lifestyle guidance only and is not a medical diagnosis.
          </div>
        </div>
      </div>
    );
  }

  const mark = (key: keyof FormState) =>
    aiMarks[key] === "filled" ? styles.aiFilled : aiMarks[key] === "uncertain" ? styles.aiUncertain : undefined;

  const numberField = (key: TextKey, label: string, placeholder: string, inputMode: "decimal" | "numeric" = "decimal") => (
    <div className={styles.field}>
      <label>{label}</label>
      <input
        type="number"
        inputMode={inputMode}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className={mark(key)}
      />
    </div>
  );

  return (
    <div className={styles.root}>
      <div className={styles.topmark}>
        <div className={styles.word}>WELLNESS EVALUATION</div>
        <div className={styles.sub}>Body Composition Analysis</div>
        <div className={styles.rule} />
      </div>

      <div className={styles.wrap}>
        <div className={cn(styles.panel, styles.uploadPanel)}>
          <h2>SCAN FORM</h2>
          <label
            className={cn(styles.uploadDrop, dragging && styles.drag)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith("image/")) readForm(file);
            }}
          >
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) readForm(file);
                e.target.value = ""; // allow re-selecting the same photo
              }}
            />
            <div className={styles.uIcon}>📷</div>
            <div className={styles.uTitle}>Snap or upload the filled form</div>
            <div className={styles.uSub}>The data is read automatically and the report is generated</div>
          </label>
          {photoUrl && (
            <div className={styles.uploadPreview}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL preview */}
              <img src={photoUrl} alt="Form photo" />
            </div>
          )}
          {scanStatus && (
            <div className={cn(styles.uploadStatus, styles[scanStatus.kind])}>
              {scanStatus.kind === "busy" && <span className={styles.spinner} />}
              {scanStatus.text}
            </div>
          )}
        </div>
        <p className={styles.orDivider}>— OR FILL IN MANUALLY —</p>

        <div className={styles.panel}>
          <h2>CLIENT INFO</h2>
          <div className={styles.field}>
            <label>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Client name"
              className={mark("name")}
            />
          </div>
          <div className={styles.field}>
            <label>
              Contact <span className={styles.optTag}>Optional</span>
            </label>
            <input
              type="text"
              inputMode="tel"
              value={form.contact}
              onChange={(e) => set("contact", e.target.value)}
              placeholder="012-3456789"
              className={mark("contact")}
            />
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className={mark("date")}
              />
            </div>
            <div className={styles.field}>
              <label>
                Coach <span className={styles.optTag}>Optional</span>
              </label>
              <input
                type="text"
                value={form.coachName}
                onChange={(e) => set("coachName", e.target.value)}
                placeholder="Coach name"
                className={mark("coachName")}
              />
            </div>
          </div>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label>Gender</label>
              <div className={cn(styles.btnGroup, aiMarks.gender === "uncertain" && styles.aiUncertainGroup)}>
                <div
                  className={cn(styles.opt, form.gender === "F" && styles.active)}
                  onClick={() => set("gender", "F")}
                >
                  Female
                </div>
                <div
                  className={cn(styles.opt, form.gender === "M" && styles.active)}
                  onClick={() => set("gender", "M")}
                >
                  Male
                </div>
              </div>
            </div>
            {numberField("age", "Age", "30", "numeric")}
          </div>
          {numberField("height", "Height (cm)", "160")}
        </div>

        <div className={styles.panel}>
          <h2>TANITA READINGS</h2>
          <div className={styles.row2}>
            {numberField("weight", "Weight (kg)", "60")}
            {numberField("bodyFat", "Body Fat %", "28")}
          </div>
          <div className={styles.row2}>
            {numberField("water", "Body Water %", "52")}
            {numberField("muscle", "Muscle Mass (kg)", "38")}
          </div>
          <div className={styles.row2}>
            {numberField("rating", "Physical Rating (1-9)", "5", "numeric")}
            {numberField("bmr", "BMR (kcal)", "1200")}
          </div>
          <div className={cn(styles.hint, styles.ratingHint)}>
            Physical Rating: 1-3 overweight, lose weight · 4 under-nourished · 5 standard · 6, 8, 9 athletic · 7
            too thin, gain weight
          </div>
          <div className={styles.row2}>
            {numberField("metaAge", "Metabolic Age", "35", "numeric")}
            {numberField("bone", "Bone Mass (kg)", "2.1")}
          </div>
          <div className={styles.row2}>{numberField("visceral", "Visceral Fat", "5", "numeric")}</div>
        </div>

        <button className={styles.btnGenerate} onClick={() => generate(form)}>
          Generate Report
        </button>
        {error && <div className={styles.errMsg}>Please fill in name, gender, age, height, weight and BMR first.</div>}
        <button
          className={styles.btnClear}
          onClick={() => {
            if (confirm("Clear all data?")) resetForNewClient();
          }}
        >
          ✕ Clear
        </button>
      </div>
    </div>
  );
}
