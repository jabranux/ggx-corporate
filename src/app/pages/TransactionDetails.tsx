import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { IconArrowLeft, IconStar, IconFileText, IconShare, IconMessage, IconPackage, IconPackageOff, IconUpload, IconArrowRight, IconReceiptRefund, IconX, IconCircleCheck, IconCheck, IconPhoto, IconExternalLink, IconBolt, IconMapPin, IconHeadset, IconBuildingStore, IconEdit } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
// Transaction detail + totals come through the transactionService facade. The
// totals are treated as backend-provided (FTX/BFF in production), not computed
// as frontend source-of-truth. Claims go through claimsService; support tickets
// remain on their data module (no ticketsService yet).
import {
  getTransactionById,
  getTransactionTotals,
  resolveOnDemandProgress,
  statusConfig,
  serviceTypeLabel,
  SOURCE_TYPE_LABEL,
  BOOKING_METHOD_LABEL,
  type Transaction,
} from '../services/transactionService';
import { OnDemandBadge, OnDemandRoute, OnDemandTimeline } from '../components/OnDemandTracker';
import { OnDemandMap } from '../components/OnDemandMap';
import { getOrderByTracking } from '../services/storefrontOrdersService';
import {
  getClaimByTrackingNumber, fileClaim, cancelBooking, isBookingCancelled,
  claimEligible, cancelEligible, CLAIM_STATUS_META, CLAIM_REASONS, type Claim,
} from '../services/claimsService';
// Support runs on HeyQ. "Report an issue" opens an in-app drawer that submits the
// ticket DIRECTLY to HeyQ's customer API with the order attached — the user stays
// on this page and is never redirected to HeyQ's Contact Us form.
import { ReportIssueDrawer } from '../components/ReportIssueDrawer';
import { useJourney } from '../contexts/JourneyContext';
import { JOURNEY_P3_TRACKING_NUMBER } from '../data/journeyRegistry';
import { buildJourneyEditFixtureTransaction, applyJourneyEditDraft } from '../data/journeyTransactionFixture';
import { getEditEligibility } from '../lib/transactionEditEligibility';
import { EditDeliveryDrawer } from '../components/journeys/EditDeliveryDrawer';

export function TransactionDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const journey = useJourney();
  // P3 UX Journey: only active for the journey's own fixture tracking number,
  // so a real transaction id is never affected even while the journey is
  // active elsewhere. Deep-linking this id without the journey active falls
  // through to the normal (not-found) lookup below — no fixture leakage.
  const isJourneyP3 = journey.activeJourney?.id === 'edit-delivery-details' && id === JOURNEY_P3_TRACKING_NUMBER;
  const [rating, setRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [proofModal, setProofModal] = useState<string | null>(null);

  // undefined = loading, null = not found, Transaction = loaded.
  const [transaction, setTransaction] = useState<Transaction | null | undefined>(undefined);

  // In-app "Report an issue" drawer (submits to HeyQ's customer API in place).
  const [reportOpen, setReportOpen] = useState(false);
  // Journey-only "Edit Delivery Details" drawer (P3). Never touches transactionService.
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  // Claims & cancellation (frontend/mock) — local view state, loaded via the
  // claimsService facade keyed off the id route param.
  const [claim, setClaim] = useState<Claim | undefined>(undefined);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState({ reason: '', details: '' });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (isJourneyP3) {
      // Journey-local fixture, merged with any confirmed edit-drawer draft.
      // Never calls transactionService / touches the real transactions seed.
      setTransaction(applyJourneyEditDraft(buildJourneyEditFixtureTransaction(), journey.editDelivery.confirmed));
      return;
    }
    let cancelledLoad = false;
    setTransaction(undefined);
    getTransactionById(id ?? '')
      .then((tx) => { if (!cancelledLoad) setTransaction(tx); })
      .catch(() => { if (!cancelledLoad) setTransaction(null); });
    return () => { cancelledLoad = true; };
  }, [id, isJourneyP3, journey.editDelivery.confirmed]);

  useEffect(() => {
    let cancelledLoad = false;
    if (!id) { setClaim(undefined); setCancelled(false); return; }
    getClaimByTrackingNumber(id).then((c) => { if (!cancelledLoad) setClaim(c ?? undefined); }).catch(() => {});
    isBookingCancelled(id).then((c) => { if (!cancelledLoad) setCancelled(c); }).catch(() => {});
    return () => { cancelledLoad = true; };
  }, [id]);

  /** Open the in-app report drawer for this order (no external navigation). */
  const openReport = () => setReportOpen(true);

  // Loading state — brief async fetch from the service facade.
  if (transaction === undefined) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/transactions')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />
          Back to Transactions
        </Button>
        <Card className="mt-6">
          <CardContent className="p-12 text-center text-sm text-gray-400">
            Loading transaction…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/transactions')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />
          Back to Transactions
        </Button>
        <Card className="mt-6">
          <CardContent className="p-12 text-center">
            <IconPackageOff className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900">Transaction not found</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              We couldn&apos;t find a transaction with tracking number{' '}
              <span className="font-medium text-gray-700">{id}</span>. It may have been removed or the link is incorrect.
            </p>
            <Button className="mt-6" onClick={() => navigate('/dashboard/transactions')}>
              View All Transactions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = statusConfig[transaction.status];
  // Sample backend-provided totals (FTX/BFF own these in production).
  const { itemsTotal, feesTotal: totalFees } = getTransactionTotals(transaction);
  // P3 UX Journey — the fixture is always COD-payable-on-delivery; eligibility
  // still runs through the same narrow, testable helper used by its tests.
  const editEligibility = getEditEligibility({ status: transaction.status, paymentKind: 'cod' });

  const canFileClaim = claimEligible(transaction.status) && !claim;
  const canCancel = cancelEligible(transaction.status) && !cancelled;

  const handleSubmitClaim = async () => {
    if (!claimForm.reason) return;
    const created = await fileClaim({
      trackingNumber: transaction.trackingNumber,
      reason: claimForm.reason,
      details: claimForm.details,
      amount: transaction.payment.codAmount || undefined,
      accountName: transaction.subaccount,
    });
    setClaim(created);
    setShowClaimForm(false);
    setClaimForm({ reason: '', details: '' });
  };

  const handleCancel = async () => {
    await cancelBooking(transaction.trackingNumber, transaction.subaccount);
    setCancelled(true);
    setShowCancelConfirm(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/transactions')}>
          <IconArrowLeft className="w-4 h-4 mr-2" />
          Back to Transactions
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transaction Details</h1>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-gray-600">
              <span className="font-medium">Tracking Number:</span> {transaction.trackingNumber}
            </p>
            {/* For On-Demand, show the granular delivery stage (avoids the
                ambiguous coarse "Pending" while a driver is being matched). */}
            {transaction.serviceType === 'on_demand'
              ? <Badge className="bg-violet-100 text-violet-800">{resolveOnDemandProgress(transaction).currentLabel}</Badge>
              : <Badge variant={status.variant}>{status.label}</Badge>}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Created: {transaction.createdAt}
            <span className="mx-2 text-gray-300">·</span>
            Service Type: <span className="font-medium text-gray-600">{serviceTypeLabel(transaction.serviceType)}</span>
          </p>
        </div>

        {/* P3 UX Journey — Edit Delivery Details. Journey-only surface: hidden
            entirely outside the active journey's own fixture transaction. */}
        {isJourneyP3 && editEligibility.editable && (
          <Button onClick={() => setEditDrawerOpen(true)}>
            <IconEdit className="w-4 h-4 mr-2" />
            Edit Delivery Details
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* On-Demand live delivery progress — OD bookings only. Courier-style
              progress, mocked ETA, pickup/drop-off, and OD action CTAs. */}
          {transaction.serviceType === 'on_demand' && (() => {
            const progress = resolveOnDemandProgress(transaction);
            const linkedOrder = getOrderByTracking(transaction.trackingNumber);
            return (
              <Card className="border-violet-200">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <IconBolt className="w-5 h-5 text-violet-600" />
                      </span>
                      <div>
                        <CardTitle>On-Demand Delivery</CardTitle>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {progress.currentLabel}
                          <span className="mx-1.5 text-gray-300">·</span>
                          <span className="font-medium text-violet-700">{progress.eta}</span>
                        </p>
                      </div>
                    </div>
                    <OnDemandBadge />
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Linked storefront order context (when this delivery came
                      from a storefront/product checkout that the seller accepted). */}
                  {linkedOrder && (
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                      <div className="flex items-start gap-2.5">
                        <IconBuildingStore className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-gray-900">
                            From storefront order {linkedOrder.id}
                          </p>
                          <p className="text-xs text-gray-500">
                            {linkedOrder.storeName} · accepted by seller · COD ₱{linkedOrder.codTotal.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-shrink-0"
                        onClick={() => navigate(`/dashboard/storefront/orders/${linkedOrder.id}`)}
                      >
                        View order
                        <IconArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </div>
                  )}

                  <OnDemandMap progress={progress} />

                  <OnDemandRoute
                    pickup={{ name: transaction.sender.name, address: transaction.sender.address }}
                    dropoff={{ name: transaction.recipient.name, address: transaction.recipient.address }}
                  />

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Delivery progress</p>
                    <OnDemandTimeline progress={progress} />
                  </div>

                  {/* OD action CTAs */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Button
                      className="flex-1"
                      onClick={() => window.open(`/track/${transaction.trackingNumber}`, '_blank', 'noopener')}
                    >
                      <IconMapPin className="w-4 h-4 mr-2" />
                      Track live delivery
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={openReport}>
                      <IconHeadset className="w-4 h-4 mr-2" />
                      Contact support
                    </Button>
                    {cancelled ? (
                      <Button variant="ghost" className="flex-1 text-gray-400" disabled>
                        <IconX className="w-4 h-4 mr-2" />
                        Booking cancelled
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="flex-1 text-red-600 hover:bg-red-50"
                        disabled={!canCancel}
                        onClick={() => setShowCancelConfirm(true)}
                      >
                        <IconX className="w-4 h-4 mr-2" />
                        Cancel booking
                      </Button>
                    )}
                  </div>
                  {!cancelled && !canCancel && (
                    <p className="text-xs text-gray-400 -mt-2">
                      Cancellation is only available for newly-booked deliveries before a driver picks up.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardHeader><CardTitle>Pick-up and Delivery Dates</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pick-up Date</p>
                  <p className="text-gray-900 mt-1">{transaction.pickupDate}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Delivery Date</p>
                  <p className="text-gray-900 mt-1">{transaction.deliveryDate}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Sender and Recipient Details</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900">Sender</h4>
                  <div><p className="text-sm font-medium text-gray-600">Full Name</p><p className="text-gray-900">{transaction.sender.name}</p></div>
                  <div><p className="text-sm font-medium text-gray-600">Contact Number</p><p className="text-gray-900">{transaction.sender.contactNumber}</p></div>
                  <div><p className="text-sm font-medium text-gray-600">Address</p><p className="text-gray-900">{transaction.sender.address}</p></div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900">Recipient</h4>
                  <div><p className="text-sm font-medium text-gray-600">Full Name</p><p className="text-gray-900">{transaction.recipient.name}</p></div>
                  <div><p className="text-sm font-medium text-gray-600">Contact Number</p><p className="text-gray-900">{transaction.recipient.contactNumber}</p></div>
                  <div><p className="text-sm font-medium text-gray-600">Address</p><p className="text-gray-900">{transaction.recipient.address}</p></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Order Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {transaction.items.map((item, index) => (
                  <div key={index} className="flex justify-between items-start pb-3 border-b border-gray-200">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-600">{item.description}</p>
                      {item.attributes && (
                        <div className="flex gap-2 mt-1">
                          {Object.entries(item.attributes).map(([key, value]) => (
                            <span key={key} className="text-xs text-gray-500">{key}: {value}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-sm text-gray-600 mt-1">Qty: {item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">₱{(item.price * item.quantity).toLocaleString()}</p>
                      <p className="text-sm text-gray-500">₱{item.price.toLocaleString()} each</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900">Items Total</span>
                  <span className="font-semibold text-gray-900">₱{itemsTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-4 space-y-3 border-t border-gray-200">
                <h4 className="font-semibold text-gray-900">Packaging and Dimensions</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div><p className="text-sm font-medium text-gray-600">Package Size</p><p className="text-gray-900">{transaction.packaging.size}</p></div>
                  <div><p className="text-sm font-medium text-gray-600">Dimensions</p><p className="text-gray-900">{transaction.packaging.dimensions}</p></div>
                  <div><p className="text-sm font-medium text-gray-600">Weight</p><p className="text-gray-900">{transaction.packaging.weight}</p></div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200">
                <h4 className="font-semibold text-gray-900 mb-2">Ordered From</h4>
                <p className="text-gray-900">{transaction.store.name}</p>
                <a href={`https://${transaction.store.url}`} className="text-sm text-blue-600 hover:text-blue-700" target="_blank" rel="noopener noreferrer">
                  {transaction.store.url}
                </a>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Transaction Fees</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center"><span className="text-gray-700">Service Fee</span><span className="text-gray-900">₱{transaction.fees.serviceFee.toLocaleString()}</span></div>
                <div className="flex justify-between items-center"><span className="text-gray-700">Shipping Fee</span><span className="text-gray-900">₱{transaction.fees.shippingFee.toLocaleString()}</span></div>
                <div className="flex justify-between items-center"><span className="text-gray-700">Protection Fee</span><span className="text-gray-900">₱{transaction.fees.protectionFee.toLocaleString()}</span></div>
                {transaction.fees.discount !== 0 && (
                  <div className="flex justify-between items-center text-green-600"><span>Discount</span><span>₱{transaction.fees.discount.toLocaleString()}</span></div>
                )}
                <div className="flex justify-between items-center"><span className="text-gray-700">Payment Processing Fee</span><span className="text-gray-900">₱{transaction.fees.processingFee.toLocaleString()}</span></div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-200 font-semibold text-gray-900"><span>Total Fees</span><span>₱{totalFees.toLocaleString()}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Payment Method</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center"><span className="text-gray-700">Method</span><span className="text-gray-900">{transaction.payment.method}</span></div>
                <div className="flex justify-between items-center"><span className="text-gray-700">Paid By</span><span className="text-gray-900">{transaction.payment.paidBy}</span></div>
                {transaction.payment.codAmount && (
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200 font-semibold"><span className="text-gray-900">COD Amount</span><span className="text-gray-900">₱{transaction.payment.codAmount.toLocaleString()}</span></div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Claims & Cancellation */}
          {(claim || cancelled || canFileClaim || canCancel) && (
            <Card>
              <CardHeader><CardTitle>Claims &amp; Cancellation</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {cancelled && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
                    <IconX className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700">This booking has been cancelled.</p>
                  </div>
                )}

                {claim && (
                  <div
                    className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/dashboard/claims/${claim.id}`)}
                  >
                    <div className="flex items-start gap-2.5">
                      <IconReceiptRefund className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-600 hover:text-blue-700">Claim {claim.id}</p>
                        <p className="text-xs text-gray-500">{claim.reason}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={CLAIM_STATUS_META[claim.status].variant}>{CLAIM_STATUS_META[claim.status].label}</Badge>
                      <IconArrowRight className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                  </div>
                )}

                {canFileClaim && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">This delivery is undelivered. You can file a refund claim linked to this tracking number.</p>
                    <Button variant="outline" size="sm" onClick={() => setShowClaimForm(true)}>
                      <IconReceiptRefund className="w-4 h-4 mr-1.5" />
                      File a Claim
                    </Button>
                  </div>
                )}

                {canCancel && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">This booking is newly created and can still be cancelled.</p>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setShowCancelConfirm(true)}>
                      <IconX className="w-4 h-4 mr-1.5" />
                      Cancel Booking
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Order attribution — scope, source, connected store, booking method */}
          <Card>
            <CardHeader><CardTitle>Order Source &amp; Attribution</CardTitle></CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-600">Account scope</p>
                  <p className="text-gray-900 text-sm">
                    {transaction.attribution.accountScope === 'main' ? 'Main Account' : 'Subaccount'}
                    {transaction.attribution.accountScope === 'subaccount' && (
                      <span className="text-gray-500"> · {transaction.subaccount}</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Source</p>
                  <p className="text-gray-900 text-sm">{SOURCE_TYPE_LABEL[transaction.attribution.sourceType]}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Booking method</p>
                  <p className="text-gray-900 text-sm">{BOOKING_METHOD_LABEL[transaction.attribution.bookingMethod]}</p>
                </div>
                {transaction.attribution.connectedStore && (
                  <div>
                    <p className="text-sm font-medium text-gray-600">Connected store / integration</p>
                    <p className="text-gray-900 text-sm">{transaction.attribution.connectedStore}</p>
                  </div>
                )}
                {transaction.attribution.createdBy && (
                  <div>
                    <p className="text-sm font-medium text-gray-600">Created by</p>
                    <p className="text-gray-900 text-sm">{transaction.attribution.createdBy}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {transaction.batch && (
            <Card>
              <CardHeader><CardTitle>Upload Source</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <IconUpload className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-medium text-gray-900">Uploaded via Bulk Upload</p>
                      <Badge variant="info">Batch</Badge>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                      <div><p className="text-sm font-medium text-gray-600">Batch File</p><p className="text-gray-900 text-sm">{transaction.batch.fileName}</p></div>
                      <div><p className="text-sm font-medium text-gray-600">Batch ID</p><p className="text-gray-900 text-sm">{transaction.batch.batchId}</p></div>
                      {transaction.batch.accountName && (
                        <div><p className="text-sm font-medium text-gray-600">Account</p><p className="text-gray-900 text-sm">{transaction.batch.accountName}</p></div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => navigate(`/dashboard/bulk-uploader/summary/${transaction.batch!.batchId}`)}
                    >
                      View batch summary
                      <IconArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <IconMessage className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900 mb-1">Need Help?</h4>
                  <p className="text-sm text-blue-800 mb-3">
                    Have questions or issues with this delivery? Report it here and we’ll open a
                    support ticket for this order — without leaving this page.
                  </p>
                  <Button size="sm" onClick={openReport}>
                    <IconHeadset className="w-4 h-4 mr-2" />
                    Report an issue
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => navigate('/dashboard/bulk-uploader')}>
              <IconPackage className="w-4 h-4 mr-2" />
              Upload New Delivery
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-6">
              {ratingSubmitted ? (
                <div className="flex items-center gap-2 text-green-800">
                  <IconCircleCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-900">Thanks for your feedback!</p>
                    <p className="text-sm text-green-700">You rated this delivery {rating} out of 5 stars.</p>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-green-900 mb-2">Rate Your Delivery Experience</h3>
                  <p className="text-sm text-green-800 mb-4">Your feedback helps us improve our service and recognize excellent delivery riders.</p>
                  <div className="flex gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setRating(star)} className="transition-colors">
                        <IconStar className={`w-8 h-8 ${star <= rating ? 'fill-yellow-500 text-yellow-500' : 'text-gray-300'}`} />
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full bg-white"
                    disabled={rating === 0}
                    onClick={() => { if (rating > 0) setRatingSubmitted(true); }}
                  >
                    Submit Rating
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tracking Timeline</CardTitle>
                  <Link
                    to={`/track/${transaction.trackingNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 mt-0.5"
                  >
                    <IconExternalLink className="w-3 h-3" />
                    Public tracking page
                  </Link>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/track/${transaction.trackingNumber}`;
                    navigator.clipboard.writeText(url).then(() => {
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2000);
                    });
                  }}
                >
                  {shareCopied ? (
                    <>
                      <IconCheck className="w-4 h-4 mr-1 text-green-500" />
                      <span className="text-green-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <IconShare className="w-4 h-4 mr-1" />
                      Share
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transaction.timeline.map((event, index) => (
                  <div key={index} className="relative">
                    {index !== transaction.timeline.length - 1 && (
                      <div className="absolute left-2 top-8 bottom-0 w-0.5 bg-gray-200" />
                    )}
                    <div className="flex gap-3">
                      <div className={`w-4 h-4 rounded-full flex-shrink-0 mt-1 ${index === 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <div className="flex-1 pb-4">
                        <p className="font-medium text-gray-900">{event.status}</p>
                        <p className="text-sm text-gray-600">{event.date}</p>
                        {event.note && <p className="text-sm text-gray-500 mt-1">{event.note}</p>}
                        {event.hasProof && (
                          <button
                            className="text-sm text-blue-600 hover:text-blue-700 mt-1 flex items-center gap-1"
                            onClick={() => setProofModal(event.status)}
                          >
                            <IconPhoto className="w-3.5 h-3.5" />
                            View proof of {event.status.toLowerCase()}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* File a claim */}
      <Dialog open={showClaimForm} onClose={() => setShowClaimForm(false)} size="md" title="File a Claim">
        <p className="text-sm text-gray-500 mb-4">
          Claim linked to <span className="font-medium text-gray-700">{transaction.trackingNumber}</span>. Our claims team will review your request.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason <span className="text-red-500">*</span></label>
            <Select value={claimForm.reason} onChange={(e) => setClaimForm({ ...claimForm, reason: e.target.value })}>
              <option value="">Select a reason</option>
              {CLAIM_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Details</label>
            <textarea
              className="w-full h-24 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="Describe the issue (optional)..."
              value={claimForm.details}
              onChange={(e) => setClaimForm({ ...claimForm, details: e.target.value })}
            />
          </div>
          {transaction.payment.codAmount > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <IconCircleCheck className="w-4 h-4 text-gray-400" />
              Requested refund amount: <span className="font-medium text-gray-900">₱{transaction.payment.codAmount.toLocaleString()}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2.5 justify-end pt-5">
          <Button variant="outline" size="sm" onClick={() => setShowClaimForm(false)}>Cancel</Button>
          <Button size="sm" disabled={!claimForm.reason} onClick={handleSubmitClaim}>Submit Claim</Button>
        </div>
      </Dialog>

      {/* P3 UX Journey — Edit Delivery Details drawer. Saves into journey state
          only (via JourneyContext.confirmEditDelivery); never calls transactionService. */}
      {isJourneyP3 && (
        <EditDeliveryDrawer
          open={editDrawerOpen}
          onClose={() => setEditDrawerOpen(false)}
          transaction={transaction}
          onConfirm={(draft) => journey.confirmEditDelivery(draft)}
        />
      )}

      {/* In-app report drawer — submits an order-linked ticket to HeyQ's customer
          API without leaving this page. HeyQ still owns the ticket lifecycle. */}
      <ReportIssueDrawer
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        preselected={[
          {
            externalOrderId: transaction.trackingNumber,
            trackingNumber: transaction.trackingNumber,
            statusKey: transaction.status,
            statusLabel: status.label,
            statusVariant: status.variant,
            reference: transaction.destination || transaction.recipient.name,
          },
        ]}
      />

      {/* Proof of delivery / pickup mock */}
      <Dialog open={!!proofModal} onClose={() => setProofModal(null)} size="md" title={`Proof of ${proofModal ?? ''}`}>
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-100 aspect-video flex flex-col items-center justify-center text-center gap-2">
            <IconPhoto className="w-10 h-10 text-gray-300" />
            <p className="text-sm text-gray-400 max-w-xs">
              A photo captured by the rider at the time of {(proofModal ?? '').toLowerCase()} would appear here.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs font-medium text-gray-500 mb-0.5">Tracking Number</p><p className="text-gray-900">{transaction?.trackingNumber}</p></div>
            <div><p className="text-xs font-medium text-gray-500 mb-0.5">Event</p><p className="text-gray-900">{proofModal}</p></div>
            <div><p className="text-xs font-medium text-gray-500 mb-0.5">Recipient</p><p className="text-gray-900">{transaction?.recipient.name}</p></div>
            <div><p className="text-xs font-medium text-gray-500 mb-0.5">Location</p><p className="text-gray-900">{transaction?.destination}</p></div>
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <Button size="sm" variant="outline" onClick={() => setProofModal(null)}>Close</Button>
        </div>
      </Dialog>

      {/* Cancel booking confirmation */}
      <ConfirmDialog
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleCancel}
        title="Cancel this booking?"
        description={
          <>
            Booking <span className="font-medium text-gray-700">{transaction.trackingNumber}</span> will be cancelled. This can only be done for newly-booked transactions.
          </>
        }
        confirmLabel="Cancel Booking"
        variant="destructive"
        confirmIcon={<IconX className="w-3.5 h-3.5 mr-1.5" />}
      />
    </div>
  );
}
