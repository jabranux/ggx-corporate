import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  IconArrowLeft, IconMapPin, IconTruckDelivery, IconBuildingStore,
  IconUpload, IconClock, IconCircleCheck, IconAlertCircle, IconInfoCircle, IconBolt,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { AddressBook, type Address } from '../components/AddressBook';
import { PaymentMethodTabs, type SelectedPaymentMethod } from '../components/PaymentMethodTabs';
import { SpreadsheetBookingGrid, type GridValidationState } from '../components/SpreadsheetBookingGrid';
import { PayoutBankModal } from '../components/PayoutBankModal';
import { estimateFees } from '../lib/bookingFees';
import { attachmentSubtotal } from '../lib/bookingValidation';
import { isBillingAccount } from '../services/paymentService';
import { getInventoryProducts, type InventoryProduct } from '../services/inventoryService';
import { hasEligiblePayoutBank } from '../services/payoutBankService';
import {
  addUpload, generateUploadId, createUploadRecord, setSpreadsheetBatchRows,
  type SpreadsheetBatchRow,
} from '../services/bulkUploadService';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useAuth } from '../contexts/AuthContext';
import { useModuleAccessContext } from '../hooks/useModuleAccess';
import { getFeatureStateSync } from '../services/featureEnablementService';

const EMPTY_GRID: GridValidationState = {
  validations: {}, validRows: [], invalidRows: [], emptyCount: 0, rows: [],
};

/** Page-level service mode (drives the whole batch, not per row). */
const MODE_LABELS: Record<'standard' | 'same-day' | 'on-demand', string> = {
  standard: 'Standard',
  'same-day': 'Same-Day Delivery',
  'on-demand': 'On-Demand Delivery',
};

/**
 * Bulk Upload — in-app spreadsheet entry. A focused step within Bulk Booking
 * (reached from the "Use our in-app spreadsheet" link on the Bulk Upload page),
 * NOT a separate module or sidebar item. Composes the existing booking context
 * (sender/pickup, schedule, delivery mode, payment) with the shared validation
 * grid, then hands off to the same review/summary flow as the file path.
 */
export function BulkSpreadsheet() {
  const navigate = useNavigate();
  const { getCurrentAccountName, getCurrentAccountId, currentAccount } = useSubAccounts();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const activeAccountName = isManager ? user!.accountName : getCurrentAccountName();

  const [billingAvailable, setBillingAvailable] = useState(true);
  useEffect(() => {
    let active = true;
    isBillingAccount(activeAccountName)
      .then((b) => { if (active) setBillingAvailable(b); })
      .catch(() => { if (active) setBillingAvailable(true); });
    return () => { active = false; };
  }, [activeAccountName]);

  const uploadAccount = isManager
    ? { accountId: user!.accountId, accountName: user!.accountName, accountType: 'subaccount' as const }
    : {
        accountId: getCurrentAccountId(),
        accountName: activeAccountName,
        accountType: (currentAccount === 'main' ? 'main' : 'subaccount') as 'main' | 'subaccount',
      };

  const [uploadMode, setUploadMode]   = useState<'standard' | 'same-day' | 'on-demand'>('standard');
  const [firstMile, setFirstMile]     = useState<'pickup' | 'dropoff'>('pickup');
  const [pickupDate, setPickupDate]   = useState('');
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>({
    id: '1', label: 'office', name: 'Acme Corporation',
    mobileNumber: '+63 917 123 4567', province: 'Metro Manila',
    city: 'Makati', barangay: 'Poblacion',
    otherDetails: '5th Floor, ABC Building, Ayala Avenue', isPreferred: true,
  });
  const [selectedPayment, setSelectedPayment] = useState<SelectedPaymentMethod | null>(null);
  const [grid, setGrid] = useState<GridValidationState>(EMPTY_GRID);

  // Feature gating for the current scope (respects module/access gating).
  const moduleCtx = useModuleAccessContext();
  const onDemandEnabled = getFeatureStateSync('on_demand', moduleCtx.scopeAccountId).enabled;
  const inventoryEnabled = getFeatureStateSync('inventory', moduleCtx.scopeAccountId).enabled;
  useEffect(() => {
    if (uploadMode === 'on-demand' && !onDemandEnabled) setUploadMode('standard');
  }, [onDemandEnabled, uploadMode]);

  // Load the scope's inventory products when Inventory is enabled (drives the
  // grid's product attachment + live stock validation).
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  useEffect(() => {
    if (!inventoryEnabled) { setProducts([]); return; }
    let active = true;
    getInventoryProducts(moduleCtx.scopeAccountId)
      .then((list) => { if (active) setProducts(list); })
      .catch(() => { if (active) setProducts([]); });
    return () => { active = false; };
  }, [inventoryEnabled, moduleCtx.scopeAccountId]);

  const validCount = grid.validRows.length;
  const errorCount = grid.invalidRows.length;
  const totalCount = validCount + errorCount;
  // Inject the page-level service mode into each row so estimateRowFee can
  // compute the service surcharge (per-row serviceType was removed in Session 39).
  const serviceTypeKey = uploadMode === 'same-day' ? 'same_day' : uploadMode === 'on-demand' ? 'on_demand' : 'standard';
  const fees = estimateFees(grid.validRows.map((r) => ({ ...r, serviceType: serviceTypeKey as 'standard' | 'same_day' | 'on_demand' })));
  const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Merchandise rollup from inventory-attached products on valid rows.
  const attachedRowCount = grid.validRows.filter((r) => r.products?.length).length;
  const merchandiseSubtotal = grid.validRows.reduce((sum, r) => sum + attachmentSubtotal(r.products ?? []), 0);

  const [showSuccess, setShowSuccess] = useState(false);
  const [showPayoutBankModal, setShowPayoutBankModal] = useState(false);

  const formatDate = (iso: string) => {
    if (!iso) return 'Tomorrow';
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  /** Whether any valid row in the current grid is COD. */
  const hasCodInBatch = grid.validRows.some((r) => r.cod === 'Yes');

  /** Creates the upload record/snapshot and shows the success dialog. */
  const completeBooking = () => {
    const id = generateUploadId();
    const snapshotRows: SpreadsheetBatchRow[] = grid.validRows.map((r) => {
      const product = r.products?.length
        ? `${r.products[0].name}${r.products.length > 1 ? ` +${r.products.length - 1} more` : ''}`
        : (r.productSku.trim() || '—');
      return {
        recipientName: r.recipientName.trim(),
        recipientMobile: r.recipientMobile.trim(),
        address: r.address.trim(),
        location: [r.barangay, r.city, r.province].map((s) => s.trim()).filter(Boolean).join(', '),
        product,
        quantity: r.quantity.trim(),
        declaredValue: r.declaredValue.trim(),
        parcelSize: r.parcelSize.trim(),
        cod: r.cod,
      };
    });
    setSpreadsheetBatchRows(id, snapshotRows);
    const base = createUploadRecord(id, 'Spreadsheet entry', uploadMode, firstMile, 'completed', uploadAccount);
    addUpload({
      ...base,
      source: 'spreadsheet',
      fileName: `Spreadsheet entry (${validCount} row${validCount === 1 ? '' : 's'})`,
      totalRows: validCount,
      validRows: validCount,
      errorRows: 0,
    });
    setShowSuccess(true);
  };

  /**
   * Final-submission CTA. COD content requires an eligible payout bank
   * account before booking can complete — checked here, the latest point
   * the batch's COD content is fully known and right before submission.
   */
  const handleComplete = async () => {
    if (validCount === 0) return;
    if (hasCodInBatch && !(await hasEligiblePayoutBank(uploadAccount.accountId))) {
      setShowPayoutBankModal(true);
      return;
    }
    completeBooking();
  };

  if (showAddressBook) {
    return (
      <div className="p-6">
        <AddressBook
          mode="select"
          onSelectAddress={(a) => { setSelectedAddress(a); setShowAddressBook(false); }}
          onClose={() => setShowAddressBook(false)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/bulk-uploader')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />
          Back to Bulk Upload
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">In-app Spreadsheet</h1>
        <p className="text-gray-600 mt-1 max-w-2xl">
          Enter order details in an in-app spreadsheet, then review and confirm your booking.
        </p>
      </div>

      {/* Delivery mode */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <button
              onClick={() => setUploadMode('standard')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${uploadMode === 'standard' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <div className="flex items-center justify-center gap-2">
                <IconUpload className="w-5 h-5 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">Standard</div>
                  <div className={`text-xs ${uploadMode === 'standard' ? 'text-blue-100' : 'text-gray-500'}`}>Regular delivery processing</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => setUploadMode('same-day')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${uploadMode === 'same-day' ? 'bg-orange-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <div className="flex items-center justify-center gap-2">
                <IconClock className="w-5 h-5 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">Same-Day Delivery</div>
                  <div className={`text-xs ${uploadMode === 'same-day' ? 'text-orange-100' : 'text-gray-500'}`}>Express same-day processing</div>
                </div>
              </div>
            </button>
            {/* On-Demand: selectable when enabled, navigates to Add-ons when not. */}
            <button
              onClick={() => onDemandEnabled ? setUploadMode('on-demand') : navigate('/dashboard/account-add-ons')}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${uploadMode === 'on-demand' ? 'bg-violet-600 text-white shadow-md' : onDemandEnabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-50 text-gray-400 border border-dashed border-gray-300 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700'}`}
            >
              <div className="flex items-center justify-center gap-2">
                <IconBolt className="w-5 h-5 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">On-Demand Delivery</div>
                  <div className={`text-xs ${uploadMode === 'on-demand' ? 'text-violet-100' : onDemandEnabled ? 'text-gray-500' : 'text-violet-600'}`}>
                    {onDemandEnabled ? 'Immediate, direct pickup & delivery' : 'Immediate, direct pickup & delivery — enable in Add-ons'}
                  </div>
                </div>
              </div>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3 flex items-start gap-1">
            <IconMapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Same-Day and On-Demand deliveries are currently available for Metro Manila locations only.
          </p>
        </CardContent>
      </Card>

      {/* Sender + schedule */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Sender / Pickup Details</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAddressBook(true)}>
                <IconMapPin className="w-4 h-4 mr-1.5" />
                Change
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {selectedAddress ? (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <IconMapPin className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant={selectedAddress.label === 'office' ? 'info' : selectedAddress.label === 'home' ? 'success' : 'default'} className="capitalize">
                      {selectedAddress.label === 'custom' ? selectedAddress.customLabel : selectedAddress.label}
                    </Badge>
                    {selectedAddress.isPreferred && <Badge variant="warning">Preferred</Badge>}
                  </div>
                  <p className="font-semibold text-gray-900">{selectedAddress.name}</p>
                  <p className="text-sm text-gray-600">{selectedAddress.mobileNumber}</p>
                  <p className="text-sm text-gray-600 mt-1">{[selectedAddress.barangay, selectedAddress.city, selectedAddress.province].filter(Boolean).join(', ')}</p>
                  {selectedAddress.otherDetails && <p className="text-sm text-gray-500 mt-1">{selectedAddress.otherDetails}</p>}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-600 mb-3">No pickup address selected</p>
                <Button onClick={() => setShowAddressBook(true)}>
                  <IconMapPin className="w-4 h-4 mr-2" />
                  Select Pickup Address
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>First-mile &amp; Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Pick-up or Drop-off</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFirstMile('pickup')}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${firstMile === 'pickup' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  <IconTruckDelivery className="w-4 h-4 shrink-0" />
                  Pick-up
                </button>
                <button
                  onClick={() => setFirstMile('dropoff')}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${firstMile === 'dropoff' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  <IconBuildingStore className="w-4 h-4 shrink-0" />
                  Drop-off
                </button>
              </div>
            </div>
            {firstMile === 'pickup' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pick-up Date</label>
                <Input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
                <p className="text-xs text-gray-500 mt-1.5">
                  {uploadMode === 'same-day'
                    ? 'Same-day cut-off is 10:00 AM. Orders booked after cut-off move to next day.'
                    : 'Pick-ups are scheduled the next business day by default.'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-600">Drop off your parcels at any GoGo Xpress branch. No pick-up scheduling required.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spreadsheet grid */}
      <Card>
        <CardHeader>
          <CardTitle>Order Rows</CardTitle>
          <CardDescription>
            Enter or paste your orders. Rows are validated inline against the same rules as uploaded files;
            only valid rows are booked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Inventory upsell — manual product entry still works; this just offers
              the faster path. Hidden once Inventory is enabled (attachment is a
              following pass). Small helpful callout, not a marketing banner. */}
          {!inventoryEnabled && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
              <IconInfoCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-900">
                <p>
                  No need to type product details manually. Enable Inventory to browse products and
                  auto-fill names, SKUs, weights, and prices.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/account-add-ons')}
                  className="mt-1 font-medium text-blue-700 hover:text-blue-800 hover:underline cursor-pointer"
                >
                  View Account Add-ons
                </button>
              </div>
            </div>
          )}
          <SpreadsheetBookingGrid
            onValidationChange={setGrid}
            inventoryEnabled={inventoryEnabled}
            products={products}
            metroOnly={uploadMode !== 'standard'}
          />
        </CardContent>
      </Card>

      {/* Confirm booking details */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Confirm Booking Details</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Summary of context */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Booking summary</h3>
            <div className="rounded-lg border border-gray-200 p-4 space-y-2 text-sm">
              <Detail label="Sender / Pickup" value={selectedAddress ? selectedAddress.name : 'Not selected'} />
              <Detail label="First-mile" value={firstMile === 'pickup' ? 'Pick-up' : 'Drop-off'} />
              <Detail label="Service type" value={MODE_LABELS[uploadMode]} />
              <div className="border-t border-gray-100 pt-2 space-y-1.5">
                <Detail label="Total rows" value={String(totalCount)} />
                <Detail label="Valid rows" value={String(validCount)} valueClass="text-green-700 font-medium" />
                <Detail label="Rows with errors" value={String(errorCount)} valueClass={errorCount > 0 ? 'text-red-700 font-medium' : 'text-gray-500'} />
              </div>
              {inventoryEnabled && attachedRowCount > 0 && (
                <div className="border-t border-gray-100 pt-2 space-y-1.5">
                  <Detail label="Rows with products" value={String(attachedRowCount)} />
                  <Detail label="Merchandise subtotal" value={peso(merchandiseSubtotal)} valueClass="text-gray-900 font-medium" />
                </div>
              )}
            </div>
          </div>

          {/* Payment */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Choose how to pay for GoGo Xpress fees</h3>
            <PaymentMethodTabs
              key={activeAccountName}
              billingAvailable={billingAvailable}
              onPaymentMethodChange={setSelectedPayment}
            />
          </div>

          {/* Fees + CTA */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Estimated fees</h3>
            <div className="rounded-lg border border-gray-200 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span className="text-gray-900 font-medium">
                  {fees.computedRows > 0 ? peso(fees.shipping) : '—'}
                </span>
              </div>
              {fees.computedRows > 0 && fees.itemProtection > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Item Protection</span>
                  <span className="text-gray-900 font-medium">{peso(fees.itemProtection)}</span>
                </div>
              )}
              {fees.computedRows > 0 && (
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="font-medium text-gray-700">Estimated total</span>
                  <span className="font-semibold text-gray-900">{peso(fees.total)}</span>
                </div>
              )}
              {fees.pendingRows > 0 && (
                <p className="text-xs text-gray-500 flex items-start gap-1">
                  <IconInfoCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  {fees.pendingRows} row{fees.pendingRows === 1 ? '' : 's'} pending — add Pouch/box size to estimate.
                </p>
              )}
              <p className="text-xs text-gray-400">
                {selectedPayment ? '' : 'Select a payment method. '}Final fees are confirmed at booking.
              </p>
            </div>
            <Button className="w-full" disabled={validCount === 0} onClick={handleComplete}>
              Complete Booking
            </Button>
            {validCount === 0 ? (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <IconAlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Add at least one valid row to complete booking.
              </p>
            ) : (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <IconCircleCheck className="w-3.5 h-3.5 flex-shrink-0 text-green-600" />
                {validCount} valid row{validCount === 1 ? '' : 's'} ready to book.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Booking success dialog */}
      {showSuccess && (
        <Dialog open={showSuccess} onClose={() => {}} size="sm">
          <div className="flex flex-col items-center text-center gap-4 p-2">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <IconCircleCheck className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Booking confirmed</h2>
              <p className="text-sm text-gray-600 mt-1">
                {validCount} parcel{validCount === 1 ? '' : 's'} booked via {MODE_LABELS[uploadMode]}.
              </p>
            </div>
            <div className="w-full rounded-lg border border-gray-200 p-4 space-y-2 text-sm text-left">
              <Detail label="Service" value={MODE_LABELS[uploadMode]} />
              <Detail label="First-mile" value={firstMile === 'pickup' ? `Pick-up on ${formatDate(pickupDate)}` : 'Drop-off'} />
              <Detail label="Estimated fees" value={fees.computedRows > 0 ? peso(fees.total) : '—'} />
              <Detail label="Payment" value={paymentCopy(selectedPayment, billingAvailable)} />
            </div>
            <p className="text-xs text-gray-500">
              Your booking has been added to Bulk Upload history. You can track shipments from the Transactions page.
            </p>
            <div className="flex flex-col gap-2 w-full">
              <Button className="w-full" onClick={() => navigate('/dashboard/bulk-uploader')}>
                Upload Another Batch
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard/transactions')}>
                View in Transactions
              </Button>
              <Link to="/dashboard" className="text-sm text-blue-600 hover:text-blue-800 mt-1">
                Go to Home
              </Link>
            </div>
          </div>
        </Dialog>
      )}

      {/* COD payout-account guard — opened in place of booking success */}
      <PayoutBankModal
        open={showPayoutBankModal}
        accountId={uploadAccount.accountId}
        onClose={() => setShowPayoutBankModal(false)}
        onEnrolled={() => { setShowPayoutBankModal(false); completeBooking(); }}
        title="Add a payout bank account"
        description="Your upload contains COD transactions. Add a payout bank account so we have somewhere to send your COD collections."
      />
    </div>
  );
}

function paymentCopy(method: SelectedPaymentMethod | null, billingAvailable: boolean): string {
  if (!method) return billingAvailable ? 'To be invoiced after service' : 'To be paid on pick-up';
  switch (method.type) {
    case 'billing':  return 'To be invoiced after service';
    case 'cash':     return method.cashOption === 'deduct' ? 'Deducted from COD collections' : 'To be paid on pick-up';
    case 'ewallet':  return `Payment completed — prepaid via ${method.wallet}`;
    case 'card':     return 'Payment completed — prepaid via card';
    case 'banking':  return method.bank ? `Payment completed — prepaid via ${method.bank}` : 'Payment completed — prepaid via online banking';
  }
}

function Detail({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-600">{label}:</span>
      <span className={valueClass ?? 'text-gray-900 font-medium'}>{value}</span>
    </div>
  );
}
