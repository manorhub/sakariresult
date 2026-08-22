// src/lib/monetization/ads.ts
// Ad Placement Evaluator & Helper

import type { DbClient } from '../db.ts';
import { getAdsSettings, isFeatureEnabled } from '../settings.ts';
import type { AdsSettings } from '../settings.ts';

export type AdSlotType = 'header' | 'content' | 'sidebar' | 'footer' | 'mobile';

export interface AdDisplayState {
  showAd: boolean;
  isDev: boolean;
  provider: string;
  publisherId: string;
  slotType: AdSlotType;
}

export async function evaluateAdDisplay(
  db: DbClient,
  slotType: AdSlotType,
  isDev = false
): Promise<AdDisplayState> {
  const adsFeatureActive = await isFeatureEnabled(db, 'advertisements', true);
  if (!adsFeatureActive) {
    return { showAd: false, isDev, provider: 'none', publisherId: '', slotType };
  }

  const adsSettings: AdsSettings = await getAdsSettings(db);
  if (!adsSettings.enabled) {
    return { showAd: false, isDev, provider: 'none', publisherId: '', slotType };
  }

  // Check slot-specific toggles
  let slotEnabled = true;
  if (slotType === 'header') slotEnabled = adsSettings.headerAds;
  else if (slotType === 'content') slotEnabled = adsSettings.inContentAds;
  else if (slotType === 'sidebar') slotEnabled = adsSettings.sidebarAds;
  else if (slotType === 'footer') slotEnabled = adsSettings.footerAds;
  else if (slotType === 'mobile') slotEnabled = adsSettings.mobileAds;

  return {
    showAd: slotEnabled,
    isDev,
    provider: adsSettings.provider,
    publisherId: adsSettings.publisherId,
    slotType,
  };
}
