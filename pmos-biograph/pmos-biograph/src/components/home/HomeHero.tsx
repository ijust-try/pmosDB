import { motion } from 'framer-motion';
import { ArrowRight, CalendarClock, ChevronDown, Network } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { getDatasetSummary, getSyncStatus } from '../../services/repository';
import type { EntityType } from '../../types';
import { ENTITY_META } from '../../utils/entityMeta';
import { formatIst } from '../../utils/format';
import { CountUp } from './CountUp';
import { NetworkBackdrop } from './NetworkBackdrop';

/** Record types shown in the hero, in the order they appear when counts tie. */
const TYPES: EntityType[] = ['gene', 'protein', 'pathway', 'hormone', 'biomarker', 'therapeutic', 'publication'];

const delay = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

export function HomeHero() {
  const summary = useAsync(() => getDatasetSummary(), []);
  const sync = useAsync(() => getSyncStatus(), []);
  const counts = summary.data?.entityCounts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  const ranked = counts ? [...TYPES].sort((a, b) => counts[b] - counts[a]) : TYPES;
  const last = sync.data?.lastSynced ?? sync.data?.lastChecked ?? null;

  return (
    <section
      aria-label="Introduction"
      className="relative isolate flex min-h-[600px] flex-col justify-between overflow-hidden rounded-3xl bg-midnight p-6 text-white shadow-lift md:p-10 lg:min-h-[calc(100dvh-9rem)]"
    >
      <div className="grid-bg-dark absolute inset-0 -z-10" aria-hidden />
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,rgba(141,187,255,0.28),transparent_55%),radial-gradient(ellipse_at_0%_100%,rgba(45,91,185,0.5),transparent_55%)]"
        aria-hidden
      />
      <NetworkBackdrop className="absolute inset-0 -z-10 h-full w-full opacity-45 md:opacity-80" />

      <div className="max-w-2xl">
        <p
          className="reveal inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[12px] font-semibold backdrop-blur"
          style={delay(0)}
        >
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-sage-light animate-pulse-ring" />
            <span className="relative h-2 w-2 rounded-full bg-sage-light" />
          </span>
          Updated every Wednesday{last ? <span className="hidden text-blue-100/80 sm:inline"> · last refreshed {formatIst(last)}</span> : null}
        </p>

        <p className="reveal mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-bright" style={delay(0.1)}>
          PMOS Biological Knowledge Base
        </p>
        <h1 className="mt-3 text-[40px] font-bold leading-[1.05] text-white md:text-[58px]">
          <span className="reveal block" style={delay(0.2)}>
            Explore the biology
          </span>
          <span className="reveal block" style={delay(0.35)}>
            behind <span className="text-accent-bright">PMOS</span>.
          </span>
        </h1>
        <p className="reveal mt-5 max-w-xl text-[16.5px] leading-relaxed text-blue-100/90" style={delay(0.5)}>
          A connected knowledge base for discovering relationships across genes, proteins, hormones, pathways, biomarkers and
          therapeutics, drawn from public databases and refreshed every week.
        </p>
        <div className="reveal mt-7 flex flex-wrap gap-3" style={delay(0.65)}>
          <Link to="/graph" className="btn border-white bg-white !px-4 !py-2.5 !text-midnight hover:bg-accent-soft">
            <Network size={16} aria-hidden /> Open BioGraph
          </Link>
          <Link to="/explore" className="btn border-white/35 bg-white/5 !px-4 !py-2.5 text-white hover:bg-white/15">
            Browse the catalogue <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </div>

      <div className="mt-10">
        <div className="reveal rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm md:p-6" style={delay(0.85)}>
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-200">Records in the knowledge base</p>
              <p className="mt-1 font-serif text-[52px] font-bold leading-none md:text-[68px]">
                <CountUp to={total} />
              </p>
              <p className="mt-2 text-[13px] text-blue-100/85">
                across {TYPES.length} record types
                {summary.data ? (
                  <>
                    {' · '}
                    <CountUp to={summary.data.relationshipCount} /> sourced relationships
                  </>
                ) : null}
              </p>
            </div>
            <p className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[12.5px] font-semibold text-blue-50">
              <CalendarClock size={15} aria-hidden /> Re-synced with the source databases each Wednesday
            </p>
          </div>

          {/* Share of each record type: the widest segments are the vast majority of the records. */}
          <div className="mt-5 flex h-3 w-full gap-[3px] overflow-hidden rounded-full" role="img" aria-label="Share of records by type">
            {ranked.map((t, i) => (
              <motion.span
                key={t}
                className="h-full rounded-full"
                style={{ background: ENTITY_META[t].graph }}
                initial={{ width: 0 }}
                animate={{ width: counts && total ? `${(counts[t] / total) * 100}%` : 0 }}
                transition={{ duration: 1.1, delay: 0.9 + i * 0.08, ease: 'easeOut' }}
              />
            ))}
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 lg:grid-cols-7">
            {ranked.map((t) => (
              <li key={t}>
                <Link
                  to={`/explore?type=${t}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-white/10"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ENTITY_META[t].graph }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] text-blue-100/85">{ENTITY_META[t].plural}</span>
                    <span className="block font-serif text-[19px] font-bold leading-tight">
                      <CountUp to={counts?.[t]} />
                    </span>
                    {counts && total ? (
                      <span className="block text-[10.5px] text-blue-200/80">{Math.round((counts[t] / total) * 100)}% of records</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <a
          href="#overview"
          className="mx-auto mt-6 flex w-max flex-col items-center gap-1 text-[12px] font-semibold text-blue-100/90"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          Scroll to the overview
          <ChevronDown size={18} className="animate-nudge-down" aria-hidden />
        </a>
      </div>
    </section>
  );
}
