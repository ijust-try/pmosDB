import { CheckCircle2, CircleDashed, ExternalLink } from 'lucide-react';
import { PageContainer } from '../components/layout/AppShell';
import { StatusPill, TypeBadge } from '../components/ui/Badges';
import { DemoNotice, PageHeader } from '../components/ui/PageHeader';
import { AsyncBoundary, LoadingRows } from '../components/ui/States';
import { useAsync } from '../hooks/useAsync';
import { getDataSourceStatus, getDatasetStatus, getSyncStatus } from '../services/repository';

const CHECKS = ['Schema mapping', 'Identifier validation', 'Scheduled synchronisation'];

/** Date-only values (a harvest day) stay dates; full timestamps are shown in IST. */
function formatIst(iso: string): string {
  if (iso.length === 10) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const text = new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${text} IST`;
}

const OUTCOME_LABEL: Record<string, string> = {
  synced: 'Synchronised: new data pulled',
  checked: 'Checked: no new upstream release',
  'rebuilt-from-cache': 'Rebuilt from cached data',
};

export default function SourcesPage() {
  const sources = useAsync(() => getDataSourceStatus(), []);
  const status = useAsync(() => getDatasetStatus(), []);
  const sync = useAsync(() => getSyncStatus(), []);
  const isLive = status.data?.mode === 'live';

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Provenance"
        title="Data sources"
        description="The external biological resources that contribute to PMOS, what each provides, and how far integration has progressed."
      />
      <div className="mb-6">
        {isLive ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-sage/25 bg-sage-soft/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-sage">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
            <p>
              Records shown across PMOS are drawn from the public databases below. "Connected" means records from that source have
              been ingested and cross-referenced into relationships.
            </p>
          </div>
        ) : (
          <DemoNotice>
            No live source API is connected. Every status below describes the current build honestly: "Demo data" means illustrative
            records stand in for the source, and "Awaiting integration" means nothing is represented yet.
          </DemoNotice>
        )}
      </div>

      {sync.data?.stale && (
        <div role="alert" className="mb-4 rounded-lg border border-amber/30 bg-amber-soft px-4 py-3 text-[13px] leading-relaxed text-amber">
          <strong>This data may be out of date.</strong> The last successful synchronisation was {sync.data.daysSinceSync} days ago,
          well past the weekly schedule.
        </div>
      )}
      {sync.data && (
        <section className="panel mb-6 p-5" aria-label="Automatic synchronisation">
          <p className="eyebrow mb-3">Automatic synchronisation</p>
          <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-mute">Schedule</dt>
              <dd className="font-semibold text-ink">{sync.data.schedule}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-mute">Next run</dt>
              <dd className="font-mono text-ink">{formatIst(sync.data.nextRun)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-mute">Last checked</dt>
              <dd className="font-mono text-ink">{sync.data.lastChecked ? formatIst(sync.data.lastChecked) : 'Not yet'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-ink-mute">Last synchronised</dt>
              <dd className="font-mono text-ink">{sync.data.lastSynced ? formatIst(sync.data.lastSynced) : 'Not yet'}</dd>
            </div>
            {sync.data.lastOutcome && (
              <div className="flex gap-2 sm:col-span-2">
                <dt className="w-28 shrink-0 text-ink-mute">Last result</dt>
                <dd className="text-ink-soft">
                  {OUTCOME_LABEL[sync.data.lastOutcome] ?? sync.data.lastOutcome}
                  {sync.data.lastReason ? ` (${sync.data.lastReason})` : ''}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-mute">
            Each run checks the upstream releases of UniProt, Reactome and Open Targets. New data is pulled from all sources when any
            of them has published a new release, or when the last full synchronisation is over four weeks old.
          </p>
        </section>
      )}

      <AsyncBoundary state={sources} loading={<LoadingRows rows={5} />}>
        {(list) => (
          <ul className="grid gap-5 md:grid-cols-2">
            {list.map((s) => (
              <li key={s.id} className="panel flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-extrabold tracking-tight text-ink">{s.name}</h2>
                  <StatusPill status={s.status} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.contributes}</p>

                <div className="mt-4">
                  <p className="eyebrow mb-1.5">Supports</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.entityTypes.map((t) => (
                      <TypeBadge key={t} type={t} />
                    ))}
                  </div>
                </div>

                <dl className="mt-4 space-y-1.5 text-[13px]">
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-ink-mute">Last synchronised</dt>
                    <dd className={s.lastSync ? 'font-mono text-ink' : 'italic text-ink-faint'}>
                      {s.lastSync ? formatIst(s.lastSync) : 'Never synchronised'}
                    </dd>
                  </div>
                  {s.version && (
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-ink-mute">Upstream version</dt>
                      <dd className="font-mono text-ink">{s.version}</dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-ink-mute">Validation note</dt>
                    <dd className="text-ink-soft">{s.validationNote}</dd>
                  </div>
                </dl>

                <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-paper p-3">
                  <p className="eyebrow mb-2">Integration &amp; validation</p>
                  <ul className="space-y-1">
                    {CHECKS.map((c) =>
                      isLive && (c !== 'Scheduled synchronisation' || sync.data) ? (
                        <li key={c} className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                          <CheckCircle2 size={13} className="text-sage" aria-hidden /> {c}
                          <span className="ml-auto text-[11px] text-sage">Done</span>
                        </li>
                      ) : (
                        <li key={c} className="flex items-center gap-2 text-[12.5px] text-ink-mute">
                          <CircleDashed size={13} aria-hidden /> {c}
                          <span className="ml-auto text-[11px] text-ink-faint">Pending</span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>

                <a href={s.url} target="_blank" rel="noreferrer" className="btn-ghost mt-5 self-start">
                  Visit {s.name} <ExternalLink size={13} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </AsyncBoundary>

    </PageContainer>
  );
}
