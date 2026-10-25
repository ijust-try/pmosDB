import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import BioGraphPage from '../pages/BioGraphPage';
import EntityPage from '../pages/EntityPage';
import EvidencePage from '../pages/EvidencePage';
import ExplorePage from '../pages/ExplorePage';
import NotFoundPage from '../pages/NotFoundPage';
import OverviewPage from '../pages/OverviewPage';
import PathwaysPage from '../pages/PathwaysPage';
import SearchResultsPage from '../pages/SearchResultsPage';
import SourcesPage from '../pages/SourcesPage';
import TherapeuticsPage from '../pages/TherapeuticsPage';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-midnight focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="entity/:id" element={<EntityPage />} />
            <Route path="graph" element={<BioGraphPage />} />
            <Route path="pathways" element={<PathwaysPage />} />
            <Route path="therapeutics" element={<TherapeuticsPage />} />
            <Route path="evidence" element={<EvidencePage />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="search" element={<SearchResultsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  );
}
