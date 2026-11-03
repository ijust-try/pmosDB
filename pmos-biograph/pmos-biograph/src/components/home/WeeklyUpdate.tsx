import { CalendarClock } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync';
import { getSyncStatus } from '../../services/repository';
import { formatIst } from '../../utils/format';
import { Reveal } from '../ui/Reveal';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SOURCES = [
  'NCBI Gene', 'UniProt', 'Reactome', 'PubChem', 'Open Targets', 'PubMed', 'Protein Data Bank', 'AlphaFold DB',
  'Gene Ontology', 'MeSH', 'MedlinePlus', 'ChEMBL',
];

/** The site's main promise: it is refreshed from the source databases every Wednesday. */
export function WeeklyUpdate() {
  const sync = useAsync(() => getSyncStatus(), []);
  const last = sync.data?.lastSynced ?? sync.data?.lastChecked ?? null;
  const next = sync.data?.nextRun ?? null;

  return (
    <Reveal>
      <section aria-label="Weekly updates" className="panel overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="eyebrow flex items-center gap-1.5">
              <CalendarClock size={13} className="text-accent" aria-hidden /> Always current
            </p>
            <h2 className="mt-1.5 font-serif text-[24px] font-bold leading-tight text-ink md:text-[28px]">
              Refreshed every Wednesday
            </h2>
            <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-ink-soft">
              Each week at 18:00 IST the knowledge base checks its source databases, pulls anything that has a new release, validates
              the result and publishes it. The records themselves are never edited by hand, and a failed check leaves the previous data in place.
            </p>
            {last || next ? (
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
                {last ? (
                  <div>
                    <dt className="eyebrow">Last refreshed</dt>
                    <dd className="mt-0.5 font-semibold text-ink">{formatIst(last)}</dd>
                  </div>
                ) : null}
                {next ? (
                  <div>
                    <dt className="eyebrow">Next scheduled</dt>
                    <dd className="mt-0.5 font-semibold text-ink">{formatIst(next)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>

          <ol className="flex items-center gap-1.5 justify-self-start lg:justify-self-end" aria-label="Weekly schedule">
            {DAYS.map((d) => {
              const wed = d === 'Wed';
              return (
                <li key={d} className="relative">
                  {wed ? (
                    <span className="absolute inset-0 rounded-xl bg-accent/40 animate-pulse-ring" aria-hidden />
                  ) : null}
                  <span
                    className={`relative grid h-14 w-11 place-items-center rounded-xl text-[11.5px] font-semibold sm:w-12 ${
                      wed ? 'bg-midnight text-white shadow-lift' : 'border border-line bg-paper text-ink-mute'
                    }`}
                  >
                    {d}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="relative overflow-hidden border-t border-line bg-paper/70 py-3" aria-label="Source databases">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent" aria-hidden />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent" aria-hidden />
          <ul className="flex w-max animate-marquee gap-3 px-3">
            {[...SOURCES, ...SOURCES].map((s, i) => (
              <li
                key={`${s}-${i}`}
                aria-hidden={i >= SOURCES.length}
                className="whitespace-nowrap rounded-full border border-line bg-white px-3.5 py-1 text-[12px] font-semibold text-ink-soft"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Reveal>
  );
}
