/**
 * OCR + Deepseek end-to-end test
 * Run: node scripts/test-ocr.mjs
 */
import pkg from "tesseract.js";
const { recognize } = pkg;
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY missing");

// ── Documents to test ──────────────────────────────────────────────────────

const DOCS = [
  {
    label: "ID Card #1 — Northern Design (محمد احمد محمد حيدره)",
    file: "attached_assets/37673fdf-be62-4f96-a2e4-bac8e8f2dbba_1774108433127.jpeg",
    type: "national_id",
    expected: {
      fullName: "محمد احمد محمد حيدره",
      documentNumber: "6994-4094-3317",
      dateOfBirth: "1992-05-22",
      placeOfBirth: "اليمن - عدن",
      governorate: "عدن",
      district: null,
      bloodType: "O+",
    },
  },
  {
    label: "Passport — (صاقر منصور عبدالوهاب احمد)",
    file: "attached_assets/IMG-20260320-WA0143_1774108433156.jpg",
    type: "passport",
    expected: {
      dateOfBirth: "1989-06-27",   // critical: post-proc must fix 1949→1989
      expiryDate: "2027-07-15",
      gender: "male",
    },
  },
  {
    label: "ID Card #2 — New Design (عبدالله علي مقبل الثلاياء)",
    file: "attached_assets/IMG-20260204-WA0045_1774108433182.jpg",
    type: "national_id",
    expected: {
      fullName: "عبدالله علي مقبل الثلاياء",
      documentNumber: "01110189612",
      dateOfBirth: "2005-05-17",
      placeOfBirth_contains: "الصافية",
      governorate_contains: "العاصمة",
      district_contains: "الصافية",
      bloodType: "O+",
    },
  },
];

// ── Post-processing (mirrors server/routes.ts) ─────────────────────────────

function postProcess(extracted, rawText, documentType = "") {
  // 1. Blood type — clean regex first, then OCR-garbling decoder
  if (!extracted.bloodType) {
    const btClean = rawText.match(/(?:فصيلة\s*الدم|blood\s*type)[^A-Za-z\u0621-\u06FF\d]{0,5}([ABO]{1,2}[+-])/i);
    if (btClean) {
      extracted.bloodType = btClean[1];
    } else {
      const btGarbled = rawText.match(/فصيلة\s*الدم[:\s]*([A-Za-zأإاوي\+©\-]{1,4})/);
      if (btGarbled) {
        const candidate = btGarbled[1]
          .replace(/ي/g, "O").replace(/©/g, "+").replace(/0(?=[+-])/g, "O")
          .replace(/أ/g, "A").replace(/ب/g, "B").trim();
        if (/^(O|A|B|AB)[+-]$/.test(candidate)) extracted.bloodType = candidate;
      }
    }
  }
  // 1b. Passport DOB year correction (pre-1950 = OCR noise)
  if (documentType === "passport" && extracted.dateOfBirth) {
    const dobYear = parseInt(extracted.dateOfBirth.slice(0, 4));
    if (dobYear < 1950 || dobYear > 2010) {
      const altYears = [...rawText.matchAll(/\b(19[5-9]\d|200\d|201[0-5])\b/g)].map(m => m[1]);
      if (altYears.length > 0) extracted.dateOfBirth = altYears[0] + extracted.dateOfBirth.slice(4);
    }
  }
  // 2. "اليمن" is country name, NOT a governorate
  if (extracted.governorate === "اليمن" || extracted.governorate === "Yemen") {
    extracted.governorate = extracted.district ?? null;
    extracted.district = null;
  }
  // 3. If placeOfBirth starts with "اليمن - X", derive governorate=X
  if (!extracted.governorate && extracted.placeOfBirth) {
    const pobClean = extracted.placeOfBirth.replace(/\d{4}[\/\-]\d{2}[\/\-]\d{2}/g, "").trim().replace(/\s*-\s*$/, "").trim();
    const yemenMatch = pobClean.match(/^اليمن\s*[-–]\s*(.+)/);
    if (yemenMatch) {
      extracted.governorate = yemenMatch[1].split(/\s*[-–]\s*/)[0].trim();
      const distPart = yemenMatch[1].split(/\s*[-–]\s*/)[1];
      if (distPart) extracted.district = distPart.trim();
    }
  }
  // 4. Strip date strings from placeOfBirth (combined field on new ID)
  if (extracted.placeOfBirth) {
    extracted.placeOfBirth = extracted.placeOfBirth
      .replace(/\d{4}[\/\-]\d{2}[\/\-]\d{2}/g, "")
      .replace(/\s*[-–]\s*$/, "")
      .trim();
  }
  // 5. Strip wrong prefixes from governorate/district
  if (extracted.governorate) extracted.governorate = extracted.governorate.replace(/^(محافظة|مديرية)\s+/u, "").trim();
  if (extracted.district)    extracted.district    = extracted.district.replace(/^(مديرية|حي|قضاء)\s+/u, "").trim();
  return extracted;
}

// ── Deepseek prompt builder ────────────────────────────────────────────────

function buildPrompt(rawText, documentType) {
  const docTypeHint = documentType === "passport"
    ? `The source document is a Yemeni PASSPORT (جواز سفر).
PASSPORT-SPECIFIC RULES:
- fullName MUST be the Arabic name (الاسم بالعربية / الاسم الثلاثي) — do NOT use the English/Latin romanized name from the MRZ zone or bio page header.
- documentNumber: the passport number printed on the bio page labeled "رقم الجواز" or the alphanumeric code in the MRZ line 2 before the first check digit.
- The MRZ zone has two lines of 44 characters. Line 1 starts with P<YEM. Line 2 format: [passportNo][check][nationality][YYMMDD=DOB][check][gender][YYMMDD=expiry][check][personalNo][check][check].
  - Date of birth is characters 14-19 of MRZ line 2 (YYMMDD) — if YY >= 30 it is 1900s else 2000s.
  - Expiry date is characters 22-27 of MRZ line 2 (YYMMDD).
- issueDate: look for "تاريخ الإصدار" or "DATE OF ISSUE" on the bio page.
- expiryDate: look for "تاريخ الانتهاء" / "DATE OF EXPIRY" on the bio page; OR decode MRZ line 2 characters 22-27 as YYMMDD.
- placeOfBirth: look for "مكان الميلاد" or "PLACE OF BIRTH" — return the Arabic text.
- gender: M in MRZ = male, F = female.`
    : `The source document is a Yemeni National ID card (بطاقة شخصية / الرقم الوطني).
ID-SPECIFIC RULES:
- Two layouts: northern design (Republic of Yemen / Ministry of Interior header, separate fields) and new/southern design (large national number prominently displayed, combined place+date of birth field).
- documentNumber appears after "الرقم الوطني:" or as a standalone large number — keep any dashes.
- fullName appears after "الاسم:" — always Arabic.
- placeOfBirth appears after "مكان الميلاد:" or "مكان وتاريخ الميلاد:" — may encode "governorate – district" separated by dash.
- The ID front typically does NOT have an expiry date — leave expiryDate null unless explicitly printed.
- Split placeOfBirth into governorate and district when it contains " - " or " – " or " / ".`;

  return `You are a data extraction specialist for Yemeni identity documents. You will receive raw OCR text scanned from a document and must extract structured fields from it.

${docTypeHint}

Raw OCR text:
"""
${rawText}
"""

Extract the following fields and return ONLY a valid JSON object (no markdown, no explanation):
{
  "fullName": "<full Arabic name ONLY — never English/Latin romanization, or null>",
  "documentNumber": "<national ID number or passport number, or null>",
  "dateOfBirth": "<YYYY-MM-DD format, or null>",
  "placeOfBirth": "<place of birth in Arabic exactly as written, or null>",
  "governorate": "<Yemeni governorate in Arabic — strip prefix محافظة/أمانة — extracted from placeOfBirth or address fields, or null>",
  "district": "<district/city in Arabic — strip prefix مديرية/حي — extracted from placeOfBirth, or null>",
  "subdistrict": "<uzlah in Arabic, or null>",
  "issueDate": "<YYYY-MM-DD format, or null>",
  "expiryDate": "<YYYY-MM-DD format — for passports check bio page AND MRZ chars 22-27, or null>",
  "gender": "<male|female|null>",
  "bloodType": "<blood type like A+/B-/O+/AB+, or null>",
  "docConfidence": <0-100 confidence in extraction quality>
}

General rules:
- ALL name and place fields must be in Arabic script — never return English/Latin romanized text for these fields.
- Dates like 1992/05/22 or 22/05/1992 or 22-05-1992 → convert to YYYY-MM-DD. Always prefer a year between 1950-2015 for date of birth when multiple options appear (discard OCR noise).
- BLOOD TYPE: Look specifically for text immediately after "فصيلة الدم" or ":الدم" — common values are O+, O-, A+, A-, B+, B-, AB+, AB-. If you see a + or - near those labels, return the blood type.
- PLACE OF BIRTH handling:
  a. "اليمن" (Yemen) is the COUNTRY name, not a governorate — if placeOfBirth begins with "اليمن - X", treat X as the governorate.
  b. If placeOfBirth contains " - " or " – " separating two parts, the first (non-country) part is the governorate and the second part is the district. Remove any date portion (YYYY/MM/DD) found in the placeOfBirth string.
  c. Strip Arabic prefixes from governorate (محافظة / أمانة) and district (مديرية / حي) before returning their values.
- For passports: if Arabic fullName is not visible in the text, return null — do NOT construct from English MRZ components.
- If a field is not found in the text, return null for that field.
- Return ONLY the JSON object — no markdown fences, no explanation.`;
}

// ── OCR + Deepseek call ────────────────────────────────────────────────────

async function runOCR(imagePath) {
  console.log(`  [OCR] Running Tesseract (ara+eng) on ${path.basename(imagePath)}...`);
  const result = await recognize(imagePath, "ara+eng", {
    logger: m => { if (m.status === "recognizing text") process.stdout.write(`\r  [OCR] ${Math.round(m.progress * 100)}%   `); },
  });
  console.log("");
  return result.data.text;
}

async function runDeepseek(rawText, documentType) {
  const prompt = buildPrompt(rawText, documentType);
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.1,
    }),
  });
  if (!response.ok) {
    throw new Error(`Deepseek error: ${await response.text()}`);
  }
  const aiRes = await response.json();
  const content = aiRes.choices?.[0]?.message?.content ?? "";
  const jsonStr = content.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Could not parse JSON from Deepseek response: " + content.slice(0, 200));
  }
}

// ── Scoring helper ─────────────────────────────────────────────────────────

function score(extracted, expected) {
  let pass = 0, fail = 0, issues = [];
  for (const [key, exp] of Object.entries(expected)) {
    if (key.endsWith("_contains")) {
      const field = key.replace("_contains", "");
      const got = extracted[field] ?? "";
      if (got && got.includes(exp)) {
        pass++;
      } else {
        fail++;
        issues.push(`FAIL ${field}: expected to contain "${exp}", got "${got}"`);
      }
    } else {
      const got = extracted[key] ?? null;
      if (exp === null && got === null) {
        pass++;
      } else if (exp !== null && got !== null && String(got).trim() === String(exp).trim()) {
        pass++;
      } else {
        fail++;
        issues.push(`FAIL ${key}: expected "${exp}", got "${got}"`);
      }
    }
  }
  return { pass, fail, issues };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FOMS OCR + Deepseek End-to-End Test");
  console.log("═══════════════════════════════════════════════════════════\n");

  let totalPass = 0, totalFail = 0;

  for (const doc of DOCS) {
    console.log(`\n──────────────────────────────────────────────────────────`);
    console.log(`  📄 ${doc.label}`);
    console.log(`──────────────────────────────────────────────────────────`);

    const imagePath = path.join(__dirname, "..", doc.file);

    // Step 1: OCR
    let rawText;
    try {
      rawText = await runOCR(imagePath);
    } catch (e) {
      console.error(`  ❌ OCR FAILED: ${e.message}`);
      continue;
    }
    console.log(`\n  [RAW OCR TEXT] ─────────────────────────────────────────`);
    console.log(rawText.split("\n").map(l => "  " + l).join("\n"));

    // Step 2: Deepseek
    console.log(`\n  [DEEPSEEK] Sending to AI...`);
    let extracted;
    try {
      extracted = postProcess(await runDeepseek(rawText, doc.type), rawText, doc.type);
    } catch (e) {
      console.error(`  ❌ DEEPSEEK FAILED: ${e.message}`);
      continue;
    }
    console.log(`\n  [EXTRACTED] ────────────────────────────────────────────`);
    console.log(JSON.stringify(extracted, null, 2).split("\n").map(l => "  " + l).join("\n"));

    // Step 3: Score
    const { pass, fail, issues } = score(extracted, doc.expected);
    totalPass += pass; totalFail += fail;
    console.log(`\n  [SCORE] ${pass}/${pass + fail} fields correct`);
    if (issues.length) {
      issues.forEach(i => console.log(`  ⚠️  ${i}`));
    } else {
      console.log(`  ✅ All expected fields match!`);
    }
  }

  console.log(`\n\n═══════════════════════════════════════════════════════════`);
  console.log(`  TOTAL: ${totalPass} passed, ${totalFail} failed`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
