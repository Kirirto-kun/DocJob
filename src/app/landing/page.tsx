import Link from 'next/link';
import {
  Activity,
  Brain,
  Clock,
  Globe2,
  HeartPulse,
  Mail,
  MapPin,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { DocJobLogo } from '@/components/icons';
import { LanguageSwitcher } from '@/components/language-switcher';

export const metadata = {
  title: 'DocJob — Медицинское образование нового поколения',
  description:
    'Интеллектуальный тренажёр для практикующих специалистов, санэпид-направления и менеджеров здравоохранения. Реальные кейсы и ИИ-наставник.',
};

const ECG_PATH =
  'M0,30 L30,30 L38,30 L42,10 L46,50 L50,20 L54,38 L58,30 L90,30 L98,30 L102,10 L106,50 L110,20 L114,38 L118,30 L150,30 L158,30 L162,10 L166,50 L170,20 L174,38 L178,30 L210,30 L218,30 L222,10 L226,50 L230,20 L234,38 L238,30 L270,30 L278,30 L282,10 L286,50 L290,20 L294,38 L298,30 L330,30 L338,30 L342,10 L346,50 L350,20 L354,38 L358,30 L400,30';

const directions = [
  {
    icon: Stethoscope,
    title: 'Кейсы клинических инцидентов',
    description: 'Диагностический квест с разбором ошибок и эталонным алгоритмом.',
  },
  {
    icon: ShieldAlert,
    title: 'Кейсы санитарно-эпидемиологических инцидентов',
    description: 'Расследование вспышек, противоэпидемические мероприятия, профилактика.',
  },
  {
    icon: Sparkles,
    title: 'Кейсы лучших практик',
    description: 'Рефлексия по успешным сценариям: что сработало и почему.',
  },
  {
    icon: TrendingUp,
    title: 'Кейсы в менеджменте здравоохранения',
    description: 'Управленческие решения, организация процессов, KPI и качество помощи.',
  },
];

const capabilities = [
  {
    icon: Globe2,
    title: 'Международный опыт',
    desc: 'Реальные кейсы и датасеты из международной клинической и санэпид-практики.',
  },
  {
    icon: Brain,
    title: 'ИИ-наставник',
    desc: 'Искусственный интеллект ведёт сократический диалог и закрепляет результат обучения.',
  },
  {
    icon: Clock,
    title: 'Круглосуточный доступ',
    desc: 'Учитесь в любое удобное время — между сменами, дома, в дороге.',
  },
  {
    icon: Activity,
    title: 'Мы масштабируемся',
    desc: 'База кейсов пополняется ежедневно — новые специальности, новые сценарии.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <DocJobLogo className="h-8 w-8 text-primary" />
            <span className="font-headline text-lg font-semibold text-primary">DocJob</span>
            <Badge variant="secondary" className="ml-1 hidden text-[10px] sm:inline-flex">
              Beta
            </Badge>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#capabilities" className="transition-colors hover:text-foreground">
              Возможности
            </a>
            <a href="#catalog" className="transition-colors hover:text-foreground">
              Каталог
            </a>
            <a href="#contacts" className="transition-colors hover:text-foreground">
              Контакты
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Войти
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Начать обучение</Button>
            </Link>
          </div>
        </div>
      </header>

      <HeroSection />

      <Separator className="opacity-30" />

      <section id="capabilities" className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-3 border-primary/40 bg-primary/10 text-primary">
              Возможности платформы
            </Badge>
            <h2 className="font-headline text-3xl font-semibold tracking-tight md:text-4xl">
              Создан врачами для врачей
            </h2>
            <p className="mt-3 text-base text-muted-foreground md:text-lg">
              Каждая функция спроектирована с учётом потребностей практического здравоохранения
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {capabilities.map((c) => {
              const Icon = c.icon;
              return (
                <Card
                  key={c.title}
                  className="border-border/60 bg-card/60 p-6 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-base font-semibold">{c.title}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <Separator className="opacity-30" />

      <section id="catalog" className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-3 border-accent/40 bg-accent/10 text-accent">
              Специальности
            </Badge>
            <h2 className="font-headline text-3xl font-semibold tracking-tight md:text-4xl">
              Каталог направлений
            </h2>
            <p className="mt-3 text-base text-muted-foreground md:text-lg">
              Четыре направления — четыре способа прокачать профессиональное мышление
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {directions.map((d) => {
              const Icon = d.icon;
              return (
                <Card
                  key={d.title}
                  className="group flex aspect-square flex-col justify-between border-border/60 bg-card/60 p-6 transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold leading-tight transition-colors group-hover:text-primary">
                      {d.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">{d.description}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <Separator className="opacity-30" />

      <section className="px-6 py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <h2 className="font-headline text-3xl font-semibold md:text-4xl">
            Готовы к обучению нового уровня?
          </h2>
          <p className="max-w-xl text-base text-muted-foreground md:text-lg">
            Зарегистрируйтесь и получите доступ к реальным кейсам с ИИ-наставником прямо сейчас.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="h-12 px-8 text-base">
                Создать аккаунт
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base">
                Войти
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Separator className="opacity-30" />

      <section id="contacts" className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <Badge variant="outline" className="mb-3 border-primary/40 bg-primary/10 text-primary">
              Контакты
            </Badge>
            <h2 className="font-headline text-3xl font-semibold tracking-tight md:text-4xl">
              Сервис DocJob
            </h2>
          </div>

          <Card className="border-border/60 bg-card/60 p-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Адрес</p>
                  <p className="mt-1 text-sm leading-relaxed">
                    Город Астана, проспект Кабанбай батыра 6/1, БЦ «Каскад»
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
                  <a
                    href="mailto:docjob@inbox.kz"
                    className="mt-1 block text-sm text-primary hover:underline"
                  >
                    docjob@inbox.kz
                  </a>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <footer className="mt-auto border-t border-border/40 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <DocJobLogo className="h-6 w-6 text-primary" />
            <span className="font-medium">DocJob</span>
            <span className="text-muted-foreground/70">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="#capabilities" className="transition-colors hover:text-foreground">
              Возможности
            </a>
            <a href="#catalog" className="transition-colors hover:text-foreground">
              Каталог
            </a>
            <a href="#contacts" className="transition-colors hover:text-foreground">
              Контакты
            </a>
            <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
              Политика конфиденциальности
            </Link>
            <Link href="/legal/terms" className="transition-colors hover:text-foreground">
              Пользовательское соглашение
            </Link>
          </div>
        </div>
      </footer>

      <LandingStyles />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative flex min-h-[88vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute rounded-full opacity-20 blur-3xl"
          style={{
            width: 700,
            height: 500,
            background: 'radial-gradient(circle, hsl(var(--primary)), transparent 70%)',
            top: '5%',
            left: '50%',
            transform: 'translateX(-50%)',
            animation: 'landingBlob1 18s ease-in-out infinite',
          }}
        />
        <div
          className="absolute rounded-full opacity-10 blur-3xl"
          style={{
            width: 500,
            height: 400,
            background: 'radial-gradient(circle, hsl(var(--accent)), transparent 70%)',
            top: '30%',
            left: '15%',
            animation: 'landingBlob2 22s ease-in-out infinite',
          }}
        />
        <div
          className="absolute rounded-full opacity-10 blur-3xl"
          style={{
            width: 400,
            height: 350,
            background: 'radial-gradient(circle, hsl(var(--primary)), transparent 70%)',
            top: '20%',
            right: '10%',
            animation: 'landingBlob3 16s ease-in-out infinite',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--muted-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--muted-foreground)) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative flex w-full max-w-4xl flex-col items-center gap-7">
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 px-4 py-1.5 text-xs uppercase tracking-wide text-primary"
        >
          <HeartPulse className="mr-2 h-3.5 w-3.5" />
          Медицинское образование нового поколения
        </Badge>

        <h1 className="font-headline text-3xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-[3.25rem]">
          Тренируйте навыки{' '}
          <span className="text-primary">клинического мышления</span>,{' '}
          <span className="text-primary">санитарно-эпидемиологические</span>,{' '}
          <span className="text-primary">менеджмента</span> и{' '}
          <span className="text-primary">лучших практик</span>
          <br className="hidden md:block" />
          <span className="text-foreground/80"> на реальных кейсах</span>
        </h1>

        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Интеллектуальный тренажёр для практикующих специалистов, специалистов
          санитарно-эпидемиологического направления и менеджеров здравоохранения.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/register">
            <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/20">
              Попробовать бесплатно
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="h-12 px-8 text-base">
              Войти →
            </Button>
          </Link>
        </div>

        <div className="relative mt-6 w-full">
          <div className="mb-6 w-full overflow-hidden">
            <svg
              viewBox="0 0 400 60"
              className="h-12 w-full opacity-40"
              preserveAspectRatio="none"
            >
              <path
                d={ECG_PATH}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 1200,
                  animation: 'landingEcg 3s linear infinite',
                }}
              />
              <circle r="3" fill="hsl(var(--accent))" opacity="0.95">
                <animateMotion dur="3s" repeatCount="indefinite" path={ECG_PATH} />
              </circle>
            </svg>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {directions.map((d, i) => {
              const Icon = d.icon;
              return (
                <div
                  key={d.title}
                  className="flex aspect-square flex-col justify-between rounded-xl border border-border/60 bg-card/60 p-4 text-left backdrop-blur-sm"
                  style={{
                    animation: `landingFloat ${6 + i * 0.4}s ease-in-out infinite`,
                    animationDelay: `${i * 0.4}s`,
                  }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold leading-tight text-foreground">
                      {d.title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingStyles() {
  return (
    <style>{`
      @keyframes landingBlob1 {
        0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
        33%       { transform: translateX(-45%) translateY(-30px) scale(1.05); }
        66%       { transform: translateX(-55%) translateY(20px) scale(0.97); }
      }
      @keyframes landingBlob2 {
        0%, 100% { transform: translate(0, 0) scale(1); }
        40%       { transform: translate(40px, -50px) scale(1.08); }
        70%       { transform: translate(-20px, 30px) scale(0.95); }
      }
      @keyframes landingBlob3 {
        0%, 100% { transform: translate(0, 0) scale(1); }
        35%       { transform: translate(-30px, 40px) scale(1.06); }
        65%       { transform: translate(20px, -20px) scale(0.96); }
      }
      @keyframes landingFloat {
        0%, 100% { transform: translateY(0px);  }
        50%       { transform: translateY(-7px); }
      }
      @keyframes landingEcg {
        0%   { stroke-dashoffset: 1200; }
        100% { stroke-dashoffset: 0; }
      }
    `}</style>
  );
}
