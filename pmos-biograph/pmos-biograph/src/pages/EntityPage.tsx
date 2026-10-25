import { useParams } from 'react-router-dom';
import { EntityDetailView } from '../components/entities/EntityDetailView';
import { PageContainer } from '../components/layout/AppShell';

export default function EntityPage() {
  const { id = '' } = useParams();
  return (
    <PageContainer>
      <EntityDetailView entityId={id} />
    </PageContainer>
  );
}
