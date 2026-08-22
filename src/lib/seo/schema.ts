// src/lib/seo/schema.ts
// Schema.org Structured Data Generators adhering strictly to Google Rich Results guidelines

import type { PublicJobItem } from '../public_queries.ts';
import type { Organization } from '../types.ts';
import type { FAQItem } from '../ai/types.ts';

/**
 * Builds Schema.org BreadcrumbList JSON-LD
 */
export function buildBreadcrumbSchema(
  items: { name: string; href?: string }[],
  siteUrl: string = 'https://sarkariinfo.in'
) {
  const baseOrigin = siteUrl.replace(/\/+$/, '');
  
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: baseOrigin,
      },
      ...items
        .filter(item => item.name && item.name !== 'Home')
        .map((item, index) => ({
          '@type': 'ListItem',
          position: index + 2,
          name: item.name,
          ...(item.href ? { item: new URL(item.href, baseOrigin).toString() } : {}),
        })),
    ],
  };
}

/**
 * Builds Schema.org WebSite JSON-LD with SearchAction
 */
export function buildWebSiteSchema(
  siteName: string = 'Sarkari Info',
  siteUrl: string = 'https://sarkariinfo.in'
) {
  const baseOrigin = siteUrl.replace(/\/+$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: baseOrigin,
    description: "India's Premier Verified Government Jobs, Results, Admit Cards & Schemes Portal.",
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseOrigin}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Builds Schema.org Organization JSON-LD
 */
export function buildOrganizationSchema(org: Organization, siteUrl: string = 'https://sarkariinfo.in') {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url: org.website || undefined,
    logo: org.logo_r2_key ? `${siteUrl.replace(/\/+$/, '')}/api/documents/${org.logo_r2_key}` : undefined,
  };
}

/**
 * Builds Schema.org JobPosting JSON-LD
 */
export function buildJobPostingSchema(item: PublicJobItem, siteUrl: string = 'https://sarkariinfo.in') {
  const baseOrigin = siteUrl.replace(/\/+$/, '');
  const url = `${baseOrigin}/jobs/${item.slug}`;

  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: item.title,
    description: item.meta_description || item.excerpt || item.title,
    datePosted: item.published_at || item.created_at,
    url,
    employmentType: 'FULL_TIME',
    hiringOrganization: {
      '@type': 'Organization',
      name: item.organization_name || 'Government of India',
      sameAs: item.organization_website || undefined,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'IN',
      },
    },
  };

  if (item.application_last_date) {
    schema.validThrough = `${item.application_last_date}T23:59:59+05:30`;
  }

  if (item.salary) {
    schema.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: 'INR',
      value: {
        '@type': 'QuantitativeValue',
        value: item.salary,
        unitText: 'MONTH',
      },
    };
  }

  if (item.qualification) {
    schema.educationRequirements = item.qualification;
  }

  return schema;
}

/**
 * Builds Schema.org Article JSON-LD for informational posts
 */
export function buildArticleSchema(item: PublicJobItem, siteUrl: string = 'https://sarkariinfo.in') {
  const baseOrigin = siteUrl.replace(/\/+$/, '');
  const url = `${baseOrigin}/${item.type === 'job' ? 'jobs' : item.type.replace('_', '-')}/${item.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: item.title,
    description: item.meta_description || item.excerpt || item.title,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    datePublished: item.published_at || item.created_at,
    dateModified: item.updated_at || item.published_at || item.created_at,
    author: {
      '@type': 'Organization',
      name: 'Sarkari Info Editorial Desk',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Sarkari Info',
      url: baseOrigin,
    },
  };
}

/**
 * Builds Schema.org FAQPage JSON-LD strictly when valid FAQs exist
 */
export function buildFaqSchema(faqs: FAQItem[]) {
  if (!faqs || faqs.length === 0) return null;

  const validFaqs = faqs.filter(f => f.question && f.answer && f.question.trim().length > 0 && f.answer.trim().length > 0);
  if (validFaqs.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: validFaqs.map(faq => ({
      '@type': 'Question',
      name: faq.question.trim(),
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer.trim(),
      },
    })),
  };
}
