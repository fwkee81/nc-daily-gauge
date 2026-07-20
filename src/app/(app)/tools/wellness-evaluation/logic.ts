// Grading + calculation logic ported from wellness-evaluation-report.html.
// Numbers/thresholds are a direct port — treat as reference guidance only,
// not a medical calculation (matches the original report's footer note).

export type Gender = "F" | "M";
export type Goal = "loss" | "maintain" | "gain";
export type Grade = "good" | "warn" | "bad";
export type Dir = "high" | "low" | null;

export interface StatusCard {
  key: string;
  nm: string;
  val: string;
  ref: string;
  grade: Grade;
  dir: Dir;
}

export interface ReportInputs {
  gender: Gender;
  age: number;
  height: number;
  weight: number;
  bmr: number;
  bodyFat: number | null;
  water: number | null;
  muscle: number | null;
  metaAge: number | null;
  bone: number | null;
  visceral: number | null;
  rating: number;
}

export interface ReportResult {
  idealWeight: number;
  targetWeight: number;
  weightDiff: number;
  autoGoal: Goal;
  tmr: number;
  adjBase: number;
  proteinLo: number;
  proteinHi: number;
  waterLo: number;
  waterHi: number;
  cards: StatusCard[];
  summary: string;
}

export const GOAL_LABELS: Record<Goal, string> = {
  loss: "建议：减重 Recommended: Weight Loss",
  maintain: "体重维持良好 Weight Well Maintained",
  gain: "建议：增重 Recommended: Weight Gain",
};

function gradeRange(value: number, lo: number, hi: number, tol = 5): Grade {
  if (value >= lo && value <= hi) return "good";
  const dist = value < lo ? lo - value : value - hi;
  return dist <= tol ? "warn" : "bad";
}

function gradePoint(value: number, ideal: number, aboveIsGood: boolean): Grade {
  if (aboveIsGood && value >= ideal) return "good";
  const diffPct = (Math.abs(value - ideal) / ideal) * 100;
  if (diffPct <= 5) return "good";
  if (diffPct <= 15) return "warn";
  return "bad";
}

function gradeMetaAge(metaAge: number, actualAge: number): Grade {
  const diff = metaAge - actualAge;
  if (diff <= 0) return "good";
  if (diff <= 5) return "warn";
  return "bad";
}

function gradeVisceral(level: number, gender: Gender): Grade {
  const cap = gender === "F" ? [3, 6, 9] : [4, 8, 12];
  if (level <= cap[1]) return "good";
  if (level <= cap[2]) return "warn";
  return "bad";
}

function gradePhysical(r: number): Grade {
  if ([1, 2, 3].includes(r)) return "bad";
  if ([4, 7].includes(r)) return "warn";
  return "good";
}

function dirRange(value: number, lo: number, hi: number): Dir {
  if (value > hi) return "high";
  if (value < lo) return "low";
  return null;
}

function dirPoint(value: number, ref: number): Dir {
  return value > ref ? "high" : "low";
}

export function verdictText(grade: Grade, dir: Dir): string {
  if (grade === "good") return "✓ 标准 Normal";
  const word =
    dir === "high" ? "偏高 High" : dir === "low" ? "偏低 Low" : "需改善 Needs Improvement";
  return (grade === "warn" ? "⚠ " : "✕ ") + word;
}

function bodyFatRange(gender: Gender, age: number): [number, number] {
  if (gender === "F") {
    if (age < 30) return [17, 24];
    if (age < 40) return [21, 27];
    return [21, 30];
  }
  return age < 30 ? [12, 19] : [15, 21];
}

function boneRef(gender: Gender, weight: number): number {
  if (gender === "F") return weight < 50 ? 1.95 : weight <= 75 ? 2.4 : 2.95;
  return weight < 50 ? 2.65 : weight <= 75 ? 3.26 : 3.69;
}

export function kcalFor(tmr: number, adjBase: number, goal: Goal): number {
  const adj = goal === "maintain" ? 0 : goal === "loss" ? -adjBase : adjBase;
  return Math.round(tmr + adj);
}

export function computeReport(input: ReportInputs): ReportResult {
  const { gender, age, height, weight, bmr, bodyFat, water, muscle, metaAge, bone, visceral, rating } =
    input;

  const idealWeight = gender === "F" ? (height - 100) * 0.8 : (height - 100) * 0.9;
  const idealMuscle = idealWeight - 10;
  const weightGap = weight - idealWeight;
  const GOAL_BUFFER = 2;
  const autoGoal: Goal = weightGap > GOAL_BUFFER ? "loss" : weightGap < -GOAL_BUFFER ? "gain" : "maintain";
  const tmr = gender === "M" ? bmr * 1.3 : bmr * 1.25;
  const adjBase = age >= 40 ? 300 : 500;

  const proteinLo = Math.round(weight * 1);
  const proteinHi = Math.round(weight * 1.5);
  const waterLo = Math.round(weight * 50);
  const waterHi = Math.round(weight * 70);
  const targetWeight = idealWeight;
  const weightDiff = weight - targetWeight;

  const fatRange = bodyFatRange(gender, age);
  const waterRange: [number, number] = gender === "F" ? [50, 55] : [60, 65];
  const boneReference = boneRef(gender, weight);

  const cards: StatusCard[] = [
    {
      key: "weight",
      nm: "体重 Weight",
      val: `${weight.toFixed(1)} kg`,
      ref: `理想 Ideal ${targetWeight.toFixed(1)} kg`,
      grade: gradePoint(weight, targetWeight, false),
      dir: dirPoint(weight, targetWeight),
    },
    {
      key: "bodyfat",
      nm: "体脂% Body Fat",
      val: bodyFat == null ? "—" : `${bodyFat.toFixed(1)}%`,
      ref: `标准 Normal ${fatRange[0]}-${fatRange[1]}%`,
      grade: bodyFat == null ? "warn" : gradeRange(bodyFat, fatRange[0], fatRange[1]),
      dir: bodyFat == null ? null : dirRange(bodyFat, fatRange[0], fatRange[1]),
    },
    {
      key: "visceral",
      nm: "内脏脂肪 Visceral Fat",
      val: visceral == null ? "—" : String(visceral),
      ref: "数值越低越好 Lower is Better",
      grade: visceral == null ? "warn" : gradeVisceral(visceral, gender),
      dir: "high",
    },
    {
      key: "metaage",
      nm: "代谢年龄 Metabolic Age",
      val: metaAge == null ? "—" : String(metaAge),
      ref: `实际年龄 Actual Age ${age}`,
      grade: metaAge == null ? "warn" : gradeMetaAge(metaAge, age),
      dir: "high",
    },
    {
      key: "muscle",
      nm: "肌肉量 Muscle Mass",
      val: muscle == null ? "—" : `${muscle.toFixed(1)} kg`,
      ref: `理想 Ideal ${idealMuscle.toFixed(1)} kg`,
      grade: muscle == null ? "warn" : gradePoint(muscle, idealMuscle, true),
      dir: "low",
    },
    {
      key: "rating",
      nm: "身体体格 Physical Rating",
      val: String(rating),
      ref: "1-9 等级 Scale",
      grade: gradePhysical(rating),
      dir: [1, 2, 3].includes(rating) ? "high" : [4, 7].includes(rating) ? "low" : null,
    },
    {
      key: "water",
      nm: "水分% Body Water",
      val: water == null ? "—" : `${water.toFixed(1)}%`,
      ref: `标准 Normal ${waterRange[0]}-${waterRange[1]}%`,
      grade: water == null ? "warn" : gradeRange(water, waterRange[0], waterRange[1]),
      dir: water == null ? null : dirRange(water, waterRange[0], waterRange[1]),
    },
    {
      key: "bone",
      nm: "骨量 Bone Mass",
      val: bone == null ? "—" : `${bone.toFixed(2)} kg`,
      ref: `参考 Reference ${boneReference.toFixed(2)} kg`,
      grade: bone == null ? "warn" : gradePoint(bone, boneReference, false),
      dir: bone == null ? null : dirPoint(bone, boneReference),
    },
  ];

  const bads = cards.filter((c) => c.grade === "bad");
  const warns = cards.filter((c) => c.grade === "warn");
  const zhNames = (list: StatusCard[]) => list.slice(0, 2).map((c) => c.nm.split(" ")[0]).join("、");
  const enNames = (list: StatusCard[]) =>
    list.slice(0, 2).map((c) => c.nm.split(" ").slice(1).join(" ")).join(", ");

  let summary: string;
  if (bads.length) {
    summary =
      `今天的重点：${zhNames(bads)} 偏离标准较多，建议优先调整。\n` +
      `Today's focus: ${enNames(bads)} deviate most from standard — adjust these first.`;
  } else if (warns.length) {
    summary =
      `整体状况不错，${zhNames(warns)} 还有提升空间。\n` +
      `Overall in good shape — ${enNames(warns)} still has room to improve.`;
  } else {
    summary =
      "各项指标都在标准范围内，状况非常理想，保持现有习惯即可！\n" +
      "All metrics are within the normal range — great shape, just keep up the good habits!";
  }

  return {
    idealWeight,
    targetWeight,
    weightDiff,
    autoGoal,
    tmr,
    adjBase,
    proteinLo,
    proteinHi,
    waterLo,
    waterHi,
    cards,
    summary,
  };
}
