// src/lib/ai/verifier.ts
// Critical Field Verification and Conflict Detection Engine

import type { ExtractedData, VerificationConflict, VerificationResult } from './types.ts';
import { validateAllExtractedLinks } from './link_verifier.ts';

/**
 * Normalizes strings and numbers for comparison
 */
function normalizeForSearch(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .toLowerCase()
    .replace(/[,\s\-_/]/g, '');
}

/**
 * Checks if a specific date or number string exists in the raw source content
 */
function checkValueExistsInSource(val: any, rawSource: string): boolean {
  if (val === null || val === undefined || val === '') return true; // nullable field is okay
  const normVal = normalizeForSearch(val);
  if (!normVal) return true;

  const normSource = normalizeForSearch(rawSource);
  if (normSource.includes(normVal)) return true;

  // For dates like "2026-09-20", check day/month/year parts e.g. "20", "09", "2026" or "20september2026"
  const dateMatch = String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const [_, year, month, day] = dateMatch;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthName = months[parseInt(month, 10) - 1] || '';
    if (
      normSource.includes(`${day}${month}${year}`) ||
      normSource.includes(`${day}${monthName}${year}`) ||
      normSource.includes(`${monthName}${day}${year}`) ||
      (normSource.includes(day) && normSource.includes(year))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts number sequences from a string e.g. "12,345" -> ["12345"]
 */
function extractNumbers(text: string): string[] {
  const matches = text.match(/\b\d+(?:,\d+)*\b/g) || [];
  return matches.map((m) => m.replace(/,/g, ''));
}

/**
 * Verifies extracted structured facts against raw source text deterministically
 */
export function verifyExtractedData(
  extracted: ExtractedData,
  rawSourceText: string,
  sourceBaseUrl?: string
): VerificationResult {
  const conflicts: VerificationConflict[] = [];
  let checkedFields = 0;

  const rawClean = rawSourceText || '';
  const linksValidation = validateAllExtractedLinks(extracted, sourceBaseUrl);

  // 1. Check Link Conflicts
  for (const link of linksValidation) {
    if (link.status === 'broken') {
      conflicts.push({
        field: link.field,
        extractedValue: link.url,
        sourceValue: null,
        snippet: link.url,
        severity: 'CRITICAL',
        reason: `Broken or malformed official URL: ${link.flagReason || 'Invalid link format'}`,
      });
    } else if (link.status === 'suspicious') {
      conflicts.push({
        field: link.field,
        extractedValue: link.url,
        sourceValue: null,
        snippet: link.url,
        severity: 'CRITICAL',
        reason: `Suspicious link or unauthorized domain detected: ${link.flagReason}`,
      });
    }
  }

  // 2. Check Vacancy Conflict (Critical for jobs)
  if ('vacancy' in extracted && extracted.vacancy) {
    checkedFields++;
    const vacStr = String(extracted.vacancy).trim();
    const vacNumbers = extractNumbers(vacStr);

    if (vacNumbers.length > 0) {
      const primaryNum = vacNumbers[0];
      const sourceNumbers = extractNumbers(rawClean);

      // If the primary vacancy number is not anywhere in the source numbers, check if there's a nearby digit conflict
      if (!sourceNumbers.includes(primaryNum)) {
        // Look for similar length numbers in source text to detect digit transpositions e.g. 12354 vs 12345
        const candidateMismatch = sourceNumbers.find((sn) => Math.abs(sn.length - primaryNum.length) === 0);
        conflicts.push({
          field: 'vacancy',
          extractedValue: extracted.vacancy,
          sourceValue: candidateMismatch || 'Not found in source',
          snippet: `Extracted: ${extracted.vacancy}`,
          severity: 'CRITICAL',
          reason: `Extracted vacancy "${extracted.vacancy}" does not match numbers found in source text. Possible hallucination or misread digit.`,
        });
      }
    }
  }

  // 3. Check Advertisement Number
  if ('advertisement_number' in extracted && extracted.advertisement_number) {
    checkedFields++;
    if (!checkValueExistsInSource(extracted.advertisement_number, rawClean)) {
      conflicts.push({
        field: 'advertisement_number',
        extractedValue: extracted.advertisement_number,
        sourceValue: null,
        snippet: `Advt No: ${extracted.advertisement_number}`,
        severity: 'WARNING',
        reason: `Advertisement number "${extracted.advertisement_number}" could not be confirmed in source text.`,
      });
    }
  }

  // 4. Check Application Dates (Critical for jobs)
  if ('application_last_date' in extracted && extracted.application_last_date) {
    checkedFields++;
    if (!checkValueExistsInSource(extracted.application_last_date, rawClean)) {
      conflicts.push({
        field: 'application_last_date',
        extractedValue: extracted.application_last_date,
        sourceValue: null,
        snippet: `Last Date: ${extracted.application_last_date}`,
        severity: 'CRITICAL',
        reason: `Application last date "${extracted.application_last_date}" does not appear in official source text.`,
      });
    }
  }

  if ('application_start' in extracted && extracted.application_start) {
    checkedFields++;
    if (!checkValueExistsInSource(extracted.application_start, rawClean)) {
      conflicts.push({
        field: 'application_start',
        extractedValue: extracted.application_start,
        sourceValue: null,
        snippet: `Start Date: ${extracted.application_start}`,
        severity: 'WARNING',
        reason: `Application start date "${extracted.application_start}" could not be verified directly in source text.`,
      });
    }
  }

  // 5. Check Result / Admit Card / Answer Key Dates
  if ('result_date' in extracted && extracted.result_date) {
    checkedFields++;
    if (!checkValueExistsInSource(extracted.result_date, rawClean)) {
      conflicts.push({
        field: 'result_date',
        extractedValue: extracted.result_date,
        sourceValue: null,
        snippet: `Result Date: ${extracted.result_date}`,
        severity: 'CRITICAL',
        reason: `Result date "${extracted.result_date}" was not confirmed in source content.`,
      });
    }
  }

  if ('admit_card_date' in extracted && extracted.admit_card_date) {
    checkedFields++;
    if (!checkValueExistsInSource(extracted.admit_card_date, rawClean)) {
      conflicts.push({
        field: 'admit_card_date',
        extractedValue: extracted.admit_card_date,
        sourceValue: null,
        snippet: `Admit Card Date: ${extracted.admit_card_date}`,
        severity: 'CRITICAL',
        reason: `Admit card date "${extracted.admit_card_date}" was not confirmed in source content.`,
      });
    }
  }

  if ('answer_key_date' in extracted && extracted.answer_key_date) {
    checkedFields++;
    if (!checkValueExistsInSource(extracted.answer_key_date, rawClean)) {
      conflicts.push({
        field: 'answer_key_date',
        extractedValue: extracted.answer_key_date,
        sourceValue: null,
        snippet: `Answer Key Date: ${extracted.answer_key_date}`,
        severity: 'CRITICAL',
        reason: `Answer key date "${extracted.answer_key_date}" was not confirmed in source content.`,
      });
    }
  }

  // 6. Verify Evidence snippets are authentic (not fabricated)
  if (extracted.evidence && Array.isArray(extracted.evidence)) {
    for (const ev of extracted.evidence) {
      if (ev.evidence && ev.evidence.length > 5) {
        const normEv = normalizeForSearch(ev.evidence);
        const normSrc = normalizeForSearch(rawClean);
        const valueExists = checkValueExistsInSource(ev.value, rawClean);
        const snippetMatches = normSrc.includes(normEv.slice(0, 20)) || normSrc.includes(normEv.slice(-20)) || normEv.split(' ').some(w => w.length > 4 && normSrc.includes(w));
        
        if (!valueExists && !snippetMatches) {
          conflicts.push({
            field: ev.field,
            extractedValue: ev.value,
            sourceValue: null,
            snippet: ev.evidence,
            severity: 'WARNING',
            reason: `Evidence snippet for field "${ev.field}" was not found verbatim in the source document.`,
          });
        }
      }
    }
  }

  const hasCriticalConflicts = conflicts.some((c) => c.severity === 'CRITICAL');
  const isVerified = !hasCriticalConflicts && conflicts.length === 0;
  const confidence = hasCriticalConflicts ? 0.4 : conflicts.length > 0 ? 0.75 : 0.98;

  return {
    isVerified,
    hasCriticalConflicts,
    conflicts,
    confidence,
    linksValidated: linksValidation,
    checkedFieldsCount: checkedFields,
  };
}
