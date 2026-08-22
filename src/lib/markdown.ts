// src/lib/markdown.ts
// Robust, Server-Side Markdown to HTML Renderer with Tailwind-styled Tables, Headings, Lists & Links

export function renderMarkdownToHtml(markdown: string | null | undefined): string {
  if (!markdown || typeof markdown !== 'string') return '';

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const htmlParts: string[] = [];
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let listItems: string[] = [];

  function flushTable() {
    if (!inTable) return;
    if (tableHeaders.length > 0 || tableRows.length > 0) {
      let tableHtml = '<div class="overflow-x-auto my-5 rounded-xl border border-slate-200 shadow-xs bg-white">';
      tableHtml += '<table class="w-full text-left text-xs sm:text-sm border-collapse">';
      
      if (tableHeaders.length > 0) {
        tableHtml += '<thead class="bg-slate-50 border-b border-slate-200 text-slate-800 font-bold uppercase text-[11px] tracking-wider">';
        tableHtml += '<tr>';
        for (const h of tableHeaders) {
          tableHtml += `<th class="py-3 px-4 sm:px-5">${formatInline(h)}</th>`;
        }
        tableHtml += '</tr></thead>';
      }

      if (tableRows.length > 0) {
        tableHtml += '<tbody class="divide-y divide-slate-100 text-slate-700 font-medium">';
        for (let i = 0; i < tableRows.length; i++) {
          const row = tableRows[i];
          const isEven = i % 2 === 1;
          tableHtml += `<tr class="${isEven ? 'bg-slate-50/50' : 'bg-white'} hover:bg-blue-50/40 transition-colors">`;
          for (let j = 0; j < row.length; j++) {
            const cell = row[j];
            const isHighlight = j > 0 && /\b(202\d|Rs\.?|₹|\d+\s*(?:vacancies|posts|years))\b/i.test(cell);
            tableHtml += `<td class="py-3 px-4 sm:px-5 ${isHighlight ? 'font-semibold text-slate-900' : ''}">${formatInline(cell)}</td>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody>';
      }

      tableHtml += '</table></div>';
      htmlParts.push(tableHtml);
    }
    inTable = false;
    tableHeaders = [];
    tableRows = [];
  }

  function flushList() {
    if (!inList) return;
    if (listItems.length > 0) {
      if (listType === 'ul') {
        let listHtml = '<ul class="space-y-2 my-4 text-xs sm:text-sm text-slate-700 font-normal">';
        for (const item of listItems) {
          listHtml += `<li class="flex items-start"><span class="text-blue-500 mr-2 font-bold text-sm leading-none mt-0.5">•</span><span class="flex-1">${formatInline(item)}</span></li>`;
        }
        listHtml += '</ul>';
        htmlParts.push(listHtml);
      } else {
        let listHtml = '<ol class="space-y-2 my-4 text-xs sm:text-sm text-slate-700 font-normal list-decimal list-inside pl-1">';
        for (const item of listItems) {
          listHtml += `<li class="leading-relaxed"><span class="ml-1">${formatInline(item)}</span></li>`;
        }
        listHtml += '</ol>';
        htmlParts.push(listHtml);
      }
    }
    inList = false;
    listItems = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushTable();
      flushList();
      continue;
    }

    // 1. Table Row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      // Separator row e.g. |---|---|
      if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(trimmed)) {
        continue;
      }

      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else {
      flushTable();
    }

    // 2. Headings
    if (trimmed.startsWith('### ')) {
      flushList();
      const text = trimmed.replace(/^###\s+/, '');
      htmlParts.push(`<h3 class="text-sm sm:text-base font-bold text-slate-800 mt-6 mb-2 tracking-tight">${formatInline(text)}</h3>`);
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushList();
      const text = trimmed.replace(/^##\s+/, '');
      htmlParts.push(`
        <h2 class="text-base sm:text-lg font-bold text-slate-900 border-b border-slate-200 pb-2.5 mt-8 mb-4 flex items-center">
          <span class="w-2 h-2 rounded-full bg-blue-600 inline-block mr-2.5"></span>
          <span>${formatInline(text)}</span>
        </h2>
      `);
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushList();
      const text = trimmed.replace(/^#\s+/, '');
      htmlParts.push(`<h1 class="text-lg sm:text-2xl font-black text-slate-900 mt-6 mb-4">${formatInline(text)}</h1>`);
      continue;
    }

    // 3. Bullet List Item
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ul') {
        flushList();
        inList = true;
        listType = 'ul';
      }
      listItems.push(trimmed.replace(/^[-*]\s+/, ''));
      continue;
    }

    // 4. Numbered List Item
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        flushList();
        inList = true;
        listType = 'ol';
      }
      listItems.push(trimmed.replace(/^\d+\.\s+/, ''));
      continue;
    }

    flushList();

    // 5. Disclaimer / Callout Box
    if (trimmed.toLowerCase().startsWith('*disclaimer:') || trimmed.toLowerCase().startsWith('disclaimer:')) {
      const clean = trimmed.replace(/^\*?disclaimer:\s*/i, '').replace(/\*$/, '');
      htmlParts.push(`
        <div class="my-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed flex items-start space-x-2.5">
          <svg class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <strong class="font-bold text-slate-800">Disclaimer:</strong> ${formatInline(clean)}
          </div>
        </div>
      `);
      continue;
    }

    // 6. Regular Paragraph
    htmlParts.push(`<p class="my-3 text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">${formatInline(trimmed)}</p>`);
  }

  flushTable();
  flushList();

  return htmlParts.join('\n');
}

/**
 * Formats inline Markdown syntax (bold, italic, links, code)
 */
function formatInline(text: string): string {
  if (!text) return '';

  return text
    // Markdown Links [title](url)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 font-semibold hover:underline inline-flex items-center space-x-0.5"><span>$1</span><svg class="w-3 h-3 text-blue-500 inline ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>')
    // Bold **text**
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')
    // Italic *text*
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="italic text-slate-700">$1</em>')
    // Inline code `code`
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs text-slate-800 border border-slate-200">$1</code>');
}
