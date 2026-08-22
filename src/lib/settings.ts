// src/lib/settings.ts
// Centralized Global Settings, Feature Flags & Site Configuration

import type { DbClient } from './db.ts';

export interface GeneralSettings {
  siteName: string;
  logo: string;
  description: string;
  contactEmail: string;
  primaryDomain: string;
}

export interface AdsSettings {
  enabled: boolean;
  provider: 'google_adsense' | 'custom' | 'none';
  publisherId: string;
  headerAds: boolean;
  inContentAds: boolean;
  sidebarAds: boolean;
  footerAds: boolean;
  mobileAds: boolean;
  desktopAds: boolean;
}

export interface SiteSettings {
  maintenanceMode: boolean;
  announcementBar: {
    enabled: boolean;
    text: string;
    link?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  };
  defaultLanguage: string;
  defaultCurrency: string;
}

export interface FeatureFlag {
  key: string;
  name: string;
  enabled: number; // 0 or 1
  description: string;
  updated_at: string;
}

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  siteName: 'Sarkari Info',
  logo: '/logo.svg',
  description: 'India Premier Official Government Jobs, Admit Cards & Results Portal',
  contactEmail: 'contact@sarkariinfo.in',
  primaryDomain: 'https://sarkariinfo.in',
};

const DEFAULT_ADS_SETTINGS: AdsSettings = {
  enabled: true,
  provider: 'google_adsense',
  publisherId: 'ca-pub-0000000000000000',
  headerAds: true,
  inContentAds: true,
  sidebarAds: true,
  footerAds: true,
  mobileAds: true,
  desktopAds: true,
};

const DEFAULT_SITE_SETTINGS: SiteSettings = {
  maintenanceMode: false,
  announcementBar: {
    enabled: true,
    text: 'Official UPSC & SSC 2026 Examination Calendars Announced. Check updates now!',
    link: '/important-updates',
    startDate: null,
    endDate: null,
  },
  defaultLanguage: 'en',
  defaultCurrency: 'INR',
};

export async function getGlobalSetting<T>(db: DbClient, key: string, fallback: T): Promise<T> {
  try {
    const row = await db.first<{ value_json: string }>(
      'SELECT value_json FROM global_settings WHERE key = ?',
      [key]
    );
    if (!row || !row.value_json) return fallback;
    return { ...fallback, ...JSON.parse(row.value_json) };
  } catch {
    return fallback;
  }
}

export async function setGlobalSetting(
  db: DbClient,
  key: string,
  category: string,
  value: any
): Promise<void> {
  const jsonStr = JSON.stringify(value);
  await db.run(`
    INSERT INTO global_settings (key, category, value_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = datetime('now')
  `, [key, category, jsonStr]);
}

export async function getGeneralSettings(db: DbClient): Promise<GeneralSettings> {
  return getGlobalSetting<GeneralSettings>(db, 'general_settings', DEFAULT_GENERAL_SETTINGS);
}

export async function getAdsSettings(db: DbClient): Promise<AdsSettings> {
  return getGlobalSetting<AdsSettings>(db, 'ads_settings', DEFAULT_ADS_SETTINGS);
}

export async function getSiteSettings(db: DbClient): Promise<SiteSettings> {
  return getGlobalSetting<SiteSettings>(db, 'site_settings', DEFAULT_SITE_SETTINGS);
}

// ----------------------------------------------------
// Feature Flags
// ----------------------------------------------------

export async function isFeatureEnabled(db: DbClient, flagKey: string, defaultVal = true): Promise<boolean> {
  try {
    const row = await db.first<{ enabled: number }>(
      'SELECT enabled FROM feature_flags WHERE key = ?',
      [flagKey]
    );
    if (!row) return defaultVal;
    return row.enabled === 1;
  } catch {
    return defaultVal;
  }
}

export async function getAllFeatureFlags(db: DbClient): Promise<FeatureFlag[]> {
  try {
    const res = await db.query<FeatureFlag>('SELECT * FROM feature_flags ORDER BY name ASC');
    return res.results;
  } catch {
    return [];
  }
}

export async function setFeatureFlag(
  db: DbClient,
  key: string,
  enabled: boolean
): Promise<void> {
  await db.run(
    "UPDATE feature_flags SET enabled = ?, updated_at = datetime('now') WHERE key = ?",
    [enabled ? 1 : 0, key]
  );
}
