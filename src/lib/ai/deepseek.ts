// src/lib/ai/deepseek.ts
// Secure Server-Side DeepSeek API Client with Retry, Rate-Limiting, Usage Logging, and Robust JSON Parsing

import type { DbClient } from '../db.ts';
import type { AIOperation, DeepSeekClientOptions, DeepSeekUsage } from './types.ts';
import { generateId } from '../utils.ts';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekChatResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class DeepSeekClient {
  private apiKey: string;
  private endpoint: string;
  private defaultModel: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;
  private defaultTimeoutMs: number;
  private defaultRetryCount: number;
  private mockMode: boolean;
  private db: DbClient | null;

  constructor(options: DeepSeekClientOptions = {}, db: DbClient | null = null) {
    this.apiKey = options.apiKey || (typeof process !== 'undefined' ? process.env?.DEEPSEEK_API_KEY : '') || '';
    this.endpoint = options.endpoint || 'https://api.deepseek.com/chat/completions';
    this.defaultModel = options.model || 'deepseek-chat';
    this.defaultTemperature = options.temperature ?? 0.2;
    this.defaultMaxTokens = options.maxTokens ?? 4096;
    this.defaultTimeoutMs = options.timeoutMs ?? 30000;
    this.defaultRetryCount = options.retryCount ?? 2;
    this.mockMode = options.mockMode ?? (!this.apiKey || this.apiKey === 'mock_key' || process.env.NODE_ENV === 'test');
    this.db = db;
  }

  public isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 5;
  }

  public isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Check if daily or monthly limits have been reached before executing an AI call
   */
  public async checkUsageLimits(): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.db) return { allowed: true };

    try {
      // Fetch configured limits from settings
      const dailyLimitSetting = await this.db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['ai_daily_limit']);
      const monthlyLimitSetting = await this.db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['ai_monthly_limit']);
      const aiEnabledSetting = await this.db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['ai_enabled']);

      if (aiEnabledSetting && aiEnabledSetting.value === 'false') {
        return { allowed: false, reason: 'AI processing is currently disabled in admin settings.' };
      }

      const dailyLimit = dailyLimitSetting ? parseInt(dailyLimitSetting.value, 10) : 500;
      const monthlyLimit = monthlyLimitSetting ? parseInt(monthlyLimitSetting.value, 10) : 15000;

      // Count today's requests
      const todayCount = (await this.db.first<{ count: number }>(`
        SELECT COUNT(*) as count FROM ai_generations 
        WHERE created_at >= date('now', 'start of day')
      `))?.count || 0;

      if (todayCount >= dailyLimit) {
        return { allowed: false, reason: `Daily AI request limit (${dailyLimit}) reached.` };
      }

      // Count this month's requests
      const monthCount = (await this.db.first<{ count: number }>(`
        SELECT COUNT(*) as count FROM ai_generations 
        WHERE created_at >= date('now', 'start of month')
      `))?.count || 0;

      if (monthCount >= monthlyLimit) {
        return { allowed: false, reason: `Monthly AI request limit (${monthlyLimit}) reached.` };
      }

      return { allowed: true };
    } catch (err) {
      console.warn('[AI Limit Check Warning]', err);
      return { allowed: true };
    }
  }

  /**
   * Records token usage and duration in the ai_generations table
   */
  public async recordUsage(
    operation: AIOperation,
    model: string,
    usage: DeepSeekUsage,
    status: 'success' | 'failed' | 'rate_limited' | 'conflict_detected',
    errorMessage: string | null = null,
    contentItemId: string | null = null,
    sourcePageId: string | null = null,
    requestId: string | null = null
  ): Promise<void> {
    if (!this.db) return;

    try {
      const id = generateId('aigen');
      await this.db.run(
        `INSERT INTO ai_generations (
          id, content_item_id, source_page_id, operation, model, request_id,
          input_tokens, output_tokens, total_tokens, duration_ms, status, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          id,
          contentItemId,
          sourcePageId,
          operation,
          model,
          requestId || generateId('req'),
          usage.promptTokens || 0,
          usage.completionTokens || 0,
          usage.totalTokens || 0,
          usage.durationMs || 0,
          status,
          errorMessage ? errorMessage.slice(0, 500) : null,
        ]
      );
    } catch (err) {
      console.warn('[AI Usage Logging Warning]', err);
    }
  }

  /**
   * Main completion call with retry logic, timeout, and usage tracking
   */
  public async createChatCompletion(
    messages: DeepSeekMessage[],
    operation: AIOperation,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
      retryCount?: number;
      contentItemId?: string | null;
      sourcePageId?: string | null;
      jsonMode?: boolean;
    } = {}
  ): Promise<{ content: string; usage: DeepSeekUsage; raw: any }> {
    const startTime = Date.now();
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options.retryCount ?? this.defaultRetryCount;

    // Check usage limits
    const limitCheck = await this.checkUsageLimits();
    if (!limitCheck.allowed) {
      const usage: DeepSeekUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 };
      await this.recordUsage(operation, model, usage, 'rate_limited', limitCheck.reason, options.contentItemId, options.sourcePageId);
      throw new Error(`[AI Rate Limit / Cost Control] ${limitCheck.reason}`);
    }

    // Handle Mock Mode for unit tests or offline dev
    if (this.mockMode) {
      const mockResult = this.generateMockResponse(operation, messages);
      const durationMs = Date.now() - startTime;
      const usage: DeepSeekUsage = {
        promptTokens: 120,
        completionTokens: 350,
        totalTokens: 470,
        durationMs,
      };

      await this.recordUsage(operation, model, usage, 'success', null, options.contentItemId, options.sourcePageId);

      return {
        content: mockResult,
        usage,
        raw: { mock: true, model },
      };
    }

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const payload: any = {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        };

        if (options.jsonMode) {
          payload.response_format = { type: 'json_object' };
        }

        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text().catch(() => 'Unknown network error');
          if (res.status === 429) {
            throw new Error(`DeepSeek Rate Limit Exceeded (HTTP 429): ${errText}`);
          }
          throw new Error(`DeepSeek API error (HTTP ${res.status}): ${errText}`);
        }

        const data = (await res.json()) as DeepSeekChatResponse;
        const choice = data.choices?.[0];
        if (!choice || !choice.message?.content) {
          throw new Error('DeepSeek API returned empty choice or missing content');
        }

        const durationMs = Date.now() - startTime;
        const usage: DeepSeekUsage = {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
          durationMs,
        };

        await this.recordUsage(operation, model, usage, 'success', null, options.contentItemId, options.sourcePageId, data.id);

        return {
          content: choice.message.content.trim(),
          usage,
          raw: data,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        // Check if aborted by timeout
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
          lastError = new Error(`DeepSeek request timed out after ${timeoutMs}ms (Attempt ${attempt}/${maxRetries + 1})`);
        }

        if (attempt <= maxRetries) {
          // Exponential backoff: 500ms, 1000ms, 2000ms...
          const backoffMs = Math.pow(2, attempt - 1) * 500;
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const usage: DeepSeekUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs };
    await this.recordUsage(
      operation,
      model,
      usage,
      'failed',
      lastError?.message || 'AI request failed after all retries',
      options.contentItemId,
      options.sourcePageId
    );

    throw lastError || new Error('DeepSeek API request failed.');
  }

  /**
   * Safely parses JSON response from AI, cleaning markdown fences and trailing commas
   */
  public static parseJsonSafely<T = any>(rawText: string): T {
    if (!rawText) throw new Error('Cannot parse empty AI response as JSON');

    let cleaned = rawText.trim();

    // Strip markdown code fences if present e.g. ```json ... ``` or ``` ... ```
    if (cleaned.startsWith('```')) {
      const lines = cleaned.split('\n');
      if (lines[0].startsWith('```')) {
        lines.shift();
      }
      if (lines.length > 0 && lines[lines.length - 1].trim().startsWith('```')) {
        lines.pop();
      }
      cleaned = lines.join('\n').trim();
    }

    // Try direct parse
    try {
      return JSON.parse(cleaned) as T;
    } catch (firstErr) {
      // Attempt safe repair on trailing commas
      try {
        const sanitized = cleaned
          .replace(/,\s*([\]}])/g, '$1') // Remove trailing commas before } or ]
          .replace(/[\u0000-\u0019]+/g, ''); // Remove non-printable control chars
        return JSON.parse(sanitized) as T;
      } catch (secondErr: any) {
        throw new Error(`AI JSON parse failure: ${secondErr.message}. Raw output snippet: "${cleaned.slice(0, 150)}..."`);
      }
    }
  }

  private generateMockResponse(operation: AIOperation, messages: DeepSeekMessage[]): string {
    const userMessage = (messages.find((m) => m.role === 'user')?.content || '').toLowerCase();
    const isAnswerKey = userMessage.includes('answer key') || userMessage.includes('answer keys') || userMessage.includes('objection');
    const isAdmitCard = userMessage.includes('admit card') || userMessage.includes('admit') || userMessage.includes('hall ticket');
    const isResult = userMessage.includes('result') || userMessage.includes('merit') || userMessage.includes('score');

    switch (operation) {
      case 'classification': {
        let type = 'government_job';
        let reason = 'Recruitment notification containing vacancies and application details.';
        if (isResult) {
          type = 'result';
          reason = 'Official announcement of exam results and merit list.';
        } else if (isAdmitCard) {
          type = 'admit_card';
          reason = 'Admit card download notification with hall ticket link.';
        } else if (isAnswerKey) {
          type = 'answer_key';
          reason = 'Answer key and objection window notification.';
        }
        return JSON.stringify({
          type,
          confidence: 0.96,
          reason,
        });
      }

      case 'extraction': {
        if (isResult) {
          return JSON.stringify({
            organization: 'Staff Selection Commission',
            exam_name: 'Combined Graduate Level Examination 2026 Tier 1',
            result_date: '2026-08-15',
            exam_date: '2026-07-10',
            result_url: 'https://ssc.gov.in/results/cgl-2026-tier1.pdf',
            merit_list_url: 'https://ssc.gov.in/results/cgl-2026-merit.pdf',
            cutoff_url: 'https://ssc.gov.in/results/cgl-2026-cutoff.pdf',
            official_website_url: 'https://ssc.gov.in',
            evidence: [
              { field: 'result_date', value: '2026-08-15', evidence: 'Results declared on 15 August 2026.' },
            ],
            extraction_confidence: 0.94,
          });
        }

        if (isAdmitCard) {
          return JSON.stringify({
            organization: 'Union Public Service Commission',
            exam_name: 'Civil Services Preliminary Examination 2026',
            admit_card_date: '2026-05-10',
            exam_date: '2026-05-25',
            download_url: 'https://upsc.gov.in/admit-card/cs-pre-2026',
            official_website_url: 'https://upsc.gov.in',
            evidence: [
              { field: 'admit_card_date', value: '2026-05-10', evidence: 'E-Admit card released on 10 May 2026.' },
            ],
            extraction_confidence: 0.95,
          });
        }

        if (isAnswerKey) {
          return JSON.stringify({
            organization: 'Railway Recruitment Board',
            exam_name: 'RRB NTPC 2026 Stage 1',
            answer_key_date: '2026-06-20',
            objection_start: '2026-06-21',
            objection_end: '2026-06-27',
            answer_key_url: 'https://rrbcdg.gov.in/answer-keys/ntpc-2026.pdf',
            official_website_url: 'https://rrbcdg.gov.in',
            evidence: [
              { field: 'answer_key_date', value: '2026-06-20', evidence: 'Tentative answer keys uploaded on 20 June 2026.' },
            ],
            extraction_confidence: 0.93,
          });
        }

        // Default Job extraction
        return JSON.stringify({
          organization: 'Union Public Service Commission',
          recruitment_name: 'UPSC Civil Services Examination 2026',
          post_name: 'IAS, IPS, IFS & Central Services Group A/B',
          advertisement_number: '05/2026-CSP',
          vacancy: '1056',
          qualification: 'Graduate Degree in any discipline from a recognized University',
          age_min: 21,
          age_max: 32,
          age_relaxation: 'As per central government rules (SC/ST: 5 yrs, OBC: 3 yrs)',
          application_start: '2026-02-14',
          application_last_date: '2026-03-05',
          exam_date: '2026-05-24',
          application_fee: 'Rs. 100/- for General/OBC; Exempted for SC/ST/PwBD/Female',
          salary: 'Level 10 (Rs. 56,100 - 1,77,500)',
          selection_process: 'Preliminary Examination, Main Examination, and Personality Test (Interview)',
          job_location: 'All India',
          official_notification_url: 'https://upsc.gov.in/sites/default/files/Notif-CSP-2026.pdf',
          official_apply_url: 'https://upsconline.nic.in',
          official_website_url: 'https://upsc.gov.in',
          evidence: [
            { field: 'vacancy', value: '1056', evidence: 'The number of vacancies to be filled through the examination is expected to be approximately 1056.' },
            { field: 'application_last_date', value: '2026-03-05', evidence: 'The online Applications can be filled up to 05th March, 2026 till 6:00 PM.' },
            { field: 'advertisement_number', value: '05/2026-CSP', evidence: 'Examination Notice No. 05/2026-CSP' },
          ],
          extraction_confidence: 0.97,
        });
      }

      case 'verification': {
        return JSON.stringify({
          is_verified: true,
          conflicts: [],
          confidence: 0.98,
        });
      }

      case 'article_generation': {
        return `## Overview
The Union Public Service Commission (UPSC) has officially published the recruitment notification for the Civil Services Examination 2026. Eligible graduates are invited to apply for 1,056 vacancies across various prestigious administrative cadres including IAS, IPS, and IFS.

## Important Dates
| Event | Date |
|---|---|
| Notification Release | 14 February 2026 |
| Application Start Date | 14 February 2026 |
| Last Date to Apply Online | 05 March 2026 (06:00 PM) |
| Preliminary Examination Date | 24 May 2026 |

## Vacancy Details
| Post Name | Total Vacancies |
|---|---|
| Civil Services Examination 2026 (IAS, IPS, IFS, Group A & B) | 1,056 |

## Eligibility & Educational Qualification
- Candidates must hold a Bachelor's Degree in any discipline from a recognized University or Institute.
- Final year students appearing for their degree exams are also eligible to apply provisionally.

## Age Limit
- Minimum Age: 21 Years (as on 01 August 2026)
- Maximum Age: 32 Years
- Age relaxation applies as per Government of India guidelines for reserved categories.

## Application Fee
- General / OBC / EWS Male Candidates: Rs. 100/-
- SC / ST / PwBD / Female Candidates: Exempted (Nil)
- Payment Mode: Online via Net Banking, Debit/Credit Card, UPI, or SBI Challan.

## Salary / Pay Scale
- Selected candidates will be placed in Pay Level 10 of the 7th CPC (Basic Pay Rs. 56,100 to Rs. 1,77,500 plus applicable allowances).

## Selection Process
1. Preliminary Examination (Objective Type - GS Paper I & CSAT)
2. Main Written Examination (Descriptive Papers)
3. Personality Test / Interview

## How to Apply
1. Visit the official online application portal at [upsconline.nic.in](https://upsconline.nic.in).
2. Complete One Time Registration (OTR) if not registered earlier.
3. Fill in candidate details, upload scanned photograph and signature.
4. Pay the required application fee and submit the application form.
5. Download and print the confirmation page for future reference.

## Important Official Links
- [Official Notification PDF](https://upsc.gov.in/sites/default/files/Notif-CSP-2026.pdf)
- [Apply Online Portal](https://upsconline.nic.in)
- [UPSC Official Website](https://upsc.gov.in)

## Frequently Asked Questions
- **What is the last date to apply?** The last date to submit online applications is 05 March 2026.
- **How many total vacancies are announced?** A total of 1,056 vacancies are available.

## Disclaimer & Source Attribution
*Disclaimer: This portal is an informational platform for public educational awareness and is not affiliated with the government. Candidates must verify all terms on the official website [upsc.gov.in](https://upsc.gov.in).*`;
      }

      case 'seo_generation': {
        return JSON.stringify({
          meta_title: 'UPSC Civil Services 2026 – Apply Online for 1056 Vacancies, Eligibility & Last Date',
          meta_description: 'UPSC Civil Services 2026 Notification out for 1056 IAS, IPS & IFS posts. Check qualification, age limit, application fee, and apply online before 05 March 2026.',
          excerpt: 'Union Public Service Commission has released the notification for Civil Services 2026 for 1056 vacancies. Graduates aged 21-32 can apply online by 05 March 2026.',
          og_title: 'UPSC Civil Services Recruitment 2026: 1056 Vacancies Announced',
          og_description: 'Apply online for UPSC CSE 2026. Find eligibility, exam dates, syllabus, and official notification download link.',
        });
      }

      case 'faq_generation': {
        return JSON.stringify([
          {
            question: 'What is the last date to apply for UPSC Civil Services 2026?',
            answer: 'The last date to submit online applications on upsconline.nic.in is 05 March 2026 till 6:00 PM.',
            verified_from_field: 'application_last_date',
          },
          {
            question: 'How many vacancies are available in UPSC CSE 2026?',
            answer: 'There are approximately 1,056 vacancies announced across central civil services.',
            verified_from_field: 'vacancy',
          },
          {
            question: 'What is the educational qualification required?',
            answer: 'Candidates must possess a Bachelor degree in any stream from a recognized university.',
            verified_from_field: 'qualification',
          },
          {
            question: 'When is the UPSC Civil Services Preliminary Exam 2026 scheduled?',
            answer: 'The Preliminary Examination is scheduled to be held on 24 May 2026.',
            verified_from_field: 'exam_date',
          },
        ]);
      }

      case 'update_summary': {
        return JSON.stringify({
          has_updates: true,
          summary: 'Important Notice: The application deadline has been extended from 05 March 2026 to 12 March 2026.',
          changes: [
            {
              field: 'application_last_date',
              old_value: '2026-03-05',
              new_value: '2026-03-12',
              description: 'Application deadline extended by 7 days.',
            },
          ],
        });
      }

      default:
        return JSON.stringify({ success: true });
    }
  }
}
