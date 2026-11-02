import { Box, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Protein } from '../../types';

/**
 * 3D structures of a protein: the best-resolved experimental entries from the Protein Data Bank and the AlphaFold
 * prediction, both linked through the protein's UniProt accession. Thumbnails come from the RCSB image service.
 */
export function StructuresPanel({ protein, viaGene = false }: { protein: Protein; viaGene?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const st = protein.structures;
  if (!st) return null;
  const best = st.entries[0];
  const hasPdb = st.pdbCount > 0 && st.entries.length > 0;

  return (
    <section className="panel overflow-hidden" aria-label="3D structures">
      <p className="eyebrow border-b border-line px-5 py-3">
        3D structures
        {viaGene ? (
          <>
            {' '}
            · encoded protein:{' '}
            <Link to={`/entity/${protein.id}`} className="normal-case tracking-normal text-teal hover:underline">
              {protein.name}
            </Link>
          </>
        ) : null}
      </p>
      <div className="grid gap-4 p-5 sm:grid-cols-[148px_1fr]">
        {best && !imageFailed ? (
          <a href={best.url} target="_blank" rel="noopener noreferrer" className="block w-[148px]" title={`Open ${best.id} on RCSB PDB`}>
            <img
              src={best.image}
              alt={`Structure ${best.id} of ${protein.name}`}
              loading="lazy"
              width={148}
              height={148}
              onError={() => setImageFailed(true)}
              className="h-[148px] w-[148px] rounded-lg border border-line bg-white object-contain"
            />
            <span className="mt-1 block text-center font-mono text-[11px] text-ink-mute">{best.id}</span>
          </a>
        ) : (
          <div className="grid h-[148px] w-[148px] place-items-center rounded-lg border border-dashed border-line-strong bg-paper text-ink-faint">
            <Box size={28} aria-hidden />
          </div>
        )}

        <div className="min-w-0 space-y-3">
          {hasPdb ? (
            <>
              <p className="text-[13.5px] leading-relaxed text-ink-soft">
                <strong className="text-ink">{st.pdbCount}</strong> experimental {st.pdbCount === 1 ? 'structure' : 'structures'} in the Protein Data
                Bank {st.pdbCount === 1 ? 'includes' : 'include'} this protein
                {st.entries.length < st.pdbCount ? `. The ${st.entries.length} best-resolved that cover a substantial part of it are listed here` : ''}.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="text-ink-mute">
                    <tr>
                      <th className="py-1 pr-3 font-semibold">PDB ID</th>
                      <th className="py-1 pr-3 font-semibold">Method</th>
                      <th className="py-1 pr-3 font-semibold">Resolution</th>
                      <th className="py-1 font-semibold">Region (chain)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {st.entries.map((e) => (
                      <tr key={e.id}>
                        <td className="py-1.5 pr-3 font-mono">
                          <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal hover:underline">
                            {e.id}
                          </a>
                        </td>
                        <td className="py-1.5 pr-3 text-ink-soft">{e.method ?? 'not stated'}</td>
                        <td className="py-1.5 pr-3 font-mono text-ink-soft">{e.resolution !== null ? `${e.resolution.toFixed(2)} Å` : 'n/a'}</td>
                        <td className="py-1.5 font-mono text-ink-mute">{e.chains ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {st.allUrl ? (
                <a href={st.allUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-bold text-teal hover:underline">
                  See all {st.pdbCount} structures on PDBe-KB <ExternalLink size={12} aria-hidden />
                </a>
              ) : null}
            </>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-ink-soft">No experimental structure is recorded for this protein in the Protein Data Bank.</p>
          )}

          {st.alphafoldUrl ? (
            <p className="border-t border-line pt-3 text-[13px] leading-relaxed text-ink-soft">
              A <strong className="text-ink">predicted</strong> structure is available from the{' '}
              <a href={st.alphafoldUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal hover:underline">
                AlphaFold database <ExternalLink size={11} className="inline" aria-hidden />
              </a>
              . Predictions are computed models, not experimental measurements.
            </p>
          ) : null}
        </div>
      </div>
      <p className="border-t border-line bg-paper px-5 py-3 text-[11.5px] leading-relaxed text-ink-mute">
        Linked through the UniProt accession {protein.primaryId}. Structure images are provided by RCSB PDB.
      </p>
    </section>
  );
}
