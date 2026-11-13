import { useAuth } from '../contexts/AuthContext';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { ParentDashboard } from './ParentDashboard';
import { Dashboard } from './Dashboard';
import { BasicHome } from './basic-account/BasicHome';

export function DashboardWrapper() {
  const { user } = useAuth();
  const { isMainAccountView } = useSubAccounts();
  if (user?.accountSegment === 'basic') return <BasicHome />;
  return isMainAccountView() ? <ParentDashboard /> : <Dashboard />;
}
