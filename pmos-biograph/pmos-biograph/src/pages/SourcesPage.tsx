import { CheckCircle2, CircleDashed, ExternalLink, Server } from 'lucide-react';
import { PageContainer } from '../components/layout/AppShell';
import { StatusPill, TypeBadge } from '../components/ui/Badges';
import { DemoNotice, PageHeader, SectionTitle } from '../components/ui/PageHeader';
import { AsyncBoundary, LoadingRows } from '../components/ui/States';
import { useAsync } from '../hooks/useAsync';
import { apiConfig } from '../services/api.config';
import { getDataSourceStatus, getDatasetStatus } from '../services/repository';

const CHECKS = ['Schema mapping', 'Identifier validation', 'Scheduled synchronisation'];

export default function SourcesPage() {
  const sources = useAsync(() => getDataSourceStatus(), []);
  const status = useAsync(() => getDatasetStatus(), []);
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
              The local PMOS API is connected and serving the FK-stitched relational database. "Connected" below means records from
              that source were ingested by Person A and cross-referenced into relationships by Person B.
            </p>
          </div>
        ) : (
          <DemoNotice>
            No live source API is connected. Every status below describes the current build honestly: "Demo data" means illustrative
            records stand in for the source, and "Awaiting integration" means nothing is represented yet.
          </DemoNotice>
        )}
      </div>

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
                      {s.lastSync ? new Date(s.lastSync).toLocaleString() : 'Never synchronised'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-28 shrink-0 text-ink-mute">Validation note</dt>
                    <dd className="text-ink-soft">{s.validationNote}</dd>
                  </div>
                </dl>

                <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-paper p-3">
                  <p className="eyebrow mb-2">Integration &amp; validation</p>
                  <ul className="space-y-1">
                    {CHECKS.map((c) =>
                      isLive ? (
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

      <section className="mt-12">
        <SectionTitle eyebrow="Backend" title="Connection settings" />
        <div className="panel grid gap-5 p-5 md:grid-cols-[auto_1fr]">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-midnight text-teal-bright">
            <Server size={20} aria-hidden />
          </div>
          <div>
            <dl className="grid gap-x-8 gap-y-1.5 text-[13px] sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="w-24 text-ink-mute">Mode</dt>
                <dd className="font-semibold">{status.data?.label ?? '…'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 text-ink-mute">API base URL</dt>
                <dd className="font-mono text-[12.5px]">{apiConfig.baseUrl}</dd>
              </div>
            </dl>
            <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-ink-mute">
              To connect the real backend, set <code className="font-mono text-ink-soft">VITE_USE_MOCK=false</code> and{' '}
              <code className="font-mono text-ink-soft">VITE_API_BASE_URL</code> in <code className="font-mono text-ink-soft">.env</code>, then adapt
              <code className="font-mono text-ink-soft"> src/services/normalisers.ts</code>. See the README for the full integration guide.
            </p>
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
