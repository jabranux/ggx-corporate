import { useRef, useState } from 'react';
import { IconUpload, IconLoader2, IconPhoto } from '@tabler/icons-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { Select } from './ui/Select';
import { Switch } from './ui/Switch';
import { PRODUCT_CATEGORIES, type InventoryProduct } from '../services/inventoryService';
import {
  requestStorefrontBannerUpload, uploadToPresignedUrl,
  type Collection, type HeroBanner, type HeroBannerCtaType, type HeroBannerInput, type HeroBannerPatch,
} from '../services/storefrontService';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
);

type UploadedImage = { r2ObjectKey: string; url: string };

const CTA_OPTIONS: { value: '' | HeroBannerCtaType; label: string }[] = [
  { value: '', label: 'No call to action' },
  { value: 'product', label: 'Product' },
  { value: 'collection', label: 'Collection' },
  { value: 'category', label: 'Category' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'external_url', label: 'External URL' },
];

function ImageUploader({
  label, previewUrl, uploading, disabled, disabledHint, onPick,
}: {
  label: string;
  previewUrl: string | null;
  uploading: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onPick: (files: FileList | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <Label>{label}</Label>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { onPick(e.target.files); if (fileRef.current) fileRef.current.value = ''; }}
      />
      <div className="flex items-center gap-3">
        <div className="w-24 h-14 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
          {previewUrl
            ? <img src={previewUrl} alt="" className="w-full h-full object-cover" />
            : <IconPhoto className="w-5 h-5 text-gray-300" />}
        </div>
        {disabled ? (
          <p className="text-xs text-gray-400">{disabledHint}</p>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconUpload className="w-4 h-4" />}
            {previewUrl ? 'Replace' : 'Upload'}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Create or edit a hero banner. The backend only accepts images at CREATE
 * time (`updateHeroBanner` has no image-replacement columns — see
 * `api/_lib/commerceStorefront.ts`), so edit mode shows the existing images
 * read-only; to change a banner's image, delete and recreate it.
 */
export function StorefrontBannerDialog({
  open,
  banner,
  scopeId,
  products,
  collections,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  /** Omit to create a new banner. */
  banner?: HeroBanner;
  scopeId: string;
  products: InventoryProduct[];
  collections: Collection[];
  onClose: () => void;
  onCreate: (input: HeroBannerInput) => void;
  onUpdate: (patch: HeroBannerPatch) => void;
}) {
  const isEdit = !!banner;
  const [headline, setHeadline] = useState(banner?.headline ?? '');
  const [supportingText, setSupportingText] = useState(banner?.supportingText ?? '');
  const [ctaLabel, setCtaLabel] = useState(banner?.ctaLabel ?? '');
  const [ctaType, setCtaType] = useState<'' | HeroBannerCtaType>(banner?.ctaType ?? '');
  const [ctaTargetId, setCtaTargetId] = useState(banner?.ctaTargetId ?? '');
  const [ctaExternalUrl, setCtaExternalUrl] = useState(banner?.ctaExternalUrl ?? '');
  const [enabled, setEnabled] = useState(banner?.enabled ?? true);
  const [startDate, setStartDate] = useState(banner?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(banner?.endDate?.slice(0, 10) ?? '');

  const [desktopUpload, setDesktopUpload] = useState<UploadedImage | null>(null);
  const [mobileUpload, setMobileUpload] = useState<UploadedImage | null>(null);
  const [uploadingDesktop, setUploadingDesktop] = useState(false);
  const [uploadingMobile, setUploadingMobile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.has(file.type)) return 'Use a JPG, PNG, or WebP image.';
    if (file.size > MAX_BYTES) return 'Image must be 10 MB or smaller.';
    return null;
  };

  const pickDesktop = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) return setError(err);
    setError(null);
    setUploadingDesktop(true);
    try {
      const presigned = await requestStorefrontBannerUpload(scopeId, file.type);
      await uploadToPresignedUrl(presigned.uploadUrl, file);
      setDesktopUpload({ r2ObjectKey: presigned.objectKey, url: presigned.publicUrl });
    } catch (err2) {
      setError(err2 instanceof Error ? err2.message : 'Image upload failed. Please try again.');
    } finally {
      setUploadingDesktop(false);
    }
  };

  const pickMobile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) return setError(err);
    setError(null);
    setUploadingMobile(true);
    try {
      const presigned = await requestStorefrontBannerUpload(scopeId, file.type);
      await uploadToPresignedUrl(presigned.uploadUrl, file);
      setMobileUpload({ r2ObjectKey: presigned.objectKey, url: presigned.publicUrl });
    } catch (err2) {
      setError(err2 instanceof Error ? err2.message : 'Image upload failed. Please try again.');
    } finally {
      setUploadingMobile(false);
    }
  };

  const ctaNeedsTarget = ctaType === 'product' || ctaType === 'collection' || ctaType === 'promotion' || ctaType === 'category';
  const ctaValid =
    !ctaType
      ? true
      : ctaType === 'external_url'
        ? /^https:\/\//i.test(ctaExternalUrl.trim())
        : ctaNeedsTarget
          ? !!ctaTargetId.trim()
          : true;

  const canSubmit =
    !!headline.trim() &&
    ctaValid &&
    (isEdit || !!desktopUpload) &&
    !uploadingDesktop && !uploadingMobile;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const shared = {
      headline: headline.trim(),
      supportingText: supportingText.trim() || null,
      ctaLabel: ctaLabel.trim() || null,
      ctaType: ctaType || null,
      ctaTargetId: ctaType === 'product' || ctaType === 'collection' || ctaType === 'promotion' ? ctaTargetId || null : ctaType === 'category' ? ctaTargetId || null : null,
      ctaExternalUrl: ctaType === 'external_url' ? ctaExternalUrl.trim() : null,
      enabled,
      startDate: startDate || null,
      endDate: endDate || null,
    };
    if (isEdit) {
      onUpdate(shared);
    } else if (desktopUpload) {
      onCreate({ ...shared, desktopImage: desktopUpload, mobileImage: mobileUpload });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? 'Edit hero banner' : 'New hero banner'} size="lg">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        {isEdit ? (
          <div className="grid grid-cols-2 gap-3">
            <ImageUploader label="Desktop image" previewUrl={banner!.desktopImageUrl} uploading={false} disabled disabledHint="Delete and recreate to change the image." onPick={() => {}} />
            <ImageUploader label="Mobile image" previewUrl={banner!.mobileImageUrl} uploading={false} disabled disabledHint="Delete and recreate to change the image." onPick={() => {}} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <ImageUploader label="Desktop image (required)" previewUrl={desktopUpload?.url ?? null} uploading={uploadingDesktop} onPick={pickDesktop} />
            <ImageUploader label="Mobile image (optional)" previewUrl={mobileUpload?.url ?? null} uploading={uploadingMobile} onPick={pickMobile} />
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}

        <div>
          <Label>Headline</Label>
          <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Weekend Sale — up to 30% off" />
        </div>

        <div>
          <Label>Supporting text (optional)</Label>
          <Textarea value={supportingText} onChange={(e) => setSupportingText(e.target.value)} rows={2} placeholder="Short line shown under the headline" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Call to action</Label>
            <Select value={ctaType} onChange={(e) => { setCtaType(e.target.value as '' | HeroBannerCtaType); setCtaTargetId(''); }}>
              {CTA_OPTIONS.map((o) => <option key={o.value || 'none'} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div>
            <Label>Button label (optional)</Label>
            <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="e.g. Shop now" disabled={!ctaType} />
          </div>
        </div>

        {ctaType === 'product' && (
          <div>
            <Label>Target product</Label>
            <Select value={ctaTargetId} onChange={(e) => setCtaTargetId(e.target.value)}>
              <option value="">Select a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        )}
        {ctaType === 'collection' && (
          <div>
            <Label>Target collection</Label>
            <Select value={ctaTargetId} onChange={(e) => setCtaTargetId(e.target.value)}>
              <option value="">Select a collection…</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}
        {ctaType === 'category' && (
          <div>
            <Label>Target category</Label>
            <Select value={ctaTargetId} onChange={(e) => setCtaTargetId(e.target.value)}>
              <option value="">Select a category…</option>
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        )}
        {ctaType === 'promotion' && (
          <div>
            <Label>Promotion ID</Label>
            <Input value={ctaTargetId} onChange={(e) => setCtaTargetId(e.target.value)} placeholder="Promotion id" />
            <p className="text-xs text-gray-400 mt-1">Promotions management UI isn't built yet — paste an id from the backend for now.</p>
          </div>
        )}
        {ctaType === 'external_url' && (
          <div>
            <Label>External URL</Label>
            <Input value={ctaExternalUrl} onChange={(e) => setCtaExternalUrl(e.target.value)} placeholder="https://..." />
            {!ctaValid && <p className="text-xs text-red-600 mt-1">Must be an https:// link.</p>}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Start date (optional)</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>End date (optional)</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-900">Enabled</p>
            <p className="text-xs text-gray-500">Disabled banners are hidden from the storefront without deleting them.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <div className="flex gap-2.5 justify-end pt-4 mt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>{isEdit ? 'Save changes' : 'Create banner'}</Button>
      </div>
    </Dialog>
  );
}
