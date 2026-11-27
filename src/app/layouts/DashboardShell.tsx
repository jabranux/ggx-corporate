import { useAuth } from '../contexts/AuthContext';
import { SameDayPrototypeProvider } from '../contexts/SameDayPrototypeContext';
import { RootLayout } from './RootLayout';
import { BasicCorporateLayout } from './BasicCorporateLayout';

/**
 * Picks which Corporate shell renders under `/dashboard/*` based on the
 * signed-in account's product tier. Business+ keeps the existing
 * `RootLayout` (Main/Subaccount sidebar, off-canvas mobile drawer)
 * unchanged; a Basic account gets `BasicCorporateLayout` (dedicated desktop
 * sidebar, mobile bottom nav + Account drawer) instead — same route tree,
 * same shared pages, different chrome.
 *
 * `SameDayPrototypeProvider` is mounted here, above both branches, rather
 * than inside `BasicCorporateLayout` alone — the SDD prototype is a
 * Basic-only experience, but `BulkUploader.tsx` (one of its two entry
 * points) is a single route shared with Business+/Admin/Manager sessions
 * via `RootLayout`, and it calls `useSameDayPrototypeMode()`
 * unconditionally, so the provider must exist for both.
 */
export function DashboardShell() {
  const { user } = useAuth();
  return (
    <SameDayPrototypeProvider>
      {user?.accountSegment === 'basic' ? <BasicCorporateLayout /> : <RootLayout />}
    </SameDayPrototypeProvider>
  );
}
