// src/lib/seo/templates.ts
// Reusable, Dynamic SEO Metadata & Description Generation Engine

import type { PublicJobItem } from '../public_queries.ts';

export interface SeoGenerationInput {
  item: PublicJobItem;
  siteName?: string;
  currentYear?: number;
}

export interface GeneratedSeoMetadata {
  title: string;
  description: string;
  focusTopic: string;
  robots: 'index, follow' | 'noindex, follow';
}

/**
 * Generates structured, unique, and natural SEO Title and Meta Description
 * Strictly based on verified available fields.
 */
export function generateSeoMetadata(input: SeoGenerationInput): GeneratedSeoMetadata {
  const { item, siteName = 'RealSarkariExam', currentYear = new Date().getFullYear() } = input;

  const org = item.organization_name || 'Government of India';
  const titleText = item.title.trim();
  const postName = item.post_name || titleText;
  const vacancies = item.total_vacancies ? `${item.total_vacancies} Vacancies` : '';
  const lastDate = item.application_last_date ? `Last Date: ${item.application_last_date}` : '';
  const qualification = item.qualification ? item.qualification.slice(0, 40) : '';

  let generatedTitle = '';
  let generatedDesc = '';
  let focusTopic = `${org} ${postName}`;

  switch (item.type) {
    case 'job': {
      // Pattern: [Organization] [Post] Recruitment [Year] – Vacancy, Eligibility & Apply Online
      const shortOrg = item.organization_name ? item.organization_name.split('(')[0].trim() : 'Govt';
      generatedTitle = `${shortOrg} ${postName} Recruitment ${currentYear} — ${vacancies ? `${vacancies}, ` : ''}Eligibility & Apply Online`;
      
      const parts = [
        `${org} announces ${vacancies ? `${vacancies} for ` : ''}${postName} posts in ${currentYear}.`,
        qualification ? `Eligibility: ${qualification}.` : '',
        lastDate ? `Last date: ${item.application_last_date}.` : '',
        `Download official notification on ${siteName}.`
      ].filter(Boolean);

      generatedDesc = parts.join(' ');
      break;
    }

    case 'result': {
      // Pattern: [Exam/Org] Result [Year] – Check Result, Merit List & Cut Off Marks
      generatedTitle = `${titleText} — Check Result, Merit List & Cut Off Marks`;
      generatedDesc = `Check declared result and scorecards for ${titleText}. Download official selection merit list PDF and category-wise cut-off marks on ${siteName}.`;
      focusTopic = `${titleText} Result`;
      break;
    }

    case 'admit_card': {
      // Pattern: [Exam] Admit Card [Year] – Download Hall Ticket & Exam Dates
      generatedTitle = `${titleText} — Download Hall Ticket & Exam Schedule`;
      generatedDesc = `Download official admit card and call letter for ${titleText}. Check examination shift timings, reporting instructions, and center details on ${siteName}.`;
      focusTopic = `${titleText} Admit Card`;
      break;
    }

    case 'answer_key': {
      // Pattern: [Exam] Answer Key [Year] – Download Solution & Objection Details
      generatedTitle = `${titleText} — Download Solution Key & Raise Objections`;
      generatedDesc = `Download official tentative and master answer key with response sheet for ${titleText}. Check question paper solutions and online objection window on ${siteName}.`;
      focusTopic = `${titleText} Answer Key`;
      break;
    }

    case 'exam': {
      generatedTitle = `${titleText} — Exam Dates, Schedule & Shift Timing Calendar`;
      generatedDesc = `Official examination dates and shift schedules announced for ${titleText}. Check important instructions and preparation notices on ${siteName}.`;
      focusTopic = `${titleText} Exam Schedule`;
      break;
    }

    case 'scholarship': {
      generatedTitle = `${titleText} ${currentYear} — Eligibility, Grant Amount & Apply Online`;
      generatedDesc = `Find eligibility criteria, financial assistance amount, and online application portal for ${titleText}. Verified government education scheme on ${siteName}.`;
      focusTopic = `${titleText} Scholarship`;
      break;
    }

    case 'syllabus': {
      generatedTitle = `${titleText} — Complete Exam Pattern & Syllabus PDF`;
      generatedDesc = `Download subject-wise syllabus, marks distribution, and selection scheme PDF for ${titleText}. Detailed candidate preparation guide on ${siteName}.`;
      focusTopic = `${titleText} Syllabus`;
      break;
    }

    case 'scheme': {
      generatedTitle = `${titleText} — Guidelines, Eligibility & Registration Process`;
      generatedDesc = `Detailed benefits, beneficiary eligibility criteria, and application procedure for ${titleText}. Verified public welfare scheme on ${siteName}.`;
      focusTopic = `${titleText} Scheme`;
      break;
    }

    default: {
      generatedTitle = `${titleText} — Official Government Notice & Circular`;
      generatedDesc = `Read official circular details and important announcements regarding ${titleText} on ${siteName}.`;
      focusTopic = titleText;
      break;
    }
  }

  // Ensure title length is optimal (up to 100 characters)
  if (generatedTitle.length > 100) {
    generatedTitle = generatedTitle.slice(0, 97).trim() + '...';
  }

  // Ensure description length is optimal (120-200 characters)
  if (generatedDesc.length > 200) {
    generatedDesc = generatedDesc.slice(0, 195).trim() + '...';
  }

  return {
    title: generatedTitle,
    description: generatedDesc,
    focusTopic,
    robots: 'index, follow',
  };
}
