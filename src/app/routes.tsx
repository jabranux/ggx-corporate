import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { BasicLayout } from './layouts/BasicLayout';
import { BasicSegmentProvider } from './contexts/BasicSegmentContext';
import { BasicDashboard } from './pages/basic/BasicDashboard';
import { SaveAndEarnMore } from './pages/basic/SaveAndEarnMore';
import { HVMNudge } from './pages/basic/HVMNudge';
import { BasicDeliver } from './pages/basic/BasicDeliver';
import { BasicReceiver } from './pages/basic/BasicReceiver';
import { BasicBookingScreen } from './pages/basic/BasicBookingScreen';
import { BasicBookingSuccess } from './pages/basic/BasicBookingSuccess';
import { BasicAddressBook } from './pages/basic/BasicAddressBook';
import { BasicAccount } from './pages/basic/BasicAccount';
import { BasicOrders } from './pages/basic/BasicOrders';
import { BasicOrderDetail } from './pages/basic/BasicOrderDetail';
import { BasicBulkUpload } from './pages/basic/BasicBulkUpload';
import { BasicStore } from './pages/basic/BasicStore';
import { BasicInventory } from './pages/basic/BasicInventory';
import { BasicEarnings } from './pages/basic/BasicEarnings';
import { BasicSupport } from './pages/basic/BasicSupport';
import { BasicSettings } from './pages/basic/BasicSettings';
import { BasicSameDay } from './pages/basic/BasicSameDay';
import { BasicBusinessPreview } from './pages/basic/BasicBusinessPreview';
import { BasicV2Layout } from './layouts/BasicV2Layout';
import { BasicV2Dashboard } from './pages/basic-v2/BasicV2Dashboard';
import { BasicV2Deliver } from './pages/basic-v2/BasicV2Deliver';
import { BasicV2Receiver } from './pages/basic-v2/BasicV2Receiver';
import { BasicV2BookingScreen } from './pages/basic-v2/BasicV2BookingScreen';
import { BasicV2BookingSuccess } from './pages/basic-v2/BasicV2BookingSuccess';
import { Login } from './pages/Login';
import { DashboardWrapper } from './pages/DashboardWrapper';
import { Transactions } from './pages/Transactions';
import { TransactionDetails } from './pages/TransactionDetails';
import { BulkUploader } from './pages/BulkUploader';
import { BulkSpreadsheet } from './pages/BulkSpreadsheet';
import { BulkUploadSummary } from './pages/BulkUploadSummary';
import { BulkUploadCompleted } from './pages/BulkUploadCompleted';
// Code-split the recharts-heavy analytics page into its own chunk (keeps the
// main bundle smaller; resolves the long-standing bundle-size warning).
const DataAnalytics = lazy(() => import('./pages/DataAnalytics').then((m) => ({ default: m.DataAnalytics })));
// Routed Design System reference. Code-split into a single DS bundle via lazy().
// All DS pages live inside DSAppShell which handles its own nested routing.
const DSAppShell = lazy(() => import('../design-system/DSAppShell').then((m) => ({ default: m.DSAppShell })));
import { Earnings } from './pages/Earnings';
import { EarningsSettlementDetail } from './pages/EarningsSettlementDetail';
import { BillingStatement } from './pages/BillingStatement';
import { PaymentSettings } from './pages/PaymentSettings';
import { AddressBookPage } from './pages/AddressBookPage';
import { APIAccess } from './pages/APIAccess';
import { Shopify } from './pages/Shopify';
import { SupportTickets } from './pages/SupportTickets';
import { SupportTicketDetail } from './pages/SupportTicketDetail';
import { SubAccounts } from './pages/SubAccounts';
import { Settings } from './pages/Settings';
import { EnableSubAccountsIntro } from './pages/EnableSubAccounts';
import { EnableSubAccountsSetup } from './pages/EnableSubAccountsSetup';
import { RequestSubAccount } from './pages/RequestSubAccount';
import { UsersPermissions } from './pages/UsersPermissions';
import { SubAccountSettings } from './pages/SubAccountSettings';
import { Notifications } from './pages/Notifications';
import { Reports } from './pages/Reports';
import { ServiceAdvisories } from './pages/ServiceAdvisories';
import { Claims } from './pages/Claims';
import { ClaimDetail } from './pages/ClaimDetail';
import { SlaAlerts } from './pages/SlaAlerts';
import { OperationsRequests } from './pages/OperationsRequests';
import { OpsRequestDetail } from './pages/OpsRequestDetail';
import { AccountAddOns } from './pages/AccountAddOns';
import { Inventory } from './pages/Inventory';
import { Storefront } from './pages/Storefront';
import { StorefrontOrderDetail } from './pages/StorefrontOrderDetail';
import { BasicAnalytics } from './pages/BasicAnalytics';
import { CustomReports } from './pages/CustomReports';
import { ProtectedRoute, AdminRoute } from './components/RouteGuards';
import { TrackingPage } from './pages/TrackingPage';
import { StorefrontPreview } from './pages/StorefrontPreview';
import { BuyerCheckout } from './pages/BuyerCheckout';
import { CartReview } from './pages/CartReview';
import { CartCheckout } from './pages/CartCheckout';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Login,
  },
  {
    // Basic / self-serve mobile demo entry. Standalone from the Business+ dashboard.
    path: '/basic',
    element: (
      <BasicSegmentProvider>
        <BasicLayout />
      </BasicSegmentProvider>
    ),
    children: [
      { index: true, Component: BasicDashboard },
      { path: 'more',     Component: SaveAndEarnMore },
      { path: 'qualify',  Component: HVMNudge },
      { path: 'deliver',            Component: BasicDeliver },
      { path: 'deliver/receiver',   Component: BasicReceiver },
      { path: 'deliver/booking',    Component: BasicBookingScreen },
      { path: 'deliver/success',    Component: BasicBookingSuccess },
      { path: 'address-book',       Component: BasicAddressBook },
      { path: 'account',  Component: BasicAccount },
      // Basic-native deep pages — keep self-serve sellers inside BasicLayout
      // instead of dropping them into the Business+ /dashboard chrome.
      { path: 'orders',      Component: BasicOrders },
      { path: 'orders/:id',  Component: BasicOrderDetail },
      { path: 'bulk',        Component: BasicBulkUpload },
      { path: 'store',       Component: BasicStore },
      { path: 'inventory',   Component: BasicInventory },
      { path: 'earnings',    Component: BasicEarnings },
      { path: 'support',     Component: BasicSupport },
      { path: 'settings',         Component: BasicSettings },
      { path: 'same-day',         Component: BasicSameDay },
      { path: 'business-preview', Component: BasicBusinessPreview },
    ],
  },
  {
    // V2 UI experiment — clean Tailwind/shadcn-style Basic surfaces.
    // To revert: delete src/app/pages/basic-v2/, src/app/layouts/BasicV2Layout.tsx,
    // and remove this route group. /basic is unaffected.
    path: '/basic-v2',
    element: (
      <BasicSegmentProvider>
        <BasicV2Layout />
      </BasicSegmentProvider>
    ),
    children: [
      { index: true,                    Component: BasicV2Dashboard },
      { path: 'delivery',               Component: BasicV2Deliver },
      { path: 'delivery/receiver',      Component: BasicV2Receiver },
      { path: 'delivery/booking',       Component: BasicV2BookingScreen },
      { path: 'delivery/success',       Component: BasicV2BookingSuccess },
    ],
  },
  {
    // Routed GGX Design System reference. The /* wildcard lets DSAppShell handle
    // all sub-paths internally. Does not touch any production flow.
    path: '/design-system/*',
    element: (
      <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading design system…</div>}>
        <DSAppShell />
      </Suspense>
    ),
  },
  {
    path: '/track',
    Component: TrackingPage,
  },
  {
    path: '/track/:trackingNumber',
    Component: TrackingPage,
  },
  {
    // Public customer-facing storefront (browse products → add to cart).
    path: '/shop/:slug',
    Component: StorefrontPreview,
  },
  {
    // Cart review for a storefront session (adjust quantities → checkout).
    path: '/shop/:slug/cart',
    Component: CartReview,
  },
  {
    // Multi-product COD checkout (session cart).
    path: '/checkout',
    Component: CartCheckout,
  },
  {
    // Legacy single-product checkout (backward compat with Inventory share links).
    path: '/buy/:productId',
    Component: BuyerCheckout,
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <RootLayout />
      </ProtectedRoute>
    ),
    children: [
      // Shared (Admin + Manager)
      { index: true, Component: DashboardWrapper },
      { path: 'transactions', Component: Transactions },
      { path: 'transactions/:id', Component: TransactionDetails },
      { path: 'claims', Component: Claims },
      { path: 'claims/:id', Component: ClaimDetail },
      { path: 'sla-alerts', Component: SlaAlerts },
      { path: 'operations-requests', Component: OperationsRequests },
      { path: 'operations-requests/:id', Component: OpsRequestDetail },
      { path: 'bulk-uploader', Component: BulkUploader },
      // In-app spreadsheet entry — a focused step within Bulk Booking (no sidebar item).
      { path: 'bulk-uploader/spreadsheet', Component: BulkSpreadsheet },
      { path: 'bulk-uploader/summary/:id', Component: BulkUploadSummary },
      // Completed batches open a read-only detail page (no editable review grid).
      { path: 'bulk-uploader/completed/:id', Component: BulkUploadCompleted },
      { path: 'bulk-upload-summary', Component: BulkUploadSummary },
      {
        path: 'analytics',
        element: (
          <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading analytics…</div>}>
            <DataAnalytics />
          </Suspense>
        ),
      },
      { path: 'address-book', Component: AddressBookPage },
      { path: 'api-access', Component: APIAccess },
      { path: 'shopify', Component: Shopify },
      { path: 'support-tickets', Component: SupportTickets },
      { path: 'support-tickets/:id', Component: SupportTicketDetail },
      { path: 'complaints', element: <Navigate to="/dashboard/support-tickets" replace /> },
      { path: 'notifications', Component: Notifications },
      { path: 'advisories', Component: ServiceAdvisories },
      { path: 'settings', Component: Settings },

      // Account Add-ons — discovery surface (shared). Gated feature routes
      // render an EnablementGate when not usable for the current scope.
      { path: 'account-add-ons', Component: AccountAddOns },
      { path: 'inventory', Component: Inventory },
      { path: 'storefront', Component: Storefront },
      // Store Orders list now lives as a tab under Transactions; the order detail
      // keeps its own route (linked from that tab).
      { path: 'storefront/orders/:id', Component: StorefrontOrderDetail },

      // Shared: subaccount settings (Managers can view their own subaccount's settings)
      { path: 'subaccounts/:id/settings', Component: SubAccountSettings },

      // Shared: reports visible to Managers (scoped to operational types in subaccount view)
      { path: 'reports', Component: Reports },
      { path: 'reports/custom', Component: CustomReports },
      // Basic Data Analytics — standalone demo page (the gated Advanced workspace
      // is at /analytics). Both reachable so add-on/nav actions don't dead-end.
      { path: 'analytics/basic', Component: BasicAnalytics },

      // Admin-only (parent-level finance, subaccounts, users)
      { path: 'earnings',                        element: <AdminRoute><Earnings /></AdminRoute> },
      { path: 'earnings/:settlementId',          element: <AdminRoute><EarningsSettlementDetail /></AdminRoute> },
      { path: 'billing',           element: <AdminRoute><BillingStatement /></AdminRoute> },
      { path: 'payment-settings',  element: <AdminRoute allowJourneyOverride="cod-main-account-payout"><PaymentSettings /></AdminRoute> },
      { path: 'subaccounts',       element: <AdminRoute><SubAccounts /></AdminRoute> },
      { path: 'subaccounts/enable',       element: <AdminRoute><EnableSubAccountsIntro /></AdminRoute> },
      { path: 'subaccounts/enable/setup', element: <AdminRoute><EnableSubAccountsSetup /></AdminRoute> },
      { path: 'subaccounts/request',      element: <AdminRoute><RequestSubAccount /></AdminRoute> },
      { path: 'users-permissions', element: <AdminRoute><UsersPermissions /></AdminRoute> },
    ],
  },
]);
