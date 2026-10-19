import { getCurrentCoach } from "@/lib/auth";

// Reads a photo of the hand-filled Wellness Evaluation form with DeepSeek and
// returns the values as JSON for the tool to pre-fill. DEEPSEEK_API_KEY stays
// server-side (Vercel → Project Settings → Environment Variables).

export const maxDuration = 30;

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-flash"; // DeepSeek's image-capable model (api-docs.deepseek.com/guides/vision)

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// Vercel caps request bodies at 4.5 MB; the client shrinks photos well below this.
const MAX_BASE64_CHARS = 4_000_000;

const NUMBER_FIELDS = [
  "age", "height", "weight", "bodyfat", "water", "muscle",
  "bmr", "metaage", "bone", "visceral", "rating",
] as const;
const TEXT_FIELDS = ["name", "contact", "date", "coach"] as const;
const ALL_FIELDS: readonly string[] = [...TEXT_FIELDS, "gender", ...NUMBER_FIELDS];

export type ScannedForm = {
  [K in (typeof TEXT_FIELDS)[number]]: string | null;
} & {
  [K in (typeof NUMBER_FIELDS)[number]]: number | null;
} & {
  gender: "F" | "M" | null;
  uncertain: string[];
};

const SYSTEM = `You read photos of a hand-filled paper "Wellness Evaluation / 健康评估表" form used by a Herbalife coach in Malaysia. The form mixes Chinese and English and records a client's details plus Tanita body-composition readings.

Reply with ONE JSON object and nothing else, using exactly these keys:
{
  "name": string|null,       // 姓名
  "contact": string|null,    // 联络号码 phone
  "date": string|null,       // 日期 as YYYY-MM-DD. Malaysian forms write dates day-first (DD/MM/YYYY).
  "coach": string|null,      // 教练
  "gender": "F"|"M"|null,    // 性别: "F" for 女/Female, "M" for 男/Male (a circled or ticked option counts)
  "age": number|null,        // 年龄 years
  "height": number|null,     // 身高 cm
  "weight": number|null,     // 体重 kg
  "bodyfat": number|null,    // 体脂 %
  "water": number|null,      // 水分 %
  "muscle": number|null,     // 肌肉量 kg
  "bmr": number|null,        // 基础代谢率 kcal
  "metaage": number|null,    // 代谢年龄
  "bone": number|null,       // 骨量 kg
  "visceral": number|null,   // 内脏脂肪 level
  "rating": number|null,     // 身体体格 Physical Rating, whole number 1-9
  "uncertain": string[]      // keys of fields you are not sure you read correctly
}

Rules:
- Numbers only, without units.
- If a field is blank, crossed out, or missing from the form, use null. Never invent or estimate a value.
- If the handwriting is ambiguous (e.g. 1 vs 7, 5 vs 6, a decimal point you can't see clearly), give your best reading and add the key to "uncertain".
- If a value is far outside a plausible human range, add the key to "uncertain".`;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/* Keep only the expected keys with the expected types, so the page never receives junk. */
function clean(raw: Record<string, unknown>): ScannedForm {
  const out: Record<string, unknown> = {};
  for (const k of TEXT_FIELDS) {
    const v = raw[k];
    out[k] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  out.gender = raw.gender === "F" || raw.gender === "M" ? raw.gender : null;
  for (const k of NUMBER_FIELDS) {
    const v = raw[k];
    const n = typeof v === "number" ? v : parseFloat(String(v));
    out[k] = Number.isFinite(n) ? n : null;
  }
  out.uncertain = Array.isArray(raw.uncertain)
    ? raw.uncertain.filter((k): k is string => typeof k === "string" && ALL_FIELDS.includes(k))
    : [];
  return out as ScannedForm;
}

export async function POST(request: Request) {
  const coach = await getCurrentCoach();
  if (!coach) return json({ error: "unauthorized", message: "Please sign in again." }, 401);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("DEEPSEEK_API_KEY is not set");
    return json({ error: "config", message: "The DeepSeek API key is not set up on the server yet" }, 500);
  }

  let image: unknown, mediaType: unknown;
  try {
    ({ image, mediaType } = await request.json());
  } catch {
    return json({ error: "bad_request", message: "Invalid request" }, 400);
  }
  if (typeof image !== "string" || !image || typeof mediaType !== "string" || !MEDIA_TYPES.includes(mediaType)) {
    return json({ error: "bad_request", message: "Please upload a JPG or PNG image" }, 400);
  }
  if (image.length > MAX_BASE64_CHARS) {
    return json({ error: "too_large", message: "The image is too large. Please retake or compress the photo." }, 413);
  }

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${image}`, detail: "original" } },
              { type: "text", text: "请读取这张健康评估表，按要求输出 JSON。" },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    console.error("DeepSeek request failed", name, err instanceof Error ? err.message : err);
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return json(
      {
        error: timedOut ? "timeout" : "network",
        message: timedOut ? "Reading timed out. Please try again." : "Cannot reach the AI service. Please try again later.",
      },
      504
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("DeepSeek API error", res.status, detail.slice(0, 500));
    if (res.status === 401) return json({ error: "config", message: "The DeepSeek API key is invalid" }, 500);
    if (res.status === 402) return json({ error: "billing", message: "DeepSeek account balance is too low. Please top up." }, 402);
    if (res.status === 429) return json({ error: "rate_limited", message: "Too many requests. Please wait a moment and try again." }, 429);
    return json({ error: "api_error", message: "The AI service had a problem. Please try again later." }, 502);
  }

  const data = (await res.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[];
  };
  const choice = data.choices?.[0];
  if (!choice || choice.finish_reason === "length") {
    return json({ error: "incomplete", message: "Reading was incomplete. Please try again." }, 502);
  }
  try {
    return json({ fields: clean(JSON.parse(choice.message?.content ?? "")) });
  } catch (err) {
    console.error("Could not parse model output", err instanceof Error ? err.message : err);
    return json({ error: "parse_error", message: "The result could not be read. Please try again." }, 502);
  }
}
