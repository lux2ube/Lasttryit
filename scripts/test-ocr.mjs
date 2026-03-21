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

// Yemen governorates list (mirrors DB, Arabic | English)
const GOV_LIST = [
  { nameAr: "أمانة العاصمة", nameEn: "Amant Al-Asmah" },
  { nameAr: "صنعاء", nameEn: "Sanaa" },
  { nameAr: "عدن", nameEn: "Aden" },
  { nameAr: "الحديدة", nameEn: "Al-Hodeidah" },
  { nameAr: "ذمار", nameEn: "Thamar" },
  { nameAr: "عمران", nameEn: "Amran" },
  { nameAr: "حجة", nameEn: "Hajjah" },
  { nameAr: "إب", nameEn: "Ibb" },
  { nameAr: "صعدة", nameEn: "Sa'dah" },
  { nameAr: "البيضاء", nameEn: "Al-Baidha" },
  { nameAr: "شبوة", nameEn: "Shabwah" },
  { nameAr: "تعز", nameEn: "Taiz" },
  { nameAr: "الجوف", nameEn: "Al-jawf" },
  { nameAr: "مأرب", nameEn: "Ma'rib" },
  { nameAr: "حضرموت", nameEn: "Hadramot" },
  { nameAr: "المهرة", nameEn: "Al-Maharah" },
  { nameAr: "الضالع", nameEn: "Al-Dhale'" },
  { nameAr: "المحويت", nameEn: "Al-Mahweet" },
  { nameAr: "لحج", nameEn: "Lahj" },
  { nameAr: "ريمة", nameEn: "Raimah" },
  { nameAr: "سقطرى", nameEn: "Socatra" },
  { nameAr: "أبين", nameEn: "Abyan" },
];

const normaliseStr = s => s.replace(/\s+/g, " ").trim().toLowerCase();
const matchGovArabic = candidate => {
  const n = normaliseStr(candidate);
  const exact = GOV_LIST.find(g => normaliseStr(g.nameAr) === n);
  if (exact) return exact.nameAr;
  const fuzzy = GOV_LIST.find(g => normaliseStr(g.nameAr).includes(n) || n.includes(normaliseStr(g.nameAr)));
  return fuzzy?.nameAr ?? null;
};
const matchGovEnglish = candidate => {
  const n = candidate.toUpperCase().replace(/[^A-Z]/g, "");
  const exact = GOV_LIST.find(g => g.nameEn && g.nameEn.toUpperCase().replace(/[^A-Z]/g, "") === n);
  if (exact) return exact.nameAr;
  const partial = GOV_LIST.find(g => g.nameEn && (g.nameEn.toUpperCase().includes(n) || n.includes(g.nameEn.toUpperCase().replace(/[^A-Z]/g, ""))) && n.length >= 3);
  return partial?.nameAr ?? null;
};

// MRZ name → Arabic reverse transliteration lookup
const TR = {
  AHMED:"احمد", AHMAD:"أحمد", MOHAMMED:"محمد", MUHAMMAD:"محمد", MEHMED:"محمد",
  ALI:"علي", MANSOUR:"منصور", MANSUR:"منصور", SAQR:"صاقر", SAKR:"صاقر",
  ABDULWAHAB:"عبدالوهاب", ABDULWARAB:"عبدالوهاب", ABDULAZIZ:"عبدالعزيز",
  ABDULKARIM:"عبدالكريم", ABDULRAHMAN:"عبدالرحمن", ABDULMALIK:"عبدالملك",
  SALEH:"صالح", SALIH:"صالح", NASSER:"ناصر", NASIR:"ناصر",
  OMAR:"عمر", HASSAN:"حسن", HUSSEIN:"حسين", HUSSAIN:"حسين",
  IBRAHIM:"إبراهيم", ISMAIL:"إسماعيل", KHALED:"خالد", KHALID:"خالد",
  HANI:"هاني", YAHYA:"يحيى", YOUSUF:"يوسف", YUSUF:"يوسف",
  SAEED:"سعيد", SAID:"سعيد", WALID:"وليد", WALED:"وليد",
};

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

  // 6. Validate governorate against DB list (Arabic then English)
  if (extracted.governorate) {
    const arMatch = matchGovArabic(extracted.governorate);
    if (arMatch) {
      extracted.governorate = arMatch;
    } else {
      const enMatch = /^[A-Za-z\s]+$/.test(extracted.governorate) ? matchGovEnglish(extracted.governorate) : null;
      extracted.governorate = enMatch ?? null;
    }
  }
  // 6b. Passport: search raw OCR text for English gov names
  if (documentType === "passport" && !extracted.governorate) {
    const upperOcr = rawText.toUpperCase();
    const found = GOV_LIST.find(g => {
      if (!g.nameEn) return false;
      const en = g.nameEn.toUpperCase().replace(/[^A-Z]/g, "");
      return en.length >= 3 && upperOcr.replace(/[^A-Z]/g, "").includes(en);
    });
    if (found) extracted.governorate = found.nameAr;
  }
  // 6c. Update placeOfBirth from English to Arabic if needed
  if (extracted.governorate && extracted.placeOfBirth && /^[A-Za-z\s]+$/.test(extracted.placeOfBirth)) {
    extracted.placeOfBirth = extracted.governorate;
  }

  // 7. Passport number fallback
  if (documentType === "passport" && !extracted.documentNumber) {
    const ppLabelMatch = rawText.match(/(?:رقم\s*الجواز|Passport\s*No\.?)\s*[:\s#]*([A-Z]?\d{7,9})/i);
    if (ppLabelMatch) {
      extracted.documentNumber = ppLabelMatch[1];
    } else {
      const mrzLine = rawText.match(/([A-Z0-9<]{9,}[<][A-Z]{3})/);
      if (mrzLine) {
        const ppPart = mrzLine[1].split("<")[0].replace(/[^0-9A-Z]/g, "");
        if (/^\d{7,9}$/.test(ppPart)) extracted.documentNumber = ppPart;
      }
      if (!extracted.documentNumber) {
        const candidates = [...rawText.matchAll(/(?<!\d)(\d{8,9})(?!\d)/g)];
        const ppNum = candidates.find(m => !/^(19|20)\d{6}$/.test(m[1]));
        if (ppNum) extracted.documentNumber = ppNum[1];
      }
    }
  }

  // 8. Passport: MRZ line 1 name extraction when Arabic name missing
  if (documentType === "passport" && !extracted.fullName) {
    const mrzNameLine = rawText.match(/[A-Z]{2,}<<([A-Z<]+)/);
    if (mrzNameLine) {
      const fullMrz = mrzNameLine[0];
      const [surnameRaw, givenRaw] = fullMrz.split("<<");
      const surnameClean = surnameRaw.replace(/^[^A-Z]*/, "").replace(/^[A-Z]{1,3}(?=[A-Z]{3,})/, "").replace(/<+$/, "").trim();
      const givenParts = (givenRaw ?? "").split("<").map(p => p.trim()).filter(p => p.length > 1);
      const allParts = [surnameClean, ...givenParts].filter(p => /[AEIOU]/i.test(p) && p.length > 1).slice(0, 4);
      if (allParts.length >= 2) {
        const arabicParts = allParts.map(p => TR[p.toUpperCase()] ?? null);
        const arabicFamilyName = arabicParts[0];
        const arabicGivenParts = arabicParts.slice(1);
        const orderedArabic = [...arabicGivenParts, arabicFamilyName].filter(Boolean);
        if (orderedArabic.length >= 2) {
          extracted.fullName = orderedArabic.join(" ");
          extracted._nameFromMRZ = true;
        }
      }
    }
  }

  return extracted;
}

// ── Deepseek prompt builder ────────────────────────────────────────────────

function buildPrompt(rawText, documentType) {
  const govListStr = GOV_LIST.map(g => g.nameAr).join(" | ");

  const docTypeHint = documentType === "passport"
    ? `The source document is a Yemeni PASSPORT (جواز سفر).
PASSPORT-SPECIFIC RULES:
- fullName: FIRST check if Arabic name (الاسم بالعربية) is visible in the OCR text — use it verbatim if found.
  If Arabic name is NOT visible (OCR shows noise/garbage for the Arabic section), then use your deep knowledge of Arabic names to REVERSE-TRANSLITERATE the English name components into Arabic script.
  Example mappings: AHMED=احمد, MOHAMMED=محمد, ALI=علي, MANSOUR=منصور, SAQR=صاقر, IBRAHIM=إبراهيم, HASSAN=حسن, HUSSEIN=حسين, ABDULWAHAB=عبدالوهاب, ABDULAZIZ=عبدالعزيز, SALEH=صالح, NASSER=ناصر, OMAR=عمر.
  The English name in Yemeni passports: surname first, then given names (all separated by spaces/newlines). Re-order to Arabic sequence: personal + father + grandfather + family.
  IMPORTANT: Return ONLY Arabic script — never return English Latin text in fullName.
- documentNumber: look for 7–9 digit number near label "Passport No" / "رقم الجواز" on bio page.
  Also check MRZ line 2 (the second line containing "<" chars): first 9 chars before first check digit = passport number.
  Example MRZ line 2: "10469492<6YEM..." → passport number is "10469492".
- MRZ line 1 format: P<YEM{SURNAME}<<{GIVEN1}<{GIVEN2}... — extract name from here if Arabic not visible.
- MRZ line 2: chars 14–19 = YYMMDD DOB (YY>=30 → 19xx, else 20xx); chars 22–27 = YYMMDD expiry.
- issueDate: look for "تاريخ الإصدار" / "DATE OF ISSUE".
- expiryDate: look for "تاريخ الانتهاء" / "DATE OF EXPIRY"; OR MRZ chars 22–27.
- placeOfBirth: look for "مكان الميلاد" / "PLACE OF BIRTH" — if only English visible (e.g. "TAIZ YEM") translate to Arabic: TAIZ=تعز, ADEN=عدن, SANAA=صنعاء, IBB=إب, HADRAMOUT=حضرموت, HODEIDAH=الحديدة, DHAMAR=ذمار, MARIB=مأرب.
- governorate: extract from placeOfBirth — apply English→Arabic mapping if needed.
- gender: M in MRZ = male, F = female; also ذكر=male, أنثى=female.`
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
  "placeOfBirth": "<place of birth in Arabic exactly as written on the document, or null>",
  "governorate": "<MUST be one of the exact governorate names listed below — pick closest match, or null>",
  "district": "<district/city in Arabic — strip prefix مديرية/حي — extracted from placeOfBirth, or null>",
  "subdistrict": "<uzlah in Arabic, or null>",
  "issueDate": "<YYYY-MM-DD format, or null>",
  "expiryDate": "<YYYY-MM-DD format — for passports check bio page AND MRZ chars 22-27, or null>",
  "gender": "<male|female|null>",
  "bloodType": "<blood type like A+/B-/O+/AB+, or null>",
  "docConfidence": <0-100 confidence in extraction quality>
}

GOVERNORATE STRICT RULE — the "governorate" field MUST be chosen EXACTLY from this list, or null:
${govListStr}

General rules:
- ALL name and place fields must be in Arabic script — never return English/Latin romanized text for these fields.
- Dates like 1992/05/22 or 22/05/1992 or 22-05-1992 → convert to YYYY-MM-DD. Always prefer a year between 1950-2015 for date of birth when multiple options appear (discard OCR noise).
- BLOOD TYPE: Look specifically for text immediately after "فصيلة الدم" or ":الدم".
- PLACE OF BIRTH handling:
  a. "اليمن" (Yemen) is the COUNTRY name, not a governorate — if placeOfBirth begins with "اليمن - X", treat X as the governorate.
  b. If placeOfBirth contains " - " or " – " separating two parts, the first (non-country) part is the governorate and the second is the district.
  c. Strip Arabic prefixes from governorate (محافظة / أمانة) and district (مديرية / حي).
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
