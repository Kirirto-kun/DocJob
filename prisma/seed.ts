import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('password123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@medizo.local' },
    update: {},
    create: {
      email: 'admin@medizo.local',
      name: 'Администратор',
      fullName: 'Системный Администратор',
      passwordHash: adminPassword,
      role: Role.ADMIN,
      specialty: 'Администрирование системы',
      avatar: 'https://i.pravatar.cc/150?u=admin',
    },
  });
  console.log(`[seed] admin: ${admin.email}`);

  const doctorPassword = await bcrypt.hash('password123', 10);
  const doctor = await prisma.user.upsert({
    where: { email: 'doctor@medizo.local' },
    update: {},
    create: {
      email: 'doctor@medizo.local',
      name: 'Доктор Иванов',
      fullName: 'Иванов Иван Иванович',
      region: 'Москва',
      age: 42,
      phoneNumber: '+7 (900) 000-00-00',
      specialty: 'Кардиология',
      passwordHash: doctorPassword,
      role: Role.DOCTOR,
      avatar: 'https://i.pravatar.cc/150?u=doctor-ivanov',
    },
  });
  console.log(`[seed] doctor: ${doctor.email}`);

  const existingCases = await prisma.case.count();
  if (existingCases === 0) {
    await prisma.case.create({
      data: {
        authorId: admin.id,
        name: 'Острый инфаркт миокарда',
        age: 72,
        gender: 'Мужской',
        primaryCondition: 'Острый инфаркт миокарда',
        history:
          'Пациент 72 лет, гипертоническая болезнь 10 лет, гиперлипидемия, курение 30 лет.',
        scenarioDescription:
          'Мужчина 72 лет поступил в приёмное отделение с давящей болью за грудиной, иррадиирующей в левую руку. Боль началась 2 часа назад, сопровождается потливостью и тошнотой.',
        learningObjectives: [
          'Быстрая диагностика и ведение ИМ с подъёмом ST',
          'Выбор реперфузионной терапии',
          'Управление острыми осложнениями ИМ',
        ],
        comorbidities: 'Гипертоническая болезнь, гиперлипидемия',
        subgroup: 'clinical',
        specialty: 'Кардиология',
        tags: ['ЭКГ', 'неотложка', 'STEMI'],
      },
    });

    await prisma.case.create({
      data: {
        authorId: admin.id,
        name: 'Вспышка ИСМП в отделении',
        age: 0,
        gender: 'Смешанно',
        primaryCondition: 'Внутрибольничная инфекция',
        history:
          'В отделении реанимации зафиксировано 5 случаев септицемии за неделю, культуры показывают Klebsiella pneumoniae.',
        scenarioDescription:
          'Эпидемиолог должен провести расследование вспышки ИСМП в ОРИТ многопрофильного стационара.',
        learningObjectives: [
          'Пошаговое расследование вспышки',
          'Применение мер инфекционного контроля',
          'Коммуникация с администрацией и СЭС',
        ],
        comorbidities: '',
        subgroup: 'sanepid',
        specialty: 'Внутрибольничные инфекции (ИСМП)',
        tags: ['ИСМП', 'эпиднадзор', 'Klebsiella'],
      },
    });
    console.log('[seed] 2 demo cases created');
  }

  const baseTags = ['ЭКГ', 'неотложка', 'STEMI', 'ИСМП', 'эпиднадзор', 'Klebsiella', 'педиатрия'];
  for (const label of baseTags) {
    await prisma.tag.upsert({ where: { label }, update: {}, create: { label } });
  }
  console.log(`[seed] ${baseTags.length} tags upserted`);

  const newsCount = await prisma.newsItem.count();
  if (newsCount === 0) {
    await prisma.newsItem.createMany({
      data: [
        {
          title: 'Запуск платформы Medizo AI',
          body: 'Платформа теперь доступна для всех зарегистрированных пользователей. Приглашаем изучать кейсы и проходить тренировки.',
        },
        {
          title: 'Добавлены новые кейсы по кардиологии',
          body: 'В библиотеку добавлены 2 кейса по острым коронарным синдромам. Заходите в раздел «Кейсы клинических инцидентов» → «Кардиология».',
        },
      ],
    });
    console.log('[seed] 2 news items created');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
