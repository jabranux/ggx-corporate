import { useAuth } from '../contexts/AuthContext';
import { RootLayout } from './RootLayout';
import { BasicCorporateLayout } from './BasicCorporateLayout';

/**
 * Picks which Corporate shell renders under `/dashboard/*` based on the
 * signed-in account's product tier. Business+ keeps the existing
 * `RootLayout` (Main/Subaccount sidebar, off-canvas mobile drawer)
 * unchanged; a Basic account gets `BasicCorporateLayout` (dedicated desktop
 * sidebar, mobile bottom nav + Account drawer) instead — same route tree,
 * same shared pages, different chrome.
 */
export function DashboardShell() {
  const { user } = useAuth();
  return user?.accountSegment === 'basic' ? <BasicCorporateLayout /> : <RootLayout />;
}
