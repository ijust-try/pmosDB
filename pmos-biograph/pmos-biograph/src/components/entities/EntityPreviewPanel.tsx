import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { getEntityRelationships } from '../../services/repository';
import type { Entity } from '../../types';
import { RelationStatusBadge, SourceBadge, TypeBadge, TypeIcon, VerificationBadge } from '../ui/Badges';
import { LoadingRows } from '../ui/States';

export function EntityPreviewPanel({ entity, onClose }: { entity: Entity | null; onClose: () => void }) {
  useEffect(() => {
    if (!entity) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entity, onClose]);

  const rels = useAsync(() => (entity ? getEntityRelationships(entity.id) : Promise.resolve([])), [entity?.id]);

  return (
    <AnimatePresence>
      {entity ? (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-midnight/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`${entity.name} summary`}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-white shadow-lift"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line p-5">
              <div className="flex min-w-0 items-start gap-3">
                <TypeIcon type={entity.type} size={40} />
                <div className="min-w-0">
                  <TypeBadge type={entity.type} />
                  <h2 className="mt-1.5 text-lg font-extrabold leading-snug tracking-tight text-ink">{entity.name}</h2>
                  <p className="mt-0.5 font-mono text-[12px] text-ink-mute">
                    {entity.idLabel}: {entity.primaryId}
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close summary" className="rounded-md p-1.5 text-ink-mute hover:bg-sand hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-5">
              <VerificationBadge value={entity.verification} />
              <p className="text-sm leading-relaxed text-ink-soft">{entity.description}</p>

              {entity.aliases.length ? (
                <div>
                  <p className="eyebrow mb-1.5">Also known as</p>
                  <p className="text-sm text-ink-soft">{entity.aliases.join(' · ')}</p>
                </div>
              ) : null}

              {entity.sources.length ? (
                <div>
                  <p className="eyebrow mb-1.5">Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {entity.sources.map((s, i) => (
                      <SourceBadge key={i} source={s} />
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="eyebrow mb-1.5">Relationships</p>
                {rels.loading && !rels.data ? (
                  <LoadingRows rows={3} />
                ) : rels.data?.length ? (
                  <ul className="space-y-1.5">
                    {rels.data.map((n) => (
                      <li key={n.relationship.id}>
                        <Link
                          to={`/entity/${n.entity.id}`}
                          className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 hover:border-teal"
                        >
                          <TypeIcon type={n.entity.type} size={24} />
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-[10.5px] text-ink-mute">
                              {n.direction === 'in' ? '← ' : ''}
                              {n.relationship.label}
                              {n.direction === 'out' ? ' →' : ''}
                            </span>
                            <span className="block truncate text-[13px] font-semibold text-ink">{n.entity.name}</span>
                          </span>
                          <RelationStatusBadge status={n.relationship.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-mute">No relationships recorded in the demo dataset.</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 border-t border-line p-4">
              <Link to={`/entity/${entity.id}`} className="btn-primary flex-1">
                Open full dossier <ArrowRight size={15} aria-hidden />
              </Link>
              <Link to={`/graph?focus=${entity.id}`} className="btn-ghost">
                BioGraph
              </Link>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
