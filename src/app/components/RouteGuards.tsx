import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useJourney } from '../contexts/JourneyContext';
import type { JourneyId } from '../data/journeyRegistry';
import { AccessDenied } from './AccessDenied';

/** Redirects unauthenticated users to Login; renders children when signed in. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

interface AdminRouteProps {
  children: ReactNode;
  /**
   * Opt-in, route-specific UX Journey bypass: when the named journey is the
   * ACTIVE journey and grants the `mainAccountAdmin` scenario capability, this
   * route renders for any signed-in user — an in-memory presentation override
   * for stakeholder demos, never a real permission change. Only pass this on
   * the one route a journey is documented to need (see JourneyContext /
   * journeyRegistry). Omitting it (the default for every other AdminRoute
   * usage) leaves normal Admin-only behavior completely unchanged.
   */
  allowJourneyOverride?: JourneyId;
}

/** Renders children only for Admin (parent account); else an access-denied state. */
export function AdminRoute({ children, allowJourneyOverride }: AdminRouteProps) {
  const { user } = useAuth();
  const { activeJourney, scenarioCapabilities } = useJourney();
  const journeyGrants =
    !!allowJourneyOverride &&
    activeJourney?.id === allowJourneyOverride &&
    scenarioCapabilities.mainAccountAdmin;
  if (user?.role !== 'admin' && !journeyGrants) return <AccessDenied />;
  return <>{children}</>;
}
