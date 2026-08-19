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

export interface JourneyPayoutAccount {
  id: string;
  bank: string;
  accountName: string;
  /** Raw (mock) account number — masking is derived at render time. */
  accountNumber: string;
  /**
   * Exactly one account is default at a time. The first successfully added
   * account becomes it automatically; this array shape (rather than a single
   * bank slot) exists so a future multi-account/default-selection UI has
   * somewhere to plug in — none is built now, per product guidance.
   */
  isDefault: boolean;
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

  /** No Pending/verification state: an account is either absent or added-and-usable. */
  payoutAccounts: JourneyPayoutAccount[];
  /** Adds a payout account; the first one added becomes the default automatically. */
  addPayoutAccount: (details: { bank: string; accountName: string; accountNumber: string }) => void;
  updatePayoutAccountName: (id: string, accountName: string) => void;
  removePayoutAccount: (id: string) => void;

  sddCutoff: JourneySddCutoffState;
  acknowledgeSddCutoff: () => void;

  editDelivery: JourneyEditDeliveryState;
  /** Confirms an edit-drawer draft into scenario state (journey-local only). */
  confirmEditDelivery: (patch: JourneyEditDeliveryDraft) => void;
}

const JourneyContext = createContext<JourneyContextValue | undefined>(undefined);

const initialPayoutAccounts = (): JourneyPayoutAccount[] => [];

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

  const [payoutAccounts, setPayoutAccounts] = useState<JourneyPayoutAccount[]>(initialPayoutAccounts);
  const [sddCutoff, setSddCutoff] = useState<JourneySddCutoffState>(initialSddCutoff);
  const [editDelivery, setEditDelivery] = useState<JourneyEditDeliveryState>(initialEditDelivery);

  const activeJourney = getJourneyDefinition(activeJourneyId);

  const resetAllScenarioState = () => {
    setPayoutAccounts(initialPayoutAccounts());
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

  const addPayoutAccount: JourneyContextValue['addPayoutAccount'] = (details) => {
    setPayoutAccounts((prev) => [
      ...prev,
      {
        id: `journey-bank-${prev.length + 1}-${Date.now()}`,
        bank: details.bank,
        accountName: details.accountName,
        accountNumber: details.accountNumber,
        // The Main Account's first payout account becomes the default
        // automatically — no separate action required.
        isDefault: prev.length === 0,
      },
    ]);
  };

  const updatePayoutAccountName = (id: string, accountName: string) =>
    setPayoutAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, accountName } : a)));

  const removePayoutAccount = (id: string) =>
    setPayoutAccounts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      // Keep exactly one default when one remains and the removed account was it.
      if (next.length > 0 && !next.some((a) => a.isDefault)) {
        return next.map((a, i) => (i === 0 ? { ...a, isDefault: true } : a));
      }
      return next;
    });

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
    payoutAccounts,
    addPayoutAccount,
    updatePayoutAccountName,
    removePayoutAccount,
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
