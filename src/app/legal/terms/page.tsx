import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPageShell } from '../_components/legal-page-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.terms.metadata');
  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function TermsPage() {
  const t = await getTranslations('legal.terms');

  return (
    <LegalPageShell title={t('title')} subtitle={t('subtitle')}>
      <p>{t('intro1')}</p>

      <Section number="1" title={t('section1.title')}>
        <NumList>
          <NumItem n="1.1.">
            <strong>{t('section1.items.i11.term')}</strong>
            {' — '}
            {t('section1.items.i11.body')}
          </NumItem>
          <NumItem n="1.2.">
            <strong>{t('section1.items.i12.term')}</strong>
            {' — '}
            {t('section1.items.i12.body')}
          </NumItem>
          <NumItem n="1.3.">
            <strong>{t('section1.items.i13.term')}</strong>
            {' — '}
            {t('section1.items.i13.body')}
          </NumItem>
          <NumItem n="1.4.">
            <strong>{t('section1.items.i14.term')}</strong>
            {' — '}
            {t('section1.items.i14.body')}
          </NumItem>
          <NumItem n="1.5.">
            <strong>{t('section1.items.i15.term')}</strong>
            {' — '}
            {t('section1.items.i15.body')}
          </NumItem>
          <NumItem n="1.6.">
            <strong>{t('section1.items.i16.term')}</strong>
            {' — '}
            {t('section1.items.i16.body')}
          </NumItem>
          <NumItem n="1.7.">
            <strong>{t('section1.items.i17.term')}</strong>
            {' — '}
            {t('section1.items.i17.body')}
          </NumItem>
          <NumItem n="1.8.">
            <strong>{t('section1.items.i18.term')}</strong>
            {' — '}
            {t('section1.items.i18.body')}
          </NumItem>
        </NumList>
        <p className="text-sm text-muted-foreground">{t('section1.outro')}</p>
      </Section>

      <Section number="2" title={t('section2.title')}>
        <NumList>
          <NumItem n="2.1.">{t('section2.items.i21')}</NumItem>
          <NumItem n="2.2.">{t('section2.items.i22')}</NumItem>
          <NumItem n="2.3.">{t('section2.items.i23')}</NumItem>
          <NumItem n="2.4.">{t('section2.items.i24')}</NumItem>
          <NumItem n="2.5.">{t('section2.items.i25')}</NumItem>
          <NumItem n="2.6.">{t('section2.items.i26')}</NumItem>
          <NumItem n="2.7.">{t('section2.items.i27')}</NumItem>
          <NumItem n="2.8.">{t('section2.items.i28')}</NumItem>
        </NumList>
      </Section>

      <Section number="3" title={t('section3.title')}>
        <NumList>
          <NumItem n="3.1.">{t('section3.items.i31')}</NumItem>
          <NumItem n="3.2.">{t('section3.items.i32')}</NumItem>
          <NumItem n="3.3.">{t('section3.items.i33')}</NumItem>
          <NumItem n="3.4.">{t('section3.items.i34')}</NumItem>
          <NumItem n="3.5.">{t('section3.items.i35')}</NumItem>
          <NumItem n="3.6.">{t('section3.items.i36')}</NumItem>
          <NumItem n="3.7.">{t('section3.items.i37')}</NumItem>
        </NumList>
      </Section>

      <Section number="4" title={t('section4.title')}>
        <SubSection title={t('section4.subsection41.title')}>
          <NumList>
            <NumItem n="4.1.1.">{t('section4.subsection41.items.i411')}</NumItem>
            <NumItem n="4.1.2.">{t('section4.subsection41.items.i412')}</NumItem>
            <NumItem n="4.1.3.">{t('section4.subsection41.items.i413')}</NumItem>
            <NumItem n="4.1.4.">{t('section4.subsection41.items.i414')}</NumItem>
          </NumList>
        </SubSection>

        <SubSection title={t('section4.subsection42.title')}>
          <NumList>
            <NumItem n="4.2.1.">{t('section4.subsection42.items.i421')}</NumItem>
            <NumItem n="4.2.2.">{t('section4.subsection42.items.i422')}</NumItem>
            <NumItem n="4.2.3.">{t('section4.subsection42.items.i423')}</NumItem>
            <NumItem n="4.2.4.">{t('section4.subsection42.items.i424')}</NumItem>
            <NumItem n="4.2.5.">{t('section4.subsection42.items.i425')}</NumItem>
            <NumItem n="4.2.6.">{t('section4.subsection42.items.i426')}</NumItem>
          </NumList>
        </SubSection>

        <SubSection title={t('section4.subsection43.title')}>
          <NumList>
            <NumItem n="4.3.1.">{t('section4.subsection43.items.i431')}</NumItem>
            <NumItem n="4.3.2.">{t('section4.subsection43.items.i432')}</NumItem>
            <NumItem n="4.3.3.">{t('section4.subsection43.items.i433')}</NumItem>
            <NumItem n="4.3.4.">{t('section4.subsection43.items.i434')}</NumItem>
            <NumItem n="4.3.5.">{t('section4.subsection43.items.i435')}</NumItem>
            <NumItem n="4.3.6.">{t('section4.subsection43.items.i436')}</NumItem>
            <NumItem n="4.3.7.">{t('section4.subsection43.items.i437')}</NumItem>
            <NumItem n="4.3.8.">{t('section4.subsection43.items.i438')}</NumItem>
            <NumItem n="4.3.9.">{t('section4.subsection43.items.i439')}</NumItem>
            <NumItem n="4.3.10.">{t('section4.subsection43.items.i4310')}</NumItem>
            <NumItem n="4.3.11.">{t('section4.subsection43.items.i4311')}</NumItem>
            <NumItem n="4.3.12.">{t('section4.subsection43.items.i4312')}</NumItem>
            <NumItem n="4.3.13.">{t('section4.subsection43.items.i4313')}</NumItem>
          </NumList>
        </SubSection>

        <SubSection title={t('section4.subsection44.title')}>
          <NumList>
            <NumItem n="4.4.1.">{t('section4.subsection44.items.i441')}</NumItem>
            <NumItem n="4.4.2.">{t('section4.subsection44.items.i442')}</NumItem>
            <NumItem n="4.4.3.">{t('section4.subsection44.items.i443')}</NumItem>
            <NumItem n="4.4.4.">{t('section4.subsection44.items.i444')}</NumItem>
          </NumList>
        </SubSection>
      </Section>

      <Section number="5" title={t('section5.title')}>
        <NumList>
          <NumItem n="5.1.">{t('section5.items.i51')}</NumItem>
          <NumItem n="5.2.">{t('section5.items.i52')}</NumItem>
          <NumItem n="5.3.">{t('section5.items.i53')}</NumItem>
        </NumList>
      </Section>

      <Section number="6" title={t('section6.title')}>
        <NumList>
          <NumItem n="6.1.">{t('section6.items.i61')}</NumItem>
          <NumItem n="6.2.">{t('section6.items.i62')}</NumItem>
          <NumItem n="6.3.">{t('section6.items.i63')}</NumItem>
          <NumItem n="6.4.">{t('section6.items.i64')}</NumItem>
        </NumList>
      </Section>

      <Section number="7" title={t('section7.title')}>
        <NumList>
          <NumItem n="7.1.">{t('section7.items.i71')}</NumItem>
          <NumItem n="7.2.">{t('section7.items.i72')}</NumItem>
          <NumItem n="7.3.">{t('section7.items.i73')}</NumItem>
          <NumItem n="7.4.">{t('section7.items.i74')}</NumItem>
          <NumItem n="7.5.">{t('section7.items.i75')}</NumItem>
          <NumItem n="7.6.">{t('section7.items.i76')}</NumItem>
          <NumItem n="7.7.">{t('section7.items.i77')}</NumItem>
          <NumItem n="7.8.">{t('section7.items.i78')}</NumItem>
          <NumItem n="7.9.">{t('section7.items.i79')}</NumItem>
          <NumItem n="7.10.">{t('section7.items.i710')}</NumItem>
          <NumItem n="7.11.">{t('section7.items.i711')}</NumItem>
          <NumItem n="7.12.">{t('section7.items.i712')}</NumItem>
          <NumItem n="7.13.">{t('section7.items.i713')}</NumItem>
        </NumList>
      </Section>

      <Section number="8" title={t('section8.title')}>
        <NumList>
          <NumItem n="8.1.">{t('section8.items.i81')}</NumItem>
          <NumItem n="8.2.">{t('section8.items.i82')}</NumItem>
        </NumList>
      </Section>
    </LegalPageShell>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-headline text-xl font-semibold tracking-tight md:text-2xl">
        {number}. {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pt-1">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function NumList({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-2">{children}</ul>;
}

function NumItem({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground tabular-nums">
        {n}
      </span>
      <span className="flex-1">{children}</span>
    </li>
  );
}
