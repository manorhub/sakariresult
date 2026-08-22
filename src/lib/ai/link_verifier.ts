// src/lib/ai/link_verifier.ts
// Official Link Verification and Domain Security Validation

import type { LinkValidationResult } from './types.ts';

const SUSPICIOUS_DOMAINS = [
  'bit.ly',
  'tinyurl.com',
  't.me',
  'goo.gl',
  'is.gd',
  'buff.ly',
  'adf.ly',
  'cutt.ly',
  'ow.ly',
  'free-job-alerts.xyz',
  'sarkari-fake.net',
];

const TRUSTED_GOV_TLDS = [
  '.gov.in',
  '.nic.in',
  '.res.in',
  '.ac.in',
  '.edu.in',
  '.org.in',
  '.mil.in',
  '.gov',
  '.nic',
];

/**
 * Validates a given official URL against security and domain rules
 */
export function validateOfficialUrl(url: string | null | undefined, fieldName: string, sourceBaseUrl?: string): LinkValidationResult {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return {
      url: '',
      field: fieldName,
      isValidFormat: true,
      isAllowedProtocol: true,
      domainMatch: true,
      domainName: '',
      status: 'unverified',
    };
  }

  const trimmed = url.trim();

  // 1. Format & Protocol validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return {
      url: trimmed,
      field: fieldName,
      isValidFormat: false,
      isAllowedProtocol: false,
      domainMatch: false,
      domainName: '',
      status: 'broken',
      flagReason: 'Malformed URL format.',
    };
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  const isAllowedProtocol = protocol === 'http:' || protocol === 'https:';

  if (!isAllowedProtocol) {
    return {
      url: trimmed,
      field: fieldName,
      isValidFormat: true,
      isAllowedProtocol: false,
      domainMatch: false,
      domainName: parsedUrl.hostname,
      status: 'suspicious',
      flagReason: `Disallowed protocol: ${protocol}`,
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // 2. Check for suspicious / url shortener domains
  const isSuspicious = SUSPICIOUS_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  if (isSuspicious) {
    return {
      url: trimmed,
      field: fieldName,
      isValidFormat: true,
      isAllowedProtocol: true,
      domainMatch: false,
      domainName: hostname,
      status: 'suspicious',
      flagReason: `Suspicious domain or URL shortener detected (${hostname}).`,
    };
  }

  // 3. Domain matching check
  const isGovTld = TRUSTED_GOV_TLDS.some((tld) => hostname.endsWith(tld));
  let isSourceDomainMatch = false;

  if (sourceBaseUrl) {
    try {
      const srcHost = new URL(sourceBaseUrl).hostname.toLowerCase();
      isSourceDomainMatch = hostname === srcHost || hostname.endsWith(`.${srcHost}`) || srcHost.endsWith(`.${hostname}`);
    } catch {
      // ignore
    }
  }

  const domainMatch = isGovTld || isSourceDomainMatch || hostname.length > 3;

  return {
    url: trimmed,
    field: fieldName,
    isValidFormat: true,
    isAllowedProtocol: true,
    domainMatch,
    domainName: hostname,
    status: isGovTld || isSourceDomainMatch ? 'valid' : 'unverified',
    flagReason: isGovTld || isSourceDomainMatch ? undefined : 'Domain is not a verified government TLD or source domain match.',
  };
}

/**
 * Validates all URLs present in an extracted structured dataset
 */
export function validateAllExtractedLinks(extracted: any, sourceBaseUrl?: string): LinkValidationResult[] {
  const results: LinkValidationResult[] = [];

  const urlFields = [
    'official_notification_url',
    'official_apply_url',
    'official_website_url',
    'result_url',
    'merit_list_url',
    'cutoff_url',
    'download_url',
    'answer_key_url',
  ];

  for (const field of urlFields) {
    if (extracted && extracted[field]) {
      results.push(validateOfficialUrl(extracted[field], field, sourceBaseUrl));
    }
  }

  return results;
}
