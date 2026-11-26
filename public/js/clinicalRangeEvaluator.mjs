/**
 * ============================================================================
 * CLINICAL REFERENCE INTERVAL & ABNORMALITY EVALUATOR
 * ============================================================================
 * Shared zero-dependency ES module used by both:
 *   - Browser report viewer (`private/pages/pages/reportFormat5.js`)
 *   - Server PDF generator (`src/controllers/reportFormat5Pdf.controller.js`)
 *
 * Clinical Design Principles:
 *   1. Normal values strictly within Biological Reference Interval MUST return
 *      `isAbnormal: false` so routine results stay visually calm.
 *   2. Out-of-range numeric values (`L` / `H`), stratified clinical tiers
 *      (e.g., Cholesterol Desirable vs Borderline, Vitamin D Sufficiency vs
 *      Deficiency, HbA1c Non-diabetic vs Diabetic), dilution titers, and
 *      clinically abnormal qualitative results MUST return `isAbnormal: true`.
 *   3. Blood Group / Rh typing (`O Positive`, `B+`) and explicit negative or
 *      normal qualitative results (`Non-Reactive`, `Absent`, `Nil`, `Clear`)
 *      are never misflagged as abnormal.
 * ============================================================================
 */

const NORMAL_QUALITATIVE_RE =
  /^(?:negative|neg|non[- ]?reactive|nonreactive|unreactive|absent|nil|none|not\s+detected|undetected|un-?detected|not\s+seen|none\s+seen|none\s+isolated|no\s+growth(?:\s+seen)?|sterile|normal|wnl|within\s+normal\s+limits|no\s+abnormality(?:\s+detected)?|no\s+ova(?:\s*(?:or|\/)\s*cyst)?\s+seen|no\s+parasites?\s+seen|no\s+organism\s+seen|clear|pale\s+yellow|straw(?:\s*color(?:ed)?)?|acidic|neutral)$/i;

const BLOOD_GROUP_TEST_RE =
  /\b(?:blood\s*group|abo(?:\s*(?:&|and)?\s*rh)?|rh\s*(?:type|typing|factor|group)|rhesus)\b/i;

const BLOOD_GROUP_VALUE_RE =
  /^\s*(?:(?:A|B|AB|O)\s*(?:positive|negative|\+ve|\-ve|\+|-)|rh\s*(?:positive|negative|\+ve|\-ve))\s*$/i;

const ABNORMAL_TERM_PATTERNS = Object.freeze([
  /\b(?:weakly|faintly|mildly|moderately|strongly)?\s*positive\b/i,
  /\+\s*ve\b/i,
  /\b(?:weakly|faintly)?\s*reactive\b/i,
  /\bdetected\b/i,
  /\b(?:equivocal|indeterminate|borderline)\b/i,
  /\b(?:abnormal|critical|panic)\b/i,
  /\bpresent\b/i,
  /\bgrowth\s+seen\b/i,
  /\borganism\s+isolated\b/i,
]);

const SEMI_QUANTITATIVE_ABNORMAL_RE =
  /^(?:trace|\+{1,4}|[1-4]\s*\+|\+\s*[1-4]|occasional|few|moderate|many|plenty|numerous|full\s*field|loaded)$/i;

const TURBID_APPEARANCE_RE =
  /\b(?:turbid|cloudy|hazy|smoky|bloody|hemolyzed|haemolyzed|lipemic|icteric|purulent)\b/i;

const NORMAL_TIER_KEYWORD_RE =
  /\b(?:normal|desirable|optimal|sufficient|sufficiency|adequate|non[- ]?diabetic|non[- ]?reactive|nonreactive|unreactive|absent|nil|no\s+growth|within\s+normal(?:\s+limits)?|reference(?:\s*range|\s*interval)?|expected|euthyroid|negative|therapeutic|low\s*risk)\b/i;

const ABNORMAL_TIER_KEYWORD_RE =
  /\b(?:borderline|high|very\s*high|low|deficien[a-z]*|insufficien[a-z]*|toxic[a-z]*|excess[a-z]*|pre[- ]?diabet[a-z]*|diabet[a-z]*|impaired|critical|panic|elevated|decreased|hyper[a-z]*|hypo[a-z]*|abnormal|positive|near[- ]?optimal|above\s*optimal)\b/i;

const DEMOGRAPHIC_PAREN_RE =
  /\(([^)]*(?:\byr|\byear|\bmo|\bmonth|\bday|\bwk|\bweek|\badult|\bchild|\bpediatric|\binfant|\bneonate|\bnewborn|\bmale|\bfemale|\bage|\bfasting|\bpp|\bpost\s*prandial|\bnote)[^)]*)\)/gi;

const STANDALONE_AGE_CLAUSE_RE =
  /\b(?:age\s*:?\s*)?\d+(?:\.\d+)?\s*(?:[-–—]|\bto\b)\s*\d+(?:\.\d+)?\s*(?:yrs?|years?|mos?|months?|wks?|weeks?|days?)\b/gi;

function decodeBasicHtmlEntities(raw = "") {
  return String(raw ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&le;|&#8804;|&#x2264;/gi, "<=")
    .replace(/&ge;|&#8805;|&#x2265;/gi, ">=")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&amp;|&#38;/gi, "&");
}

function stripTagsToText(raw = "", preserveNewlines = false) {
  let str = decodeBasicHtmlEntities(raw);
  if (preserveNewlines) {
    str = str.replace(/<br\s*\/?>|<\/(?:p|div|li|tr)>/gi, "\n");
  }
  // Only strip genuine HTML tags/comments; preserve inequality bounds like "< 20 ... > 100"
  str = str.replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^<>]*>/g, " ");
  if (preserveNewlines) {
    return str
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }
  return str.replace(/\s+/g, " ").trim();
}

function normalizeToken(raw = "") {
  return stripTagsToText(raw, false)
    .toLowerCase()
    .replace(/[^a-z0-9+<>.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converts patient age strings (`"45"`, `"45 Years"`, `"6 Months"`, `"14 Days"`) into days.
 */
export function parsePatientAgeDays(rawAge) {
  const clean = stripTagsToText(rawAge, false).toLowerCase();
  if (!clean) return null;
  const match = clean.match(/(\d+(?:\.\d+)?)\s*(y|yr|yrs|year|years|m|mo|mos|month|months|w|wk|wks|week|weeks|d|day|days)?/i);
  if (!match) return null;
  const num = Number.parseFloat(match[1]);
  if (!Number.isFinite(num) || num < 0) return null;
  const unit = (match[2] || "y").toLowerCase();
  if (unit.startsWith("d")) return num;
  if (unit.startsWith("w")) return num * 7;
  if (unit.startsWith("m")) return num * 30.4375;
  return num * 365.25;
}

/**
 * Parses scalar numeric result values (`"14.2"`, `"11,800"`, `"45%"`, `"< 0.05"`, `"> 200"`, `"18.5 mg/dL"`, `"18.5 *"`).
 * Rejects composite values such as BP `"120/80"`, dilution ratios `"1:160"`, ranges `"2-4"`, or date strings.
 */
export function parseObservedNumeric(rawValue) {
  const trimmed = stripTagsToText(rawValue, false);
  if (!trimmed) return null;
  // Do not coerce numeric ratios ("1:160", "120/80"), dates, or ranges ("2-4")
  if (/\d\s*[/:]\s*\d/.test(trimmed)) return null;
  if (/^\s*\d+(?:\.\d+)?\s*[-–—]\s*\d+(?:\.\d+)?\b/.test(trimmed)) return null;
  if (/^\s*(?:negative|non[- ]?reactive|absent|nil|normal|positive|reactive|present)\b/i.test(trimmed)) return null;

  const normalized = trimmed.replace(/,/g, "").trim();
  const strictMatch = normalized.replace(/\s*%+$/, "").trim().match(/^(<=|>=|<|>|≤|≥)?\s*([+-]?\d+(?:\.\d+)?)$/);
  const unitMatch = strictMatch
    ? strictMatch
    : normalized.match(
        /^(<=|>=|<|>|≤|≥)?\s*([+-]?\d+(?:\.\d+)?)(?:\s*(?:%|\/[a-zA-Zµμ^0-9]+|[a-zA-Zµμ*]+(?:\s*\/\s*[a-zA-Zµμ^0-9]+)*|\([HLhl*]+\)))?(?:\s*(?:\([HLhl*]+\)|[HLhl*]))?\s*$/
      );
  if (!unitMatch) return null;

  const num = Number.parseFloat(unitMatch[2]);
  if (!Number.isFinite(num)) return null;

  let comparator = unitMatch[1] || "";
  if (comparator === "≤") comparator = "<=";
  if (comparator === "≥") comparator = ">=";

  return { comparator, num };
}

/**
 * Parses explicit numeric bounds (`"13.0 - 17.0"`, `"< 200"`, `"Up to 40"`, `">= 60"`).
 * Strips demographic labels before `:` and parenthetical age clauses so `(18 - 60 yrs)`
 * is never mistaken for the biological reference interval.
 */
export function parseNumericReferenceBound(rawLine) {
  const line = stripTagsToText(rawLine, false).replace(/,/g, "");
  if (!line) return null;

  const candidates = [];
  const labelColonMatch = line.match(/^([^:]{2,}?[a-zA-Z)\]]\s*):\s*(.+)$/);
  if (labelColonMatch && /\d/.test(labelColonMatch[2])) {
    candidates.push(labelColonMatch[2].trim());
  }
  candidates.push(line);

  for (const candidate of candidates) {
    const withoutAgeParens = candidate
      .replace(DEMOGRAPHIC_PAREN_RE, " ")
      .replace(STANDALONE_AGE_CLAUSE_RE, " ")
      .replace(/\s+/g, " ")
      .trim();
    const parseOrder = withoutAgeParens && /\d/.test(withoutAgeParens) && withoutAgeParens !== candidate
      ? [withoutAgeParens, candidate]
      : [candidate];

    for (const text of parseOrder) {
      // Remove scientific unit multipliers like x10^3 or 10^6 so exponents aren't misread
      const cleaned = text
        .replace(/(?:x|\*)?\s*10\s*\^\s*-?\d+/gi, " ")
        .replace(/≤/g, "<=")
        .replace(/≥/g, ">=")
        .trim();

      // 1. Closed numeric interval: "13.0 - 17.0", "3.5 to 5.5", "-5.0 - +5.0"
      const rangeMatch = cleaned.match(
        /([+-]?\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b|~)\s*([+-]?\d+(?:\.\d+)?)/i
      );
      if (rangeMatch) {
        const low = Number.parseFloat(rangeMatch[1]);
        const high = Number.parseFloat(rangeMatch[2]);
        if (Number.isFinite(low) && Number.isFinite(high) && low <= high) {
          return { type: "range", low, high };
        }
      }

      // 2. Inclusive upper threshold: "<= 200", "Up to 40", "Upto 35", "Max 150"
      const upperInclusiveMatch = cleaned.match(
        /(?:<=|\bup\s*to\b|\bupto\b|\bmax(?:imum)?\b|\bnmt\b|\bnot\s*more\s*than\b)\s*:?\s*([+-]?\d+(?:\.\d+)?)/i
      );
      if (upperInclusiveMatch) {
        const limit = Number.parseFloat(upperInclusiveMatch[1]);
        if (Number.isFinite(limit)) {
          return { type: "upper", limit, strict: false };
        }
      }

      // 3. Strict upper threshold: "< 200", "Below 200", "Less than 150"
      const upperStrictMatch = cleaned.match(
        /(?:<|\bbelow\b|\bless\s*than\b|\bunder\b)\s*:?\s*([+-]?\d+(?:\.\d+)?)/i
      );
      if (upperStrictMatch) {
        const limit = Number.parseFloat(upperStrictMatch[1]);
        if (Number.isFinite(limit)) {
          return { type: "upper", limit, strict: true };
        }
      }

      // 4. Inclusive lower threshold: ">= 60", "Min 40", "At least 40"
      const lowerInclusiveMatch = cleaned.match(
        /(?:>=|\bmin(?:imum)?\b|\bat\s*least\b)\s*:?\s*([+-]?\d+(?:\.\d+)?)/i
      );
      if (lowerInclusiveMatch) {
        const limit = Number.parseFloat(lowerInclusiveMatch[1]);
        if (Number.isFinite(limit)) {
          return { type: "lower", limit, strict: false };
        }
      }

      // 5. Strict lower threshold: "> 40", "Above 40", "Greater than 40"
      const lowerStrictMatch = cleaned.match(
        /(?:>|\babove\b|\bmore\s*than\b|\bgreater\s*than\b)\s*:?\s*([+-]?\d+(?:\.\d+)?)/i
      );
      if (lowerStrictMatch) {
        const limit = Number.parseFloat(lowerStrictMatch[1]);
        if (Number.isFinite(limit)) {
          return { type: "lower", limit, strict: true };
        }
      }
    }
  }

  return null;
}

function compareValueAgainstBound(parsedObs, bound) {
  if (!parsedObs || !bound) return null;
  const { num, comparator } = parsedObs;

  if (bound.type === "range") {
    if (comparator === "<" || comparator === "<=") {
      if (num <= bound.low) return { isAbnormal: true, flag: "L" };
      return { isAbnormal: false, flag: "" };
    }
    if (comparator === ">" || comparator === ">=") {
      if (num >= bound.high) return { isAbnormal: true, flag: "H" };
      return { isAbnormal: false, flag: "" };
    }
    if (num < bound.low) return { isAbnormal: true, flag: "L" };
    if (num > bound.high) return { isAbnormal: true, flag: "H" };
    return { isAbnormal: false, flag: "" };
  }

  if (bound.type === "upper") {
    if (comparator === "<" || comparator === "<=") {
      if (num > bound.limit) return { isAbnormal: true, flag: "H" };
      return { isAbnormal: false, flag: "" };
    }
    if (comparator === ">" || comparator === ">=") {
      if (num >= bound.limit) return { isAbnormal: true, flag: "H" };
      return { isAbnormal: false, flag: "" };
    }
    const isHigh = bound.strict ? num >= bound.limit : num > bound.limit;
    return isHigh ? { isAbnormal: true, flag: "H" } : { isAbnormal: false, flag: "" };
  }

  if (bound.type === "lower") {
    if (comparator === ">" || comparator === ">=") {
      if (num < bound.limit) return { isAbnormal: true, flag: "L" };
      return { isAbnormal: false, flag: "" };
    }
    if (comparator === "<" || comparator === "<=") {
      if (num <= bound.limit) return { isAbnormal: true, flag: "L" };
      return { isAbnormal: false, flag: "" };
    }
    const isLow = bound.strict ? num <= bound.limit : num < bound.limit;
    return isLow ? { isAbnormal: true, flag: "L" } : { isAbnormal: false, flag: "" };
  }

  return null;
}

function lineMatchesAgeDays(label, ageDays) {
  if (ageDays === null || !label) return 0;
  const low = label.toLowerCase();

  const unitToDays = (n, u) => {
    const unit = (u || "y").toLowerCase();
    if (unit.startsWith("d")) return n;
    if (unit.startsWith("w")) return n * 7;
    if (unit.startsWith("m")) return n * 30.4375;
    return n * 365.25;
  };

  const ageRangeMatch = low.match(
    /(\d+(?:\.\d+)?)\s*(?:[-–]|to)\s*(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mos|month|months|y|yr|yrs|year|years)\b/i
  );
  if (ageRangeMatch) {
    const minD = unitToDays(Number.parseFloat(ageRangeMatch[1]), ageRangeMatch[3]);
    const maxD = unitToDays(Number.parseFloat(ageRangeMatch[2]), ageRangeMatch[3]);
    return ageDays >= minD && ageDays <= maxD ? 4 : -4;
  }

  const ageMinMatch = low.match(
    /(?:>=|>|above)\s*(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mos|month|months|y|yr|yrs|year|years)\b/i
  );
  if (ageMinMatch) {
    const minD = unitToDays(Number.parseFloat(ageMinMatch[1]), ageMinMatch[2]);
    return ageDays >= minD ? 3 : -3;
  }

  const ageMaxMatch = low.match(
    /(?:<=|<|up\s*to|upto|below)\s*(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mos|month|months|y|yr|yrs|year|years)\b/i
  );
  if (ageMaxMatch) {
    const maxD = unitToDays(Number.parseFloat(ageMaxMatch[1]), ageMaxMatch[2]);
    return ageDays <= maxD ? 3 : -3;
  }

  if (/\b(?:neonate|newborn)\b/.test(low)) return ageDays <= 30 ? 3 : -3;
  if (/\binfant\b/.test(low)) return ageDays > 28 && ageDays <= 366 ? 3 : -3;
  if (/\b(?:child|children|pediatric|paediatric)\b/.test(low)) return ageDays < 14 * 365.25 ? 2 : -2;
  if (/\badult\b/.test(low)) return ageDays >= 12 * 365.25 ? 2 : -2;

  return 0;
}

function selectTargetNumericBounds(lines, { gender = "", age = "" } = {}) {
  const numericLines = lines
    .map((line) => ({ line, bound: parseNumericReferenceBound(line) }))
    .filter((item) => Boolean(item.bound));

  if (!numericLines.length) return [];
  if (numericLines.length === 1) return [numericLines[0].bound];

  const gNorm = stripTagsToText(gender, false).toLowerCase();
  const isMale = /^(?:m|male|man|boy)$/i.test(gNorm);
  const isFemale = /^(?:f|female|woman|girl)$/i.test(gNorm);
  const ageDays = parsePatientAgeDays(age);

  const hasDemographicLabels = numericLines.some(({ line }) => {
    const labelPart = line.includes(":") ? line.split(":")[0] : line;
    return /\b(?:male|female|men|women|man|woman|boy|girl|adult|child|children|pediatric|paediatric|infant|neonate|newborn|yr|yrs|years?|months?|mo|weeks?|days?|age)\b/i.test(labelPart);
  });

  if (hasDemographicLabels) {
    const scored = numericLines.map((item) => {
      const labelPart = item.line.includes(":") ? item.line.split(":")[0] : item.line;
      let score = 0;
      const mentionsFemale = /\b(?:female|females|women|woman|girls?|f)\b/i.test(labelPart);
      const mentionsMale = /\b(?:male|males|men|man|boys?|m)\b/i.test(labelPart) && !mentionsFemale;

      if (isMale) {
        if (mentionsMale) score += 6;
        else if (mentionsFemale) score -= 10;
      } else if (isFemale) {
        if (mentionsFemale) score += 6;
        else if (mentionsMale) score -= 10;
      }

      if (ABNORMAL_TIER_KEYWORD_RE.test(labelPart) && !NORMAL_TIER_KEYWORD_RE.test(labelPart)) {
        score -= 5;
      }

      score += lineMatchesAgeDays(labelPart, ageDays);
      return { ...item, score };
    });

    const bestScore = Math.max(...scored.map((s) => s.score));
    if (bestScore > 0) {
      return scored.filter((s) => s.score === bestScore).map((s) => s.bound);
    }

    // Gender unspecified ("Other" / empty): never guess a single sex's line if Male & Female both exist
    const nonNegative = scored.filter((s) => s.score >= 0);
    if (nonNegative.length) {
      return nonNegative.map((s) => s.bound);
    }
    return numericLines.map((s) => s.bound);
  }

  // Stratified clinical decision thresholds (e.g. Desirable / Normal / Sufficiency vs Borderline / High / Deficiency)
  const normalTierLine = numericLines.find(({ line }) => {
    const labelPart = line.includes(":") ? line.split(":")[0] : line;
    return NORMAL_TIER_KEYWORD_RE.test(labelPart) && !ABNORMAL_TIER_KEYWORD_RE.test(labelPart);
  });
  if (normalTierLine) {
    return [normalTierLine.bound];
  }

  return [numericLines[0].bound];
}

function evaluateDilutionTiter(valStr, refStr) {
  const valMatch = valStr.match(/^\s*(<=|>=|<|>)?\s*1\s*:\s*(\d+)\s*$/);
  if (!valMatch || !/1\s*:\s*\d+/.test(refStr)) return null;

  const valDenom = Number.parseInt(valMatch[2], 10);
  if (!Number.isFinite(valDenom) || valDenom <= 0) return null;

  const lines = stripTagsToText(refStr, true)
    .split(/\r?\n/)
    .filter(Boolean);
  const targetLine =
    lines.find((l) => NORMAL_TIER_KEYWORD_RE.test(l) && /1\s*:\s*\d+/.test(l)) ||
    lines.find((l) => /1\s*:\s*\d+/.test(l)) ||
    "";

  const strictMatch = targetLine.match(/(?:<|below|negative\s*\(\s*<)\s*1\s*:\s*(\d+)/i);
  if (strictMatch) {
    const limit = Number.parseInt(strictMatch[1], 10);
    if (Number.isFinite(limit)) {
      return valDenom >= limit ? { isAbnormal: true, flag: "H", isNumeric: false } : { isAbnormal: false, flag: "", isNumeric: false };
    }
  }

  const inclusiveMatch = targetLine.match(/(?:<=|up\s*to|upto)\s*1\s*:\s*(\d+)/i);
  if (inclusiveMatch) {
    const limit = Number.parseInt(inclusiveMatch[1], 10);
    if (Number.isFinite(limit)) {
      return valDenom > limit ? { isAbnormal: true, flag: "H", isNumeric: false } : { isAbnormal: false, flag: "", isNumeric: false };
    }
  }

  return null;
}

/**
 * Evaluates a clinical test row and decides:
 *   - `isAbnormal`: whether the ENTIRE row should be highlighted & bolded
 *   - `flag`: `"L"` | `"H"` for numeric out-of-range, `""` for normal or qualitative abnormal
 *   - `isNumeric`: whether a numeric observed result was parsed
 */
function expandReferenceLineSegments(refStr = "") {
  const rawLines = refStr
    ? refStr
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => Boolean(s) && !/^(?:-|—|--|n\/?a)$/i.test(s))
    : [];

  const result = [];
  const inlineSepRe =
    /\s*[|;]\s*|\s+\/\s+|,\s+(?=(?:male|males|female|females|men|women|man|woman|boy|girl|m|f|adult|adults|child|children|pediatric|paediatric|infant|neonate|newborn|desirable|normal|optimal|sufficient|sufficiency|adequate|borderline|high|very\s*high|low|deficien|insufficien|pre[- ]?diabet|diabet|non[- ]?reactive|nonreactive|reactive|equivocal|age)\b)/i;

  for (const line of rawLines) {
    if (inlineSepRe.test(line)) {
      const parts = line.split(inlineSepRe).map((s) => s.trim()).filter(Boolean);
      const parsedCount = parts.filter((p) => Boolean(parseNumericReferenceBound(p))).length;
      if (parts.length >= 2 && parsedCount >= 2) {
        result.push(...parts);
        continue;
      }
    }
    result.push(line);
  }
  return result;
}

export function evaluateClinicalReferenceFlag({
  value,
  reference,
  testName = "",
  gender = "",
  age = "",
  referenceType = "",
  dbIsAbnormal = false,
  dbFlag = "",
} = {}) {
  const valStr = stripTagsToText(value, false);
  const refStr = stripTagsToText(reference, true);
  const cleanDbFlag = /^(?:H|L)$/i.test(String(dbFlag || "").trim())
    ? String(dbFlag).trim().toUpperCase()
    : "";
  const effectiveDbAbnormal = Boolean(dbIsAbnormal || cleanDbFlag);

  if (!valStr || /^(?:-|—|--|n\/?a|null|undefined)$/i.test(valStr)) {
    return { isAbnormal: false, flag: "", isNumeric: false };
  }

  const parsedObs = parseObservedNumeric(valStr);
  const refLines = expandReferenceLineSegments(refStr);

  // 1. Numeric evaluation whenever observed result AND reference contain parseable numeric bounds
  //    (intentionally independent of `referenceType === "text"` because LabFlow stores custom numeric intervals in `.text`)
  if (parsedObs && refLines.length > 0) {
    const candidateBounds = selectTargetNumericBounds(refLines, { gender, age });
    if (candidateBounds.length === 1) {
      const res = compareValueAgainstBound(parsedObs, candidateBounds[0]);
      if (res) return { ...res, isNumeric: true };
    } else if (candidateBounds.length > 1) {
      // Mark abnormal automatically when outside ALL demographic lines, or preserve Enter Result's flag/abnormal mark
      const results = candidateBounds.map((b) => compareValueAgainstBound(parsedObs, b)).filter(Boolean);
      if (results.length > 0) {
        const allLow = results.every((r) => r.flag === "L");
        const allHigh = results.every((r) => r.flag === "H");
        if (allLow) return { isAbnormal: true, flag: "L", isNumeric: true };
        if (allHigh) return { isAbnormal: true, flag: "H", isNumeric: true };
        if (effectiveDbAbnormal) {
          const someLow = results.some((r) => r.flag === "L");
          const someHigh = results.some((r) => r.flag === "H");
          const inferredFlag = cleanDbFlag || (someLow && !someHigh ? "L" : someHigh && !someLow ? "H" : "");
          return { isAbnormal: true, flag: inferredFlag, isNumeric: true };
        }
        return { isAbnormal: false, flag: "", isNumeric: true };
      }
    }
  }

  // 2. Dilution titer comparison (e.g. 1:160 vs < 1:80)
  const titerEval = evaluateDilutionTiter(valStr, refStr);
  if (titerEval) {
    return titerEval;
  }

  // If the value is purely numeric and NO reference interval existed, honour any explicit DB flag or keep calm normal
  if (parsedObs && refLines.length === 0) {
    return { isAbnormal: effectiveDbAbnormal, flag: effectiveDbAbnormal ? cleanDbFlag : "", isNumeric: true };
  }

  // 3. Qualitative / Blood Group / Text evaluation
  const lowerTest = stripTagsToText(testName, false);
  if (BLOOD_GROUP_TEST_RE.test(lowerTest) || BLOOD_GROUP_VALUE_RE.test(valStr)) {
    return { isAbnormal: false, flag: "", isNumeric: false };
  }

  const normVal = normalizeToken(valStr);
  const normRef = normalizeToken(refStr);

  // Explicit normal/negative qualitative terms never falsely highlight
  const refExpectsOnlyPositive =
    (/\bpositive\b/i.test(normRef) ||
      (/\breactive\b/i.test(normRef) && !/\b(?:non[- ]?reactive|nonreactive|unreactive)\b/i.test(normRef))) &&
    !/\b(?:negative|neg|non[- ]?reactive|nonreactive|unreactive|absent|nil|normal)\b/i.test(normRef);
  if (NORMAL_QUALITATIVE_RE.test(valStr.trim()) && !refExpectsOnlyPositive) {
    return { isAbnormal: false, flag: "", isNumeric: false };
  }

  // Exact match against qualitative reference (e.g., "Yellow" vs "Yellow", "Acidic" vs "Acidic")
  if (normRef && normVal === normRef && !effectiveDbAbnormal) {
    return { isAbnormal: false, flag: "", isNumeric: false };
  }

  // Guard negated phrases inside qualitative strings before scanning abnormal keywords
  const strippedNegations = valStr
    .toLowerCase()
    .replace(/\b(?:non[- ]?reactive|nonreactive|unreactive|not\s+detected|undetected|not\s+present|not\s+seen|none\s+seen|no\s+growth|non[- ]?positive|not\s+positive)\b/g, " ");

  const hasExplicitAbnormalTerm = ABNORMAL_TERM_PATTERNS.some((re) => re.test(strippedNegations));
  const refExpectsNegativeOrEmpty =
    !normRef ||
    /\b(?:negative|neg|non[- ]?reactive|nonreactive|absent|nil|none|not\s+detected|sterile|no\s+growth|0)\b/i.test(normRef);

  if (hasExplicitAbnormalTerm) {
    const refExplicitlyExpectedSame =
      normRef &&
      ((/\bpositive\b/i.test(strippedNegations) && /\bpositive\b/i.test(normRef) && !/\bnon|not\b/i.test(normRef)) ||
        (/\bpresent\b/i.test(strippedNegations) && /\bpresent\b/i.test(normRef) && !/\bnot|absent\b/i.test(normRef)));
    if (!refExplicitlyExpectedSame) {
      return { isAbnormal: true, flag: cleanDbFlag, isNumeric: Boolean(parsedObs) };
    }
  }

  if (refExpectsNegativeOrEmpty && SEMI_QUANTITATIVE_ABNORMAL_RE.test(valStr.trim())) {
    return { isAbnormal: true, flag: cleanDbFlag, isNumeric: false };
  }

  if (normRef.includes("clear") && TURBID_APPEARANCE_RE.test(valStr)) {
    return { isAbnormal: true, flag: cleanDbFlag, isNumeric: false };
  }

  // Respect explicit DB flag marked in Enter Result when reference wasn't parsed as a numeric bound
  if (effectiveDbAbnormal && (!parsedObs || refLines.length === 0 || selectTargetNumericBounds(refLines, { gender, age }).length === 0)) {
    return { isAbnormal: true, flag: cleanDbFlag, isNumeric: Boolean(parsedObs) };
  }

  return { isAbnormal: false, flag: "", isNumeric: Boolean(parsedObs) };
}
