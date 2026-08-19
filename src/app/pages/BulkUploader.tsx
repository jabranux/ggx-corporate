import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  IconUpload, IconDownload, IconFileSpreadsheet, IconMapPin, IconClock,
  IconLink, IconX, IconTruckDelivery, IconBuildingStore,
  IconPhone, IconArrowUp, IconBolt,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { Dialog, ConfirmDialog } from '../components/ui/Dialog';
import { AddressBook, type Address } from '../components/AddressBook';
import { PaymentPreferenceCard } from '../components/PaymentPreferenceCard';
import { BulkColumnMapper } from '../components/BulkColumnMapper';
import { useUploadExitGuard } from '../hooks/useUploadExitGuard';
import { downloadBulkTemplate, downloadBulkTemplateXls, BULK_TEMPLATE_COLUMNS } from '../data/bulkTemplate';
import { DROPOFF_LOCATIONS } from '../data/dropoffLocations';
// Bulk upload reads/writes go through the bulkUploadService facade (not the
// data module directly). The recent-uploads list (session records merged with
// the seed) is owned by the service. In production this is fronted by the GGX
// Corporate BFF; batch creation would POST /bulk-uploads.
import {
  addUpload, updateUploadStatus, generateUploadId, createUploadRecord,
  getBulkUploads, type UploadRecord,
} from '../services/bulkUploadService';
import { useSubAccounts } from '../contexts/SubAccountContext';
import { useAuth } from '../contexts/AuthContext';
import { useJourney } from '../contexts/JourneyContext';
import { useModuleAccessContext } from '../hooks/useModuleAccess';
import { getFeatureStateSync } from '../services/featureEnablementService';

/** Page-level service mode (chosen for the whole batch, not per row). */
const MODE_LABELS: Record<'standard' | 'same-day' | 'on-demand', string> = {
  standard: 'Standard Upload',
  'same-day': 'Same-Day Delivery',
  'on-demand': 'On-Demand Delivery',
};

const STATUS_CONFIG = {
  processing:       { variant: 'info'    as const, label: 'Processing'      },
  'needs-review':   { variant: 'warning' as const, label: 'Needs Review'    },
  'awaiting-payment': { variant: 'pending' as const, label: 'Awaiting payment' },
  completed:        { variant: 'success' as const, label: 'Completed'       },
};

// Mock file headers and sample data returned when a file is NOT the GGX template.
// Mirrors the column-mapping screenshot reference.
// Includes the four dimweight source columns (Length/Width/Height/Weight) after
// Pouch/box size so they can be mapped to the matching GGX fields. They mirror
// the GGX template header names exactly so auto-match picks them up. Values are
// blank here because every sample row uses a standard size (Small) — dimensions
// are only required for Custom rows (see BulkColumnMapper conditional rule).
const MOCK_CUSTOM_HEADERS = [
  'Buyer Name', 'CP#', 'Street Address', 'Province', 'City / Town',
  'Barangay', 'Unit/Floor', 'Item Name', 'Pouch/box size',
  'Length (cm)', 'Width (cm)', 'Height (cm)', 'Weight (kg)',
  'Cash on delivery (COD)',
  'COD Amount', 'Declared Value', 'Item Protection', 'Recipient Pays', 'Promo', 'Ref ID',
];
const MOCK_SAMPLE_DATA = [
  ['Jen Ramos',  '+639176543210', '123 Penarubia St.',           'Metro Manila', 'Mandaluyong City', 'Malamig',    '–', 'UNO FLIP! Double Sided Ca...', 'Small', '–', '–', '–', '–', 'No',  '–',      '599.00',  '–', 'No', '–', '–'],
  ['Ramon Jee',  '+639101234567', '2287 Allegro Center, Chin...', 'Metro Manila', 'Makati City',      'Magallanes', '–', 'UNO FLIP! Double Sided Ca...', 'Small', '–', '–', '–', '–', 'Yes', '500.00', '1200.00', '–', '–', '–', '–'],
  ['Rena Jams',  '+639123456789', '1234 Harmony Lane St.',       'Metro Manila', 'Quezon City',      'Barangay 1', '–', 'UNO FLIP! Double Sided Ca...', 'Small', '–', '–', '–', '–', 'No',  '–',      '350.00',  '–', '–', '–', '–'],
];

/** Whether the uploaded file already uses GGX template headers (skip mapping). */
function isGgxTemplate(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.includes('template') || lower.includes('ggx') || lower.includes('gogo') || lower.endsWith('.csv');
}

type Step = 'form' | 'mapping' | 'fast-processing' | 'background-processing';

export function BulkUploader() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getCurrentAccountName, getCurrentAccountId, currentAccount } = useSubAccounts();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  // A Manager always uploads under their assigned subaccount; an Admin uploads
  // under the active account/subaccount context.
  const activeAccountName = isManager ? user!.accountName : getCurrentAccountName();

  // Account scope captured on the upload record/notification (parent vs subaccount).
  // accountId is the canonical stable id; accountName is display only.
  const uploadAccount = isManager
    ? { accountId: user!.accountId, accountName: user!.accountName, accountType: 'subaccount' as const }
    : {
        accountId: getCurrentAccountId(),
        accountName: activeAccountName,
        accountType: (currentAccount === 'main' ? 'main' : 'subaccount') as 'main' | 'subaccount',
      };

  const journey = useJourney();
  const isJourneyP2 = journey.activeJourney?.id === 'sdd-cutoff-handling';
  const [journeySimResult, setJourneySimResult] = useState(false);

  const [step, setStep]             = useState<Step>('form');
  const [uploadMode, setUploadMode] = useState<'standard' | 'same-day' | 'on-demand'>('standard');

  // On-Demand Delivery appears in the service-mode selector only when it's
  // enabled for the current account/context (respects module/access gating).
  const moduleCtx = useModuleAccessContext();
  const onDemandEnabled = getFeatureStateSync('on_demand', moduleCtx.scopeAccountId).enabled;
  useEffect(() => {
    if (uploadMode === 'on-demand' && !onDemandEnabled) setUploadMode('standard');
  }, [onDemandEnabled, uploadMode]);
  const [firstMile, setFirstMile]   = useState<'pickup' | 'dropoff'>('pickup');
  const [pickupDate, setPickupDate] = useState('');
  const [showDropoffs, setShowDropoffs] = useState(false);
  const [uploadUrl, setUploadUrl]   = useState('');

  // P2 UX Journey: establish the Same-Day / pickup / post-cutoff scenario
  // automatically — no manual account/mode setup needed to see the proposed UX.
  useEffect(() => {
    if (!isJourneyP2) return;
    setUploadMode('same-day');
    setFirstMile('pickup');
    setPickupDate(journey.sddCutoff.nextPickupDateValue);
    setJourneySimResult(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJourneyP2]);

  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string } | null>(null);
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);

  // Force a re-render when background uploads complete so Recent Uploads updates.
  const [sessionTick, setSessionTick] = useState(0);

  const [showAddressBook, setShowAddressBook] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>({
    id: '1', label: 'office', name: 'Acme Corporation',
    mobileNumber: '+63 917 123 4567', province: 'Metro Manila',
    city: 'Makati', barangay: 'Poblacion',
    otherDetails: '5th Floor, ABC Building, Ayala Avenue', isPreferred: true,
  });

  // Exit protection — armed once the user has meaningfully started an upload
  // (file/URL selected, mapping reached/confirmed, or any uploader field
  // touched) and released once the upload is handed off (background ack) or
  // successfully completed (fast-processing redirect). A ref (not state) so
  // handlers below can disarm it synchronously right before a programmatic
  // redirect, without waiting on a re-render.
  const uploadTouchedRef = useRef(false);
  const markTouched = () => { uploadTouchedRef.current = true; };
  const exitGuard = useUploadExitGuard(uploadTouchedRef);
  // Rendered into every return branch below (mapping step and address book
  // both return early), since the blocker can trip on any of them.
  const exitGuardDialog = exitGuard.state === 'blocked' ? (
    <ConfirmDialog
      open
      onClose={() => exitGuard.reset()}
      onConfirm={() => exitGuard.proceed()}
      title="Leave bulk upload?"
      description="Your current upload progress will be lost if you leave this page."
      cancelLabel="Continue upload"
      confirmLabel="Leave uploader"
      variant="destructive"
    />
  ) : null;

  // Dismiss the fast-processing modal if the navigate fires before unmount.
  useEffect(() => {
    if (step !== 'fast-processing') return;
    const timer = setTimeout(() => {
      if (pendingUploadId) {
        uploadTouchedRef.current = false;
        navigate(`/dashboard/bulk-uploader/summary/${pendingUploadId}`);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [step, pendingUploadId, navigate]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const captureFile = (file: File | undefined) => {
    if (!file) return;
    setSelectedFile({ name: file.name, size: formatSize(file.size) });
    markTouched();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    captureFile(e.dataTransfer.files?.[0]);
  };

  /**
   * After file selection or URL import: check headers, then either show
   * column mapping (custom file) or proceed directly to processing.
   * uploadMode === 'same-day' → background processing flow
   * uploadMode === 'standard' → fast processing flow
   */
  const startUpload = (fileName?: string) => {
    const name = fileName ?? selectedFile?.name ?? 'upload.csv';
    const id = generateUploadId();
    setPendingUploadId(id);

    if (!isGgxTemplate(name) && !uploadUrl.trim()) {
      // Non-template file via drag/browse → show mapping step, with parsed
      // headers/sample data for review.
      markTouched();
      setStep('mapping');
      return;
    }

    proceedToProcessing(id, name);
  };

  const proceedToProcessing = (id: string, fileName: string) => {
    if (uploadMode === 'same-day') {
      // Background processing — will return to this page
      const record = createUploadRecord(id, fileName, uploadMode, firstMile, 'processing', uploadAccount);
      addUpload(record);
      setStep('background-processing');
    } else {
      // Fast processing — will navigate to summary
      const record = createUploadRecord(id, fileName, uploadMode, firstMile, 'needs-review', uploadAccount);
      addUpload(record);
      setStep('fast-processing');
    }
  };

  /**
   * P2 UX Journey — a journey-local simulated outcome for the post-cutoff
   * Same-Day upload. Deliberately does NOT call `addUpload`/`createUploadRecord`
   * or navigate to a real batch: nothing here touches normal upload history.
   */
  const handleJourneySimulatedUpload = () => {
    journey.acknowledgeSddCutoff();
    setJourneySimResult(true);
  };

  const handleMappingConfirm = () => {
    const id = pendingUploadId ?? generateUploadId();
    const fileName = selectedFile?.name ?? 'upload.csv';
    setPendingUploadId(id);
    markTouched();
    proceedToProcessing(id, fileName);
  };


  const handleBackgroundAck = () => {
    // Acknowledging hands the batch off to background processing — the
    // session state on this page is cleared, so there is nothing left here to
    // warn about losing.
    uploadTouchedRef.current = false;
    setStep('form');
    setSelectedFile(null);
    setUploadUrl('');
    if (!pendingUploadId) return;
    const idToComplete = pendingUploadId;
    // Mock background completion after 8 seconds.
    setTimeout(() => {
      updateUploadStatus(idToComplete, 'needs-review');
      setSessionTick((t) => t + 1);
    }, 8000);
  };

  const handleSelectAddress = (address: Address) => {
    setSelectedAddress(address);
    setShowAddressBook(false);
    markTouched();
  };

  // Recent uploads — loaded via the service (session records merged with seed).
  // Reloads on sessionTick (background completion / new upload) and step changes.
  const [allUploads, setAllUploads] = useState<UploadRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    getBulkUploads()
      .then((list) => { if (!cancelled) setAllUploads(list); })
      .catch(() => { if (!cancelled) setAllUploads([]); });
    return () => { cancelled = true; };
  }, [sessionTick, step]);

  // --- Mapping step renders instead of the main form ---
  if (step === 'mapping') {
    return (
      <div className="p-6">
        <BulkColumnMapper
          fileName={selectedFile?.name ?? ''}
          fileHeaders={MOCK_CUSTOM_HEADERS}
          sampleData={MOCK_SAMPLE_DATA}
          onConfirm={handleMappingConfirm}
          onBack={() => setStep('form')}
          onDownloadTemplate={downloadBulkTemplate}
          scopeAccountId={uploadAccount.accountId}
        />
        {exitGuardDialog}
      </div>
    );
  }

  if (showAddressBook) {
    return (
      <div className="p-6">
        <AddressBook mode="select" onSelectAddress={handleSelectAddress} onClose={() => setShowAddressBook(false)} />
        {exitGuardDialog}
      </div>
    );
  }

  const accentText = uploadMode === 'same-day' ? 'text-orange-700' : uploadMode === 'on-demand' ? 'text-violet-700' : 'text-blue-700';

  // Suppress TypeScript "unused" warning — sessionTick drives re-render only.
  void sessionTick;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bulk Upload</h1>
          <p className="text-gray-600 mt-1 max-w-2xl">
            Book multiple transactions (up to 1,000) in one go. Download the template, fill in your order details, then upload the file or paste a sheet link.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button variant="outline" onClick={downloadBulkTemplate}>
            <IconDownload className="w-4 h-4 mr-2" />
            Template (CSV)
          </Button>
          <Button variant="outline" onClick={downloadBulkTemplateXls}>
            <IconDownload className="w-4 h-4 mr-2" />
            Template (XLS)
          </Button>
        </div>
      </div>

      {/* Mode toggle */}
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
                  <div className="font-semibold">Standard Upload</div>
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
                  <div className={`text-xs ${uploadMode === 'same-day' ? 'text-orange-100' : 'text-gray-500'}`}>Express same-day processing · background upload</div>
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
                    {onDemandEnabled ? 'Immediate, direct pickup & delivery' : 'Immediate, direct pickup & delivery - Enable in Add-ons'}
                  </div>
                </div>
              </div>
            </button>
          </div>
          {uploadMode === 'same-day' && (
            <p className="text-xs text-orange-700 mt-2 flex items-center gap-1">
              <IconClock className="w-3.5 h-3.5 shrink-0" />
              Same-day uploads process in the background. You can continue using the app and review the results from Recent Uploads once done.
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
            <IconMapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Same-Day and On-Demand deliveries are currently available for Metro Manila locations only.
          </p>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column — sender / schedule / payment */}
        <div className="space-y-6">
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
                    onClick={() => { setFirstMile('pickup'); markTouched(); }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${firstMile === 'pickup' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    <IconTruckDelivery className="w-4 h-4 shrink-0" />
                    Pick-up
                  </button>
                  <button
                    onClick={() => { setFirstMile('dropoff'); markTouched(); }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${firstMile === 'dropoff' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    <IconBuildingStore className="w-4 h-4 shrink-0" />
                    Drop-off
                  </button>
                </div>
              </div>
              {firstMile === 'pickup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Pick-up Date</label>
                  <Input type="date" value={pickupDate} onChange={(e) => { setPickupDate(e.target.value); markTouched(); }} />
                  {isJourneyP2 && uploadMode === 'same-day' ? (
                    <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
                      <p className="text-xs font-medium text-orange-800">
                        Same-Day cutoff has passed. This batch will be scheduled for the next available pickup date.
                      </p>
                      <p className="text-xs text-orange-700 mt-1">
                        Simulated time: {journey.sddCutoff.simulatedNowLabel} · Cutoff: {journey.sddCutoff.cutoffLabel}
                        <span className="mx-1.5 text-orange-300">·</span>
                        Next pickup: <span className="font-medium">{journey.sddCutoff.nextPickupDateLabel}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1.5">
                      {uploadMode === 'same-day'
                        ? 'Same-day cut-off is 10:00 AM. Orders booked after cut-off move to next day.'
                        : 'Pick-ups are scheduled the next business day by default.'}
                    </p>
                  )}
                </div>
              )}
              {firstMile === 'dropoff' && (
                <div>
                  <p className="text-sm text-gray-600">Drop off your parcels at any GoGo Xpress branch. No pick-up scheduling required.</p>
                  <button
                    type="button"
                    onClick={() => setShowDropoffs(true)}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    <IconMapPin className="w-4 h-4" />
                    Check drop-off locations nearby
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <PaymentPreferenceCard />
        </div>

        {/* Right column — upload */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Orders</CardTitle>
              <CardDescription>Paste a sheet link or upload your filled-in template</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* URL option */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sheet / file URL</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <IconLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="url"
                      value={uploadUrl}
                      onChange={(e) => { setUploadUrl(e.target.value); markTouched(); }}
                      placeholder="Google Sheet, CSV, or XLS link"
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <Button
                    disabled={!uploadUrl.trim() || step !== 'form'}
                    onClick={() => (isJourneyP2 ? handleJourneySimulatedUpload() : startUpload('import-from-url.csv'))}
                  >
                    Import
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>

              {/* File option */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => captureFile(e.target.files?.[0])}
              />

              {!selectedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-blue-400 transition-colors cursor-pointer bg-gray-50 hover:bg-blue-50/50"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
                      <IconUpload className="w-7 h-7 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Drop filled-in template here</p>
                      <p className="text-sm text-gray-600">or <span className="text-blue-600 font-medium">browse files</span></p>
                    </div>
                    <p className="text-xs text-gray-500">.xlsx or .csv · up to 1,000 orders · max 10MB</p>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <IconFileSpreadsheet className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">{selectedFile.size} · ready to validate</p>
                    </div>
                    {step === 'form' && (
                      <button onClick={() => setSelectedFile(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Remove file">
                        <IconX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <Button
                    className="w-full mt-4"
                    disabled={step !== 'form'}
                    onClick={() => (isJourneyP2 ? handleJourneySimulatedUpload() : startUpload())}
                  >
                    <IconFileSpreadsheet className="w-4 h-4 mr-2" />
                    Upload &amp; Validate
                  </Button>
                </div>
              )}

              {/* Alternate path — manual entry via the in-app spreadsheet.
                  Lives inside the Upload Orders card; still part of Bulk Booking.
                  Text + button read as one centered CTA group. */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 flex flex-col sm:flex-row items-center justify-center gap-3">
                <p className="text-xs text-gray-500">No file ready? Enter your orders manually.</p>
                <Button variant="outline" className="flex-shrink-0" onClick={() => navigate('/dashboard/bulk-uploader/spreadsheet')}>
                  <IconFileSpreadsheet className="w-4 h-4 mr-1.5" />
                  Use our in-app spreadsheet
                </Button>
              </div>

              <p className={`text-xs ${accentText}`}>
                Mode: {MODE_LABELS[uploadMode]} · First-mile: {firstMile === 'pickup' ? 'Pick-up' : 'Drop-off'}
              </p>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-500">
                  Required columns: {BULK_TEMPLATE_COLUMNS.slice(0, 6).join(', ')}, and more. Use the
                  <span className="font-medium text-gray-600"> Download Template</span> button above for the full template.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Province, City/Municipality, and Barangay must be valid GGX-supported locations.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Uploads */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Uploads</CardTitle>
          <CardDescription>Your recently uploaded batches. Click a row to review or open the batch details.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUploads.map((upload) => {
                const cfg = STATUS_CONFIG[upload.status] ?? STATUS_CONFIG['completed'];
                return (
                  <TableRow
                    key={upload.id}
                    className={`cursor-pointer hover:bg-gray-50 ${upload.status === 'processing' ? 'opacity-70' : ''}`}
                    onClick={() => {
                      if (upload.status === 'processing') return;
                      // Completed batches open the read-only detail page; everything
                      // else opens the editable pre-booking review page.
                      navigate(upload.status === 'completed'
                        ? `/dashboard/bulk-uploader/completed/${upload.id}`
                        : `/dashboard/bulk-uploader/summary/${upload.id}`);
                    }}
                  >
                    <TableCell className="font-medium text-blue-600">{upload.id}</TableCell>
                    <TableCell>{upload.fileName}</TableCell>
                    <TableCell className="text-gray-600">
                      <div className="flex items-center gap-1">
                        <IconClock className="w-3 h-3" />
                        {upload.uploadedAt}
                      </div>
                    </TableCell>
                    <TableCell>{upload.totalRows}</TableCell>
                    <TableCell className="text-green-700 font-medium">{upload.validRows}</TableCell>
                    <TableCell className={upload.errorRows > 0 ? 'text-red-700 font-medium' : 'text-gray-500'}>{upload.errorRows}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        {upload.status === 'processing' && (
                          <span className="text-xs text-gray-500">Processing in background…</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Drop-off locations dialog */}
      <Dialog open={showDropoffs} onClose={() => setShowDropoffs(false)} size="md" title="Drop-off locations">
        <p className="text-sm text-gray-500 mb-4">Bring your parcels to any of these GoGo Xpress branches.</p>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {DROPOFF_LOCATIONS.map((loc) => (
            <div key={loc.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <IconMapPin className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{loc.name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{loc.address}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><IconPhone className="w-3 h-3" />{loc.contact}</span>
                    <span className="inline-flex items-center gap-1"><IconClock className="w-3 h-3" />{loc.hours}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-4">
          <Button variant="outline" size="sm" onClick={() => setShowDropoffs(false)}>Close</Button>
        </div>
      </Dialog>

      {/* P2 UX Journey — simulated outcome. Journey-local only: no upload record
          is created and nothing is added to Recent Uploads. */}
      <Dialog
        open={journeySimResult}
        onClose={() => setJourneySimResult(false)}
        size="sm"
        title="Batch scheduled (UX Journey preview)"
      >
        <p className="text-sm text-gray-600">
          {journey.sddCutoff.simulatedNowLabel} is past the Same-Day cutoff ({journey.sddCutoff.cutoffLabel}), so this
          batch is scheduled for the next available pickup date instead of today.
        </p>
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
          <p className="text-sm font-medium text-orange-900">
            Next pickup: {journey.sddCutoff.nextPickupDateLabel}
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          This is a proposed UX preview — no orders were created and nothing was added to Recent Uploads.
        </p>
        <div className="flex justify-end pt-4">
          <Button size="sm" onClick={() => setJourneySimResult(false)}>Done</Button>
        </div>
      </Dialog>

      {/* Fast processing modal */}
      <Dialog open={step === 'fast-processing'} onClose={() => {}} size="sm">
        <div className="text-center py-2 space-y-4">
          <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">Uploading Orders</h3>
          <div className="w-16 h-16 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-600">Please wait while we upload your orders…</p>
        </div>
      </Dialog>

      {/* Background processing modal */}
      <Dialog open={step === 'background-processing'} onClose={() => {}} size="sm">
        <div className="text-center py-2 space-y-4">
          <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide">Processing Upload</h3>
          {/* Illustration approximated with Tabler icons */}
          <div className="relative w-20 h-20 mx-auto">
            <div className="w-14 h-16 bg-blue-100 rounded-lg border-2 border-blue-200 mx-auto mt-1" />
            <div className="w-12 h-14 bg-yellow-100 rounded-lg border-2 border-yellow-200 absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 -z-10" />
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
              <IconArrowUp className="w-4 h-4 text-white" />
            </div>
          </div>
          <p className="text-sm text-gray-600 max-w-xs mx-auto">
            Your orders are being processed. We&apos;ll notify you immediately when the upload is complete.
          </p>
          <Button className="w-full" onClick={handleBackgroundAck}>
            Okay, got it!
          </Button>
        </div>
      </Dialog>

      {/* Exit protection — in-app navigation away from an in-progress upload */}
      {exitGuardDialog}
    </div>
  );
}
