import { Route, Routes, Navigate } from 'react-router';
import { DSLayout } from './layout/DSLayout';

// Getting Started
import { DSOverviewPage } from './pages/DSOverviewPage';
import { HowThisWorksPage } from './pages/getting-started/HowThisWorksPage';

// Brand
import { BrandGuidelinesPage } from './pages/brand/BrandGuidelinesPage';

// Foundations
import { FoundationsOverviewPage } from './pages/foundations/FoundationsOverviewPage';
import { ColorsPage } from './pages/foundations/ColorsPage';
import { DesignTokensPage } from './pages/foundations/DesignTokensPage';
import { TypographyPage } from './pages/foundations/TypographyPage';
import { SpacingPage } from './pages/foundations/SpacingPage';
import { ElevationShadowsPage } from './pages/foundations/ElevationShadowsPage';
import { ResponsiveBehaviorPage } from './pages/foundations/ResponsiveBehaviorPage';
import { BankLogosPage } from './pages/foundations/BankLogosPage';

// Icons
import { IconsPage } from './pages/icons/IconsPage';

// Components
import { ComponentsOverviewPage } from './pages/components/ComponentsOverviewPage';
import { AccordionPage } from './pages/components/AccordionPage';
import { AlertPage } from './pages/components/AlertPage';
import { AvatarPage } from './pages/components/AvatarPage';
import { BadgePage } from './pages/components/BadgePage';
import { BreadcrumbPage } from './pages/components/BreadcrumbPage';
import { ButtonPage } from './pages/components/ButtonPage';
import { CalendarPage } from './pages/components/CalendarPage';
import { CardPage } from './pages/components/CardPage';
import { CheckboxPage } from './pages/components/CheckboxPage';
import { ComboboxPage } from './pages/components/ComboboxPage';
import { DialogPage } from './pages/components/DialogPage';
import { FieldPage } from './pages/components/FieldPage';
import { IconContainerPage } from './pages/components/IconContainerPage';
import { InputPage } from './pages/components/InputPage';
import { PageHeaderPage } from './pages/components/PageHeaderPage';
import { PaginationPage } from './pages/components/PaginationPage';
import { PopoverPage } from './pages/components/PopoverPage';
import { ProgressPage } from './pages/components/ProgressPage';
import { RadioGroupPage } from './pages/components/RadioGroupPage';
import { ScrollAreaPage } from './pages/components/ScrollAreaPage';
import { SearchInputPage } from './pages/components/SearchInputPage';
import { SegmentedControlPage } from './pages/components/SegmentedControlPage';
import { SelectPage } from './pages/components/SelectPage';
import { SeparatorPage } from './pages/components/SeparatorPage';
import { SwitchPage } from './pages/components/SwitchPage';
import { TablePage } from './pages/components/TablePage';
import { TabsPage } from './pages/components/TabsPage';
import { TextareaPage } from './pages/components/TextareaPage';
import { TooltipPage } from './pages/components/TooltipPage';

// GGX Components
import { AccessDeniedPage } from './pages/ggx-components/AccessDeniedPage';
import { AddressDisplayCardPage } from './pages/ggx-components/AddressDisplayCardPage';
import { CheckoutDeliveryOptionsPage } from './pages/ggx-components/CheckoutDeliveryOptionsPage';
import { DeliveryStatusBadgePage } from './pages/ggx-components/DeliveryStatusBadgePage';
import { EmptyStatePage } from './pages/ggx-components/EmptyStatePage';
import { EnablementGatePage } from './pages/ggx-components/EnablementGatePage';
import { FilterBarPage } from './pages/ggx-components/FilterBarPage';
import { LocationCascadePage } from './pages/ggx-components/LocationCascadePage';
import { ModuleCardPage } from './pages/ggx-components/ModuleCardPage';
import { OtpDialogPage } from './pages/ggx-components/OtpDialogPage';
import { StatCardPage } from './pages/ggx-components/StatCardPage';

// Patterns
import { PatternsOverviewPage } from './pages/patterns/PatternsOverviewPage';
import { BookingFlowsPage } from './pages/patterns/BookingFlowsPage';
import { BulkUploadPage } from './pages/patterns/BulkUploadPage';
import { PaymentOptionsPage } from './pages/patterns/PaymentOptionsPage';
import { TransactionsTrackingPage } from './pages/patterns/TransactionsTrackingPage';
import { FormsValidationPage } from './pages/patterns/FormsValidationPage';
import { EmptyLoadingErrorPage } from './pages/patterns/EmptyLoadingErrorPage';

// Resources
import { ResourcesOverviewPage } from './pages/resources/ResourcesOverviewPage';
import { TraceabilityPage } from './pages/resources/TraceabilityPage';
import { ChangelogPage } from './pages/resources/ChangelogPage';
import { ContributingPage } from './pages/resources/ContributingPage';
import { DocumentationStandardsPage } from './pages/resources/DocumentationStandardsPage';

/**
 * Single lazy-loaded entry point for the GGX Design System docs.
 * All DS code bundles here — routes handled internally via nested <Routes>.
 * Mounted at /design-system/* in the app router.
 */
export function DSAppShell() {
  return (
    <Routes>
      <Route element={<DSLayout />}>

        {/* Getting Started */}
        <Route index element={<DSOverviewPage />} />
        <Route path="getting-started/how-this-works" element={<HowThisWorksPage />} />

        {/* Brand */}
        <Route path="brand-guidelines" element={<BrandGuidelinesPage />} />

        {/* Foundations */}
        <Route path="foundations/overview" element={<FoundationsOverviewPage />} />
        <Route path="foundations/colors" element={<ColorsPage />} />
        <Route path="foundations/typography" element={<TypographyPage />} />
        <Route path="foundations/spacing" element={<SpacingPage />} />
        <Route path="foundations/design-tokens" element={<DesignTokensPage />} />
        <Route path="foundations/elevation-shadows" element={<ElevationShadowsPage />} />
        <Route path="foundations/responsive-behavior" element={<ResponsiveBehaviorPage />} />
        <Route path="foundations/bank-logos" element={<BankLogosPage />} />
        <Route path="icons" element={<IconsPage />} />

        {/* Components */}
        <Route path="components/overview" element={<ComponentsOverviewPage />} />
        <Route path="components/accordion" element={<AccordionPage />} />
        <Route path="components/alert" element={<AlertPage />} />
        <Route path="components/avatar" element={<AvatarPage />} />
        <Route path="components/badge" element={<BadgePage />} />
        <Route path="components/breadcrumb" element={<BreadcrumbPage />} />
        <Route path="components/button" element={<ButtonPage />} />
        <Route path="components/calendar" element={<CalendarPage />} />
        <Route path="components/card" element={<CardPage />} />
        <Route path="components/checkbox" element={<CheckboxPage />} />
        <Route path="components/combobox" element={<ComboboxPage />} />
        <Route path="components/dialog" element={<DialogPage />} />
        <Route path="components/field" element={<FieldPage />} />
        <Route path="components/icon-container" element={<IconContainerPage />} />
        <Route path="components/input" element={<InputPage />} />
        <Route path="components/page-header" element={<PageHeaderPage />} />
        <Route path="components/pagination" element={<PaginationPage />} />
        <Route path="components/popover" element={<PopoverPage />} />
        <Route path="components/progress" element={<ProgressPage />} />
        <Route path="components/radio-group" element={<RadioGroupPage />} />
        <Route path="components/scroll-area" element={<ScrollAreaPage />} />
        <Route path="components/search-input" element={<SearchInputPage />} />
        <Route path="components/segmented-control" element={<SegmentedControlPage />} />
        <Route path="components/select" element={<SelectPage />} />
        <Route path="components/separator" element={<SeparatorPage />} />
        <Route path="components/switch" element={<SwitchPage />} />
        <Route path="components/table" element={<TablePage />} />
        <Route path="components/tabs" element={<TabsPage />} />
        <Route path="components/textarea" element={<TextareaPage />} />
        <Route path="components/tooltip" element={<TooltipPage />} />

        {/* GGX Components */}
        <Route path="ggx-components/access-denied" element={<AccessDeniedPage />} />
        <Route path="ggx-components/address-display-card" element={<AddressDisplayCardPage />} />
        <Route path="ggx-components/checkout-delivery-options" element={<CheckoutDeliveryOptionsPage />} />
        <Route path="ggx-components/delivery-status-badge" element={<DeliveryStatusBadgePage />} />
        <Route path="ggx-components/empty-state" element={<EmptyStatePage />} />
        <Route path="ggx-components/enablement-gate" element={<EnablementGatePage />} />
        <Route path="ggx-components/filter-bar" element={<FilterBarPage />} />
        <Route path="ggx-components/location-cascade" element={<LocationCascadePage />} />
        <Route path="ggx-components/module-card" element={<ModuleCardPage />} />
        <Route path="ggx-components/otp-dialog" element={<OtpDialogPage />} />
        <Route path="ggx-components/stat-card" element={<StatCardPage />} />

        {/* Patterns */}
        <Route path="patterns/overview" element={<PatternsOverviewPage />} />
        <Route path="patterns/booking-flows" element={<BookingFlowsPage />} />
        <Route path="patterns/bulk-upload" element={<BulkUploadPage />} />
        <Route path="patterns/payment-options" element={<PaymentOptionsPage />} />
        <Route path="patterns/transactions-tracking" element={<TransactionsTrackingPage />} />
        <Route path="patterns/forms-validation" element={<FormsValidationPage />} />
        <Route path="patterns/empty-loading-error" element={<EmptyLoadingErrorPage />} />

        {/* Resources */}
        <Route path="resources/overview" element={<ResourcesOverviewPage />} />
        <Route path="resources/traceability" element={<TraceabilityPage />} />
        <Route path="resources/changelog" element={<ChangelogPage />} />
        <Route path="resources/contributing" element={<ContributingPage />} />
        <Route path="resources/documentation-standards" element={<DocumentationStandardsPage />} />

        {/* Legacy redirects — old single-page routes now have dedicated pages */}
        <Route path="foundations" element={<Navigate to="/design-system/foundations/overview" replace />} />
        <Route path="components" element={<Navigate to="/design-system/components/overview" replace />} />
        <Route path="patterns" element={<Navigate to="/design-system/patterns/overview" replace />} />
        <Route path="resources" element={<Navigate to="/design-system/resources/overview" replace />} />

      </Route>
    </Routes>
  );
}

export default DSAppShell;
