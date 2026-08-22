// src/lib/utils.ts

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/&/g, '-and-') // Replace & with 'and'
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

/**
 * Format date in standard Indian format (DD MMM YYYY or DD/MM/YYYY)
 */
export function formatDate(dateString?: string | null, includeTime: boolean = false): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;

    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    };

    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = true;
    }

    return new Intl.DateTimeFormat('en-IN', options).format(d);
  } catch {
    return dateString;
  }
}

/**
 * Get human readable content type badge
 */
export function getContentTypeLabel(type: string): { label: string; bg: string; text: string } {
  switch (type) {
    case 'job':
      return { label: 'Latest Job', bg: 'bg-blue-50 border-blue-200 text-blue-700', text: 'text-blue-700' };
    case 'result':
      return { label: 'Result', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', text: 'text-emerald-700' };
    case 'admit_card':
      return { label: 'Admit Card', bg: 'bg-amber-50 border-amber-200 text-amber-700', text: 'text-amber-700' };
    case 'answer_key':
      return { label: 'Answer Key', bg: 'bg-purple-50 border-purple-200 text-purple-700', text: 'text-purple-700' };
    case 'exam':
      return { label: 'Exam Date', bg: 'bg-rose-50 border-rose-200 text-rose-700', text: 'text-rose-700' };
    case 'scholarship':
      return { label: 'Scholarship', bg: 'bg-teal-50 border-teal-200 text-teal-700', text: 'text-teal-700' };
    case 'syllabus':
      return { label: 'Syllabus', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', text: 'text-indigo-700' };
    case 'scheme':
      return { label: 'Govt Scheme', bg: 'bg-orange-50 border-orange-200 text-orange-700', text: 'text-orange-700' };
    case 'update':
      return { label: 'Important Notice', bg: 'bg-cyan-50 border-cyan-200 text-cyan-700', text: 'text-cyan-700' };
    default:
      return { label: 'Update', bg: 'bg-slate-50 border-slate-200 text-slate-700', text: 'text-slate-700' };
  }
}

/**
 * Generate unique IDs
 */
export function generateId(prefix: string = 'id'): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${randomStr}`;
}

/**
 * Get route prefix for a content type
 */
export function getContentTypeRoute(type: string): string {
  switch (type) {
    case 'job':
      return 'jobs';
    case 'result':
      return 'results';
    case 'admit_card':
      return 'admit-card';
    case 'answer_key':
      return 'answer-key';
    case 'exam':
      return 'exams';
    case 'scholarship':
      return 'scholarships';
    case 'syllabus':
      return 'syllabus';
    case 'scheme':
      return 'schemes';
    default:
      return 'important-updates';
  }
}
