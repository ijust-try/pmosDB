import { CalendarClock, ExternalLink, ShieldCheck, Workflow } from 'lucide-react';
import { PageContainer } from '../components/layout/AppShell';
import { PageHeader } from '../components/ui/PageHeader';
import { GithubIcon } from '../components/ui/GithubIcon';
import { Reveal } from '../components/ui/Reveal';
import { CREATOR, GITHUB_HANDLE } from '../data/creator';

const CONSENSUS_URL = 'https://pubmed.ncbi.nlm.nih.gov/42119588/';

const POINTS = [
  {
    icon: CalendarClock,
    title: 'Updated every Wednesday',
    text: 'An automated job checks the source databases each Wednesday at 18:00 IST, re-harvests when anything has a new release, validates the result, and only then replaces the live data. If a check fails, the previous data stays up.',
  },
  {
    icon: ShieldCheck,
    title: 'Trusted sources only',
    text: 'Every record carries its source, identifier and retrieval date. Data comes from NCBI, UniProt, Reactome, PubChem, Open Targets, PubMed, the Protein Data Bank and the U.S. National Library of Medicine (MeSH and MedlinePlus).',
  },
  {
    icon: Workflow,
    title: 'Answers grounded in records',
    text: 'The chat assistant answers only from retrieved records, checks its own wording against them, and says so when the knowledge base does not cover a question. It gives no treatment, dosing or personal medical advice.',
  },
];

export default function AboutPage() {
  const initial = (CREATOR.name.trim()[0] ?? 'P').toUpperCase();
  return (
    <PageContainer>
      <PageHeader
        eyebrow="About"
        title="About this project and its creator"
        description="PMOS BioGraph is a connected, regularly refreshed knowledge base for researchers and students exploring the biology of PMOS."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Reveal>
          <aside className="panel relative overflow-hidden p-6 text-center lg:text-left">
            <div className="grid-bg absolute inset-0 opacity-60" aria-hidden />
            <div className="relative">
              <div
                className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-midnight font-serif text-[34px] font-bold text-white shadow-lift lg:mx-0"
                aria-hidden
              >
                {initial}
              </div>
              <p className="eyebrow mt-5">Creator</p>
              <h2 className="mt-1 font-serif text-[24px] font-bold leading-tight text-ink">{CREATOR.name}</h2>
              {CREATOR.role ? <p className="mt-1 text-[14px] text-ink-soft">{CREATOR.role}</p> : null}
              {CREATOR.affiliation ? <p className="text-[13px] text-ink-mute">{CREATOR.affiliation}</p> : null}
              <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
                Designed and built PMOS BioGraph end to end: the data pipeline, the API, the grounded chat assistant and this interface.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <a
                  href={CREATOR.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary !justify-start !px-4 !py-2.5"
                >
                  <GithubIcon size={16} /> {GITHUB_HANDLE} on GitHub
                </a>
                {CREATOR.contact ? (
                  <a href={`mailto:${CREATOR.contact}`} className="btn-ghost !justify-start !px-4 !py-2.5">
                    {CREATOR.contact}
                  </a>
                ) : null}
              </div>
            </div>
          </aside>
        </Reveal>

        <div className="space-y-6">
          <Reveal delay={0.05}>
            <section className="panel p-6">
              <p className="eyebrow">Why it exists</p>
              <h2 className="mt-1 font-serif text-[22px] font-bold text-ink">One name, many sources</h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
                Polyendocrine metabolic ovarian syndrome (PMOS), previously named polycystic ovary syndrome (PCOS), affects one in eight
                women. The new name was agreed through a global consensus process (Teede et al., The Lancet, 2026). The biology behind it
                is spread across many databases; this site connects genes, proteins, hormones, pathways, biomarkers, therapeutics and
                papers so that a path from one to the next is a click rather than a literature search.
              </p>
              <a
                href={CONSENSUS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
              >
                The naming consensus on PubMed <ExternalLink size={13} aria-hidden />
              </a>
            </section>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-3">
            {POINTS.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={0.08 * (i + 1)}>
                <section className="panel h-full p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Icon size={19} aria-hidden />
                  </span>
                  <h3 className="mt-4 font-serif text-[17px] font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{text}</p>
                </section>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1}>
            <p className="rounded-lg border border-line bg-white px-4 py-3 text-[12.5px] leading-relaxed text-ink-mute">
              PMOS BioGraph is an educational and research resource. It does not provide medical advice, diagnosis or treatment
              information; speak to a healthcare professional about any health concern.
            </p>
          </Reveal>
        </div>
      </div>
    </PageContainer>
  );
}
