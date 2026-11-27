/**
 * SDD prototype switch — Lead | Single | Bulk. A STAKEHOLDER-FACING
 * PROTOTYPING CONTROL, not a customer-facing service selector or a real
 * enrollment/entitlement state — it only picks which of three simulated
 * destinations "Same Day Delivery" currently leads to:
 *  - 'lead':   not enrolled — the promotional + enrollment page
 *              (`SameDayDeliveryPage.tsx`'s Lead content; real status still
 *              comes from `basicSameDayEnrollment.ts`).
 *  - 'single': simulates an approved, SDD-enabled account — a dedicated
 *              single-booking flow (reuses `BookDelivery.tsx`, locked to
 *              Same-Day).
 *  - 'bulk':   simulates an approved, SDD-enabled account — redirects to the
 *              Bulk Uploader with Same-Day pre-selected.
 *
 * Deliberately held in memory only (no localStorage/account-preference
 * persistence) and reset to Lead the moment the route leaves the SDD
 * experience — back navigation, the sidebar/bottom nav, or a hard reload —
 * so the dashboard's own Same Day Delivery shortcut always re-enters at
 * Lead. It survives navigating BETWEEN the SDD routes themselves (Lead <->
 * Single <-> the Bulk Uploader's SDD entry), since that's an in-experience
 * mode switch, not an exit. Mounted once in `BasicCorporateLayout` so both
 * `SameDayDeliveryPage` and `BulkUploader` (reachable as separate routes)
 * share the same live value.
 */
import {
  createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useLocation } from 'react-router';

export type SameDayPrototypeMode = 'lead' | 'single' | 'bulk';

const DEFAULT_MODE: SameDayPrototypeMode = 'lead';

function isSddRoute(pathname: string, search: string): boolean {
  if (pathname.startsWith('/dashboard/same-day-delivery')) return true;
  return pathname === '/dashboard/bulk-uploader' && new URLSearchParams(search).get('serviceMode') === 'same-day';
}

interface SameDayPrototypeContextValue {
  mode: SameDayPrototypeMode;
  setMode: (mode: SameDayPrototypeMode) => void;
}

const SameDayPrototypeContext = createContext<SameDayPrototypeContextValue | null>(null);

export function SameDayPrototypeProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [mode, setMode] = useState<SameDayPrototypeMode>(DEFAULT_MODE);
  const wasInSddRef = useRef(false);

  useEffect(() => {
    const inSdd = isSddRoute(location.pathname, location.search);
    if (!inSdd && wasInSddRef.current) setMode(DEFAULT_MODE);
    wasInSddRef.current = inSdd;
  }, [location.pathname, location.search]);

  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <SameDayPrototypeContext.Provider value={value}>{children}</SameDayPrototypeContext.Provider>;
}

export function useSameDayPrototypeMode(): SameDayPrototypeContextValue {
  const ctx = useContext(SameDayPrototypeContext);
  if (!ctx) throw new Error('useSameDayPrototypeMode must be used within a SameDayPrototypeProvider');
  return ctx;
}
