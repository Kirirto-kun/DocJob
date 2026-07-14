import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CaseMode, PrismaClient } from '@prisma/client';
import {
  CASE_MODE_BY_SUBGROUP,
  type CaseMode as CaseModeLiteral,
} from '../src/lib/case-schema';
import type { SubgroupSlug } from '../src/lib/case-taxonomy';
import * as core from '@docjob/core';

const CASES_DIR = path.resolve(process.cwd(), 'cases');
const DEFAULT_MODE: CaseModeLiteral = 'CLINICAL_QUEST';
const DEFAULT_SUBGROUP: SubgroupSlug = 'clinical';
const DEFAULT_SPECIALTY = 'Акушерство – гинекология';

type ModeHint = {
  mode: CaseModeLiteral;
  subgroup: SubgroupSlug;
  specialty: string;
};

const SUBGROUP_KEYWORDS: { keywords: string[]; subgroup: SubgroupSlug }[] = [
  { keywords: ['санэпид', 'sanepid', 'эпиднадзор', 'вспышк', 'исмп'], subgroup: 'sanepid' },
  { keywords: ['best_practice', 'best-practice', 'лучшая практик', 'успешн'], subgroup: 'best_practices' },
  { keywords: ['management', 'менеджмент', 'управлен'], subgroup: 'management' },
];

function detectSubgroup(filename: string, firstLine: string): SubgroupSlug {
  const haystack = `${filename} ${firstLine}`.toLowerCase();
  for (const { keywords, subgroup } of SUBGROUP_KEYWORDS) {
    if (keywords.some((k) => haystack.includes(k))) return subgroup;
  }
  return DEFAULT_SUBGROUP;
}

function detectSpecialtyFromFirstLine(firstLine: string): string | null {
  const tagMatch = firstLine.match(/Тег:\s*([^)]+)\)/i);
  if (tagMatch?.[1]) return tagMatch[1].trim();
  return null;
}

function deriveModeHint(filename: string, firstLine: string): ModeHint {
  const subgroup = detectSubgroup(filename, firstLine);
  const mode = CASE_MODE_BY_SUBGROUP[subgroup] ?? DEFAULT_MODE;
  const specialty = detectSpecialtyFromFirstLine(firstLine) ?? DEFAULT_SPECIALTY;
  return { mode, subgroup, specialty };
}

function extractCaseName(firstLine: string): string {
  const cleaned = firstLine.replace(/\(Тег:[^)]+\)/i, '').trim();
  return cleaned || firstLine.trim();
}

function bodyFromMarkdown(markdown: string) {
  return {
    blocks: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: markdown }],
      },
    ],
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Set OPENAI_API_KEY in .env.local before running import');
    process.exit(1);
  }

  let dirEntries: string[];
  try {
    dirEntries = await fs.readdir(CASES_DIR);
  } catch (err) {
    console.error(`Не удалось прочитать каталог ${CASES_DIR}:`, err);
    process.exit(1);
  }

  const markdownFiles = dirEntries.filter((f) => f.toLowerCase().endsWith('.md')).sort();
  if (markdownFiles.length === 0) {
    console.log(`В ${CASES_DIR} не найдено .md файлов.`);
    return;
  }

  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      console.error('В базе нет пользователя с ролью ADMIN. Сначала запустите npm run db:seed.');
      process.exit(1);
    }
    const actor: core.Actor = { id: admin.id, role: admin.role, approvedAt: admin.approvedAt };

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const file of markdownFiles) {
      const fullPath = path.join(CASES_DIR, file);
      const markdown = await fs.readFile(fullPath, 'utf8');
      const firstLine = markdown.split(/\r?\n/, 1)[0]?.trim() ?? file;
      const caseName = extractCaseName(firstLine);

      const existing = await prisma.case.findFirst({ where: { name: caseName } });
      if (existing) {
        console.log(`[skip] ${file}: кейс «${caseName}» уже существует`);
        skipped += 1;
        continue;
      }

      const hint = deriveModeHint(file, firstLine);
      console.log(`[import] ${file}: mode=${hint.mode}, subgroup=${hint.subgroup}`);

      try {
        const draft = await core.cases.structureCaseFromMarkdown(actor, {
          markdown,
          mode: hint.mode,
          hintedSubgroup: hint.subgroup,
          hintedSpecialty: hint.specialty,
        });

        await prisma.case.create({
          data: {
            authorId: admin.id,
            name: draft.name || caseName,
            age: draft.age,
            gender: draft.gender,
            specialty: draft.specialty ?? hint.specialty,
            subgroup: hint.subgroup,
            tags: draft.tags,
            mode: hint.mode as CaseMode,
            body: bodyFromMarkdown(draft.bodyMarkdown),
          },
        });
        imported += 1;
        console.log(`[ok] ${file}: импортирован как «${draft.name || caseName}»`);
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[fail] ${file}: ${message}`);
      }
    }

    console.log(
      `\nГотово. Импортировано: ${imported}, пропущено: ${skipped}, ошибок: ${failed}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
