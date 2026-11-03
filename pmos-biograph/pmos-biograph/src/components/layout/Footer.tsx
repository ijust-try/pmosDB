import { CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CREATOR, GITHUB_HANDLE } from '../../data/creator';
import { GithubIcon } from '../ui/GithubIcon';

export function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-6 text-[12.5px] text-ink-mute sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div className="space-y-1">
          <p className="font-serif text-[15px] font-bold text-ink">PMOS BioGraph</p>
          <p className="flex items-center gap-1.5">
            <CalendarClock size={13} className="text-accent" aria-hidden />
            Updated every Wednesday from NCBI, UniProt, Reactome, PubChem, Open Targets, PubMed, PDB and MeSH.
          </p>
          <p>Educational resource; it gives no medical advice.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link to="/about" className="font-semibold text-ink-soft hover:text-accent">
            About
          </Link>
          <Link to="/sources" className="font-semibold text-ink-soft hover:text-accent">
            Data sources
          </Link>
          <a
            href={CREATOR.github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-midnight bg-midnight px-3.5 py-1.5 font-semibold text-white transition-colors hover:bg-midnight-3"
          >
            <GithubIcon size={15} /> {GITHUB_HANDLE}
          </a>
        </div>
      </div>
    </footer>
  );
}
