import { Link } from 'react-router-dom';
import { PageContainer } from '../components/layout/AppShell';
import { EmptyState } from '../components/ui/States';

export default function NotFoundPage() {
  return (
    <PageContainer>
      <div className="panel">
        <EmptyState
          title="Page not found"
          body="This address does not match any section of the application."
          action={
            <Link to="/" className="btn-primary">
              Back to overview
            </Link>
          }
        />
      </div>
    </PageContainer>
  );
}
