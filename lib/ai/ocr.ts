// Thin wrapper around the OCR.space "parse/image" API. We post the raw image
// bytes as multipart so we don't need to expose the screenshot publicly just
// to OCR it.

export type OcrSuccess = { ok: true; text: string };
export type OcrFailure = { ok: false; error: string };
export type OcrResult = OcrSuccess | OcrFailure;

type OcrSpaceResponse = {
  ParsedResults?: Array<{ ParsedText?: string; FileParseExitCode?: number; ErrorMessage?: string }>;
  OCRExitCode?: number;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string;
};

export async function ocrImage(bytes: Uint8Array, filename: string): Promise<OcrResult> {
  const key = process.env.OCR_KEY;
  if (!key) return { ok: false, error: "OCR_KEY is not configured." };

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), filename);
  form.append("apikey", key);
  form.append("language", "chs");
  form.append("OCREngine", "2");
  form.append("scale", "true");
  form.append("isTable", "true");
  form.append("detectOrientation", "true");

  let res: Response;
  try {
    res = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OCR request failed." };
  }

  if (!res.ok) return { ok: false, error: `OCR HTTP ${res.status}` };

  let json: OcrSpaceResponse;
  try {
    json = (await res.json()) as OcrSpaceResponse;
  } catch {
    return { ok: false, error: "OCR returned invalid JSON." };
  }

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join("; ") : json.ErrorMessage;
    return { ok: false, error: msg || json.ErrorDetails || "OCR processing error." };
  }

  const text = (json.ParsedResults ?? [])
    .map((r) => r.ParsedText ?? "")
    .join("\n")
    .trim();

  if (!text) return { ok: false, error: "OCR returned empty text." };
  return { ok: true, text };
}

// Match the expected verification code as a standalone 6-digit number — not
// embedded inside a longer transaction ID or bank account number.
export function matchVerificationCode(text: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const re = new RegExp(`(?<![0-9])${code}(?![0-9])`);
  return re.test(text);
}

// Match the expected amount in any of the common renderings: ¥10, ¥10.00,
// 10.00 元, -10, -10.00, −10 (unicode minus). We accept the integer form,
// optionally followed by .00 / .0, with no preceding or trailing digit.
export function matchAmount(text: string, amount: number): boolean {
  const intPart = Math.trunc(amount);
  const decPart = Math.round((amount - intPart) * 100);
  const escapedInt = String(intPart);
  // Build pattern: <not-digit-or-dot><intPart>(.<decPart with 1-2 digits>)?<not-digit>
  // If decPart is 0, also accept the bare integer; otherwise require the dec.
  const decRe = decPart === 0
    ? `(\\.0{1,2})?`
    : `\\.${String(decPart).padStart(2, "0")}`;
  // Lookahead also excludes "." so "10" inside "10.01" isn't a false positive.
  const pattern = new RegExp(`(?<![0-9.])${escapedInt}${decRe}(?![0-9.])`);
  return pattern.test(text);
}
