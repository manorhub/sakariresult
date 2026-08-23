// scripts/rebrand_to_realsarkariexam.mjs
import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (!['node_modules', 'dist', '.astro', '.wrangler', '.git'].includes(file)) {
        results = results.concat(walk(full));
      }
    } else {
      results.push(full);
    }
  }
  return results;
}

const allFiles = walk('src');

let updatedCount = 0;

for (const filePath of allFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // 1. Domains & URLs
  content = content.replace(/https?:\/\/sarkariinfo\.in/g, 'https://realsarkariexam.com');
  content = content.replace(/https?:\/\/sarkariinfo\.org/g, 'https://realsarkariexam.com');
  content = content.replace(/sarkariinfo\.in/g, 'realsarkariexam.com');
  content = content.replace(/sarkariinfo\.org/g, 'realsarkariexam.com');

  // 2. Email addresses
  content = content.replace(/contact@sarkariinfo\.in/g, 'contact@realsarkariexam.com');
  content = content.replace(/support@sarkariinfo\.org/g, 'support@realsarkariexam.com');
  content = content.replace(/admin@sarkariinfo\.org/g, 'admin@realsarkariexam.com');
  content = content.replace(/noreply@sarkariinfo\.in/g, 'noreply@realsarkariexam.com');

  // 3. Brand text names
  content = content.replace(/Sarkari\s*Info/g, 'RealSarkariExam');
  content = content.replace(/SarkariInfo/g, 'RealSarkariExam');

  // 4. Logo markup & badges
  content = content.replace(
    /SARKARI<span class="text-gov-saffron">INFO<\/span>/g,
    'REAL<span class="text-gov-saffron">SARKARI</span><span class="text-amber-400">EXAM</span>'
  );
  content = content.replace(
    /SARKARI<span class="text-gov-saffron">CMS<\/span>/g,
    'REAL<span class="text-gov-saffron">SARKARI</span>'
  );

  // 5. Logo acronym
  content = content.replace(
    /<div class="w-10 h-10 rounded-lg bg-gradient-to-tr from-gov-saffron to-amber-500 flex items-center justify-center text-white font-black text-xl shadow-sm">\s*SI\s*<\/div>/g,
    '<div class="w-10 h-10 rounded-lg bg-gradient-to-tr from-gov-saffron to-amber-500 flex items-center justify-center text-white font-black text-lg shadow-sm tracking-tighter">RSE</div>'
  );
  content = content.replace(
    /<div class="w-8 h-8 rounded bg-gradient-to-tr from-gov-saffron to-amber-500 flex items-center justify-center text-white font-black text-lg">\s*SI\s*<\/div>/g,
    '<div class="w-8 h-8 rounded bg-gradient-to-tr from-gov-saffron to-amber-500 flex items-center justify-center text-white font-black text-sm tracking-tighter">RSE</div>'
  );
  content = content.replace(
    /<div class="w-8 h-8 rounded bg-gradient-to-tr from-gov-saffron to-amber-500 flex items-center justify-center text-white font-black text-sm">\s*SI\s*<\/div>/g,
    '<div class="w-8 h-8 rounded bg-gradient-to-tr from-gov-saffron to-amber-500 flex items-center justify-center text-white font-black text-xs tracking-tighter">RSE</div>'
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    updatedCount++;
    console.log(`Updated: ${filePath}`);
  }
}

console.log(`\nRebranded ${updatedCount} files to RealSarkariExam (realsarkariexam.com)!`);
