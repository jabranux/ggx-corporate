import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  JOURNEYS, getJourneyDefinition, type JourneyId, type JourneyDefinition,
} from '../data/journeyRegistry';
import type { JourneyEditDeliveryDraft } from '../data/journeyTransactionFixture';

/**
 * UX Journey Showcase Mode — runtime provider.
 *
 * An in-memory, stakeholder-review layer. It never mutates AuthContext,
 * SubAccountContext, localStorage, or normal mock/service data — every
 * journey's state lives here and is discarded on exit. Mounted once inside
 * RootLayout (dashboard-scoped only); see `components/journeys/JourneyShell`.
 *
 * Page consumers should read semantic values (capabilities, scenario state)
 * for THEIR OWN journey id, not scatter raw id comparisons — see
 * PaymentSettings, BulkUploadSummary, BulkUploader, and TransactionDetails
 * for the intended usage pattern.
 */

export interface JourneyPayoutBankState {
  status: 'none' | 'pending';
  bank?: string;
  accountName?: string;
  accountMasked?: string;
}

export interface JourneySddCutoffState {
  /** Fixed, non-clock-derived display strings (Asia/Manila, weekday fixture). */
  simulatedNowLabel: string;
  cutoffLabel: string;
  nextPickupDateLabel: string;
  nextPickupDateValue: string;
  /** Journey-local acknowledgement of the simulated outcome (not a real upload). */
  acknowledged: boolean;
}

export interface JourneyEditDeliveryState {
  draft: JourneyEditDeliveryDraft;
  confirmed: JourneyEditDeliveryDraft | null;
}

export interface JourneyScenarioCapabilities {
  /** In-memory, journey-only Main Account admin presentation override (P1). */
  mainAccountAdmin: boolean;
}

interface JourneyContextValue {
  activeJourney: JourneyDefinition | null;
  journeys: JourneyDefinition[];
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  enterJourney: (id: JourneyId) => void;
  exitJourney: () => void;
  scenarioCapabilities: JourneyScenarioCapabilities;

  codPayout: JourneyPayoutBankState;
  setCodPayoutPending: (details: { bank: string; accountName: string; accountNumber: string }) => void;
  updateCodPayoutAccountName: (accountName: string) => void;
  clearCodPayoutBank: () => void;

  sddCutoff: JourneySddCutoffState;
  acknowledgeSddCutoff: () => void;

  editDelivery: JourneyEditDeliveryState;
  /** Confirms an edit-drawer draft into scenario state (journey-local only). */
  confirmEditDelivery: (patch: JourneyEditDeliveryDraft) => void;
}

const JourneyContext = createContext<JourneyContextValue | undefined>(undefined);

const initialCodPayout = (): JourneyPayoutBankState => ({ status: 'none' });

const initialSddCutoff = (): JourneySddCutoffState => ({
  simulatedNowLabel: 'Tuesday · 10:47 AM (Asia/Manila)',
  cutoffLabel: '10:00 AM',
  nextPickupDateLabel: 'Wednesday (next available pickup)',
  nextPickupDateValue: '2026-08-20',
  acknowledged: false,
});

const initialEditDelivery = (): JourneyEditDeliveryState => ({ draft: {}, confirmed: null });

export function JourneyProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeJourneyId, setActiveJourneyId] = useState<JourneyId | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const returnRouteRef = useRef<string | null>(null);

  const [codPayout, setCodPayout] = useState<JourneyPayoutBankState>(initialCodPayout);
  const [sddCutoff, setSddCutoff] = useState<JourneySddCutoffState>(initialSddCutoff);
  const [editDelivery, setEditDelivery] = useState<JourneyEditDeliveryState>(initialEditDelivery);

  const activeJourney = getJourneyDefinition(activeJourneyId);

  const resetAllScenarioState = () => {
    setCodPayout(initialCodPayout());
    setSddCutoff(initialSddCutoff());
    setEditDelivery(initialEditDelivery());
  };

  const enterJourney = (id: JourneyId) => {
    const def = getJourneyDefinition(id);
    if (!def) return;
    // Keep the ORIGINAL pre-journey route if the presenter switches journeys
    // mid-session, so Exit always returns to where they actually started.
    if (returnRouteRef.current === null) {
      returnRouteRef.current = `${location.pathname}${location.search}`;
    }
    resetAllScenarioState();
    setActiveJourneyId(id);
    setIsDrawerOpen(false);
    navigate(def.route);
  };

  const exitJourney = () => {
    const dest = returnRouteRef.current ?? '/dashboard';
    returnRouteRef.current = null;
    setActiveJourneyId(null);
    resetAllScenarioState();
    setIsDrawerOpen(false);
    navigate(dest);
  };

  const scenarioCapabilities: JourneyScenarioCapabilities = useMemo(
    () => ({ mainAccountAdmin: activeJourneyId === 'cod-main-account-payout' }),
    [activeJourneyId],
  );

  const setCodPayoutPending: JourneyContextValue['setCodPayoutPending'] = (details) => {
    setCodPayout({
      status: 'pending',
      bank: details.bank,
      accountName: details.accountName,
      accountMasked: `•••• •••• •••• ${details.accountNumber.slice(-4)}`,
    });
  };

  const updateCodPayoutAccountName = (accountName: string) =>
    setCodPayout((prev) => (prev.status === 'pending' ? { ...prev, accountName } : prev));

  const clearCodPayoutBank = () => setCodPayout(initialCodPayout());

  const acknowledgeSddCutoff = () => setSddCutoff((prev) => ({ ...prev, acknowledged: true }));

  const confirmEditDelivery: JourneyContextValue['confirmEditDelivery'] = (patch) =>
    setEditDelivery((prev) => {
      const merged = { ...prev.draft, ...patch };
      return { draft: merged, confirmed: merged };
    });

  const value: JourneyContextValue = {
    activeJourney,
    journeys: JOURNEYS,
    isDrawerOpen,
    openDrawer: () => setIsDrawerOpen(true),
    closeDrawer: () => setIsDrawerOpen(false),
    enterJourney,
    exitJourney,
    scenarioCapabilities,
    codPayout,
    setCodPayoutPending,
    updateCodPayoutAccountName,
    clearCodPayoutBank,
    sddCutoff,
    acknowledgeSddCutoff,
    editDelivery,
    confirmEditDelivery,
  };

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney() {
  const ctx = useContext(JourneyContext);
  if (ctx === undefined) throw new Error('useJourney must be used within a JourneyProvider');
  return ctx;
}

/** True only when the given journey is the one currently active. */
export function useIsJourneyActive(id: JourneyId): boolean {
  return useJourney().activeJourney?.id === id;
}
