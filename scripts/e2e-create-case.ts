/* Creates an E2E test case + 2 attachments (PNG + PDF) directly in DB.
   Run: npx dotenv -e .env.local -- tsx scripts/e2e-create-case.ts */
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { saveAttachment } from '../src/lib/storage';

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error('No ADMIN user. Run db:seed first.');
    process.exit(1);
  }

  // 1x1 PNG (red dot)
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  // Minimal PDF
  const pdfText = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<<>>>>endobj xref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000055 00000 n \n0000000099 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n152\n%%EOF\n';
  const pdf = Buffer.from(pdfText, 'utf-8');

  const savedPng = await saveAttachment(png, 'image/png');
  const savedPdf = await saveAttachment(pdf, 'application/pdf');

  const att1 = await prisma.caseAttachment.create({
    data: {
      filename: savedPng.filename,
      originalName: 'ECG_strip.png',
      title: 'ЭКГ при поступлении',
      description: 'Подъём ST в передних отведениях, патологический Q зубец.',
      mimeType: savedPng.mimeType,
      size: savedPng.size,
      kind: savedPng.kind,
      uploaderId: admin.id,
      order: 0,
    },
  });
  const att2 = await prisma.caseAttachment.create({
    data: {
      filename: savedPdf.filename,
      originalName: 'Protocol_STEMI.pdf',
      title: 'Протокол МЗ РК — ОИМ с подъёмом ST',
      description: 'Краткий протокол ведения. Раздел реперфузионной терапии.',
      mimeType: savedPdf.mimeType,
      size: savedPdf.size,
      kind: savedPdf.kind,
      uploaderId: admin.id,
      order: 1,
    },
  });

  const body = {
    blocks: [
      {
        type: 'heading',
        props: { level: 2 },
        content: [{ type: 'text', text: 'Жалобы при поступлении', styles: {} }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Мужчина 70 лет доставлен бригадой СМП с жалобами на ', styles: {} },
          { type: 'text', text: 'давящую боль за грудиной', styles: { bold: true } },
          { type: 'text', text: ' длительностью более 1 часа, ', styles: {} },
          { type: 'text', text: 'не купирующуюся нитроглицерином', styles: { textColor: 'red' } },
          { type: 'text', text: '.', styles: {} },
        ],
      },
      {
        type: 'heading',
        props: { level: 2 },
        content: [{ type: 'text', text: 'Анамнез', styles: {} }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'АГ 15 лет, гиперлипидемия, курение 30 лет. Регулярно НЕ наблюдался у кардиолога.',
            styles: {},
          },
        ],
      },
      {
        type: 'heading',
        props: { level: 2 },
        content: [{ type: 'text', text: 'Течение', styles: {} }],
      },
      {
        type: 'bulletListItem',
        content: [
          { type: 'text', text: 'СМП прибыла через 40 минут после вызова.', styles: {} },
        ],
      },
      {
        type: 'bulletListItem',
        content: [
          { type: 'text', text: 'ЭКГ снята в приёмном отделении, не на дому.', styles: {} },
        ],
      },
      {
        type: 'bulletListItem',
        content: [
          { type: 'text', text: 'Аспирин дан только в стационаре.', styles: {} },
        ],
      },
    ],
  };

  const created = await prisma.case.create({
    data: {
      authorId: admin.id,
      name: 'E2E: STEMI у пожилого с задержкой реперфузии',
      age: 70,
      gender: 'М',
      subgroup: 'clinical',
      specialty: 'Кардиология',
      tags: ['ЭКГ', 'STEMI', 'E2E'],
      mode: 'CLINICAL_QUEST',
      body: body as never,
      taskQuestions: [
        'Поставьте основной диагноз по МКБ-10 и осложнения.',
        'Какие врачебные ошибки были допущены на догоспитальном этапе?',
        'Опишите правильный алгоритм ведения STEMI с реперфузионной стратегией.',
        'Оцените предотвратимость инцидента.',
      ],
      solution: {
        kind: 'incident',
        diagnosis: 'I21.0 — Острый трансмуральный инфаркт миокарда передней стенки. Осложнение: острая сердечная недостаточность Killip I.',
        errors: [
          'Задержка вызова скорой помощи и отсутствие приёма аспирина на догоспитальном этапе.',
          'Отсутствие догоспитальной ЭКГ и активации катетеризационной лаборатории до прибытия пациента.',
          'Промедление с принятием решения о реперфузионной стратегии в приёмном отделении.',
          'Не назначены нагрузочные дозы двойной антиагрегантной терапии до реперфузии.',
        ],
        correctAlgorithm:
          'Догоспитально: ЭКГ в первые 10 минут, активация катлаборатории, аспирин 300 мг, тикагрелор 180 мг, гепарин. В стационаре: ЧКВ в первые 90 минут от первого медицинского контакта; при недоступности — фибринолиз < 30 минут от поступления.',
        preventability: 'full',
      } as never,
      attachments: {
        connect: [{ id: att1.id }, { id: att2.id }],
      },
    },
  });

  console.log('Created case:', created.id);
  console.log(`URL: http://localhost:3000/cases/clinical/${created.id}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
