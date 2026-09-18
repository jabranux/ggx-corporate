import { useRef, useState } from 'react';
import { IconUpload, IconLoader2, IconX, IconBuildingStore } from '@tabler/icons-react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { cn } from '../lib/utils';
import { STOREFRONT_DELIVERY_OPTIONS, getServiceTypeLabel, type ServiceTypeKey } from '../data/serviceTypes';
import {
  requestStorefrontLogoUpload, uploadToPresignedUrl, setStorefrontLogo, removeStorefrontLogo,
  type StorefrontProfile, type StorefrontProfileInput,
} from '../services/storefrontService';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
);

/** Slugify free text into a URL-safe store slug. */
function slugify(v: string): string {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const DEFAULT_ACCENT = '#1A73E8';
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

interface SocialForm {
  facebook: string;
  instagram: string;
  tiktok: string;
  website: string;
}

/**
 * Edit the storefront profile — name, description, public slug, contact,
 * delivery options, logo, accent color, and social links. Logo upload
 * applies immediately against the backend (real R2 presigned upload — mint
 * URL -> PUT bytes -> attach, same flow as `ProductImageGallery`); the rest
 * of the fields save together on "Save changes".
 */
export function StorefrontProfileDialog({
  open,
  profile,
  scopeId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  profile: StorefrontProfile;
  scopeId: string;
  onClose: () => void;
  onSubmit: (patch: StorefrontProfileInput) => void;
}) {
  const [form, setForm] = useState({
    storeName: profile.storeName,
    description: profile.description,
    slug: profile.slug,
    contactEmail: profile.contactEmail,
    contactNumber: profile.contactNumber,
    deliveryOptions: [...profile.deliveryOptions],
    accentColor: profile.accentColor ?? '',
  });
  const [social, setSocial] = useState<SocialForm>({
    facebook: profile.social.facebook ?? '',
    instagram: profile.social.instagram ?? '',
    tiktok: profile.social.tiktok ?? '',
    website: profile.social.website ?? '',
  });

  const [logoUrl, setLogoUrl] = useState<string | null>(profile.logoUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));
  const setSocialField = <K extends keyof SocialForm>(k: K, v: string) =>
    setSocial((prev) => ({ ...prev, [k]: v }));

  const toggleDelivery = (key: ServiceTypeKey) =>
    setForm((prev) => ({
      ...prev,
      deliveryOptions: prev.deliveryOptions.includes(key)
        ? prev.deliveryOptions.filter((d) => d !== key)
        : [...prev.deliveryOptions, key],
    }));

  const accentValid = form.accentColor.trim().length === 0 || HEX_RE.test(form.accentColor.trim());
  const canSubmit = form.storeName.trim().length > 0 && form.slug.trim().length > 0 && accentValid;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      ...form,
      storeName: form.storeName.trim(),
      slug: slugify(form.slug),
      accentColor: form.accentColor.trim() ? form.accentColor.trim() : null,
      social: {
        facebook: social.facebook.trim() || null,
        instagram: social.instagram.trim() || null,
        tiktok: social.tiktok.trim() || null,
        website: social.website.trim() || null,
      },
    });
  };

  const handleLogoUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setLogoError(null);
    if (!ACCEPTED_TYPES.has(file.type)) {
      setLogoError('Use a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setLogoError('Logo must be 10 MB or smaller.');
      return;
    }
    setUploadingLogo(true);
    try {
      const presigned = await requestStorefrontLogoUpload(scopeId, file.type);
      await uploadToPresignedUrl(presigned.uploadUrl, file);
      const updated = await setStorefrontLogo(scopeId, { r2ObjectKey: presigned.objectKey, url: presigned.publicUrl });
      setLogoUrl(updated.logoUrl);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Logo upload failed. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    setLogoError(null);
    setUploadingLogo(true);
    try {
      const updated = await removeStorefrontLogo(scopeId);
      setLogoUrl(updated.logoUrl);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Could not remove the logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Edit store profile" size="lg">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        {/* Logo */}
        <div>
          <Label>Store logo</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { handleLogoUpload(e.target.files); if (fileRef.current) fileRef.current.value = ''; }}
          />
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoUrl
                ? <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                : <IconBuildingStore className="w-6 h-6 text-gray-300" />}
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={uploadingLogo} onClick={() => fileRef.current?.click()}>
                {uploadingLogo ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconUpload className="w-4 h-4" />}
                {logoUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
              {logoUrl && (
                <Button type="button" size="sm" variant="outline" disabled={uploadingLogo} onClick={handleRemoveLogo}>
                  <IconX className="w-4 h-4" /> Remove
                </Button>
              )}
            </div>
          </div>
          {logoError && <p className="text-xs text-red-600 mt-1.5">{logoError}</p>}
        </div>

        <div>
          <Label>Store name</Label>
          <Input value={form.storeName} onChange={(e) => set('storeName', e.target.value)} placeholder="e.g. Acme Luzon Shop" />
        </div>

        <div>
          <Label>Description</Label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            placeholder="Short description shown to customers"
            className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Store URL</Label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-400">gogoxpress.shop/</span>
              <Input
                value={form.slug}
                onChange={(e) => set('slug', e.target.value)}
                onBlur={() => set('slug', slugify(form.slug))}
                placeholder="store-slug"
              />
            </div>
          </div>
          <div>
            <Label>Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={HEX_RE.test(form.accentColor) ? form.accentColor : DEFAULT_ACCENT}
                onChange={(e) => set('accentColor', e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer flex-shrink-0"
              />
              <Input
                value={form.accentColor}
                onChange={(e) => set('accentColor', e.target.value)}
                placeholder="#1A73E8"
              />
            </div>
            {!accentValid && <p className="text-xs text-red-600 mt-1">Accent color must be a hex color like #1A73E8.</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Contact email</Label>
            <Input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} placeholder="shop@example.com" />
          </div>
          <div>
            <Label>Contact number</Label>
            <Input value={form.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} placeholder="+63 9xx xxx xxxx" />
          </div>
        </div>

        <div>
          <Label>Delivery options offered</Label>
          <div className="flex flex-wrap gap-2">
            {STOREFRONT_DELIVERY_OPTIONS.map((key) => {
              const selected = form.deliveryOptions.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDelivery(key)}
                  className={cn(
                    'px-3 py-1.5 rounded-full border text-sm font-medium transition-colors cursor-pointer',
                    selected
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {getServiceTypeLabel(key)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Social links</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={social.facebook} onChange={(e) => setSocialField('facebook', e.target.value)} placeholder="Facebook URL" />
            <Input value={social.instagram} onChange={(e) => setSocialField('instagram', e.target.value)} placeholder="Instagram URL" />
            <Input value={social.tiktok} onChange={(e) => setSocialField('tiktok', e.target.value)} placeholder="TikTok URL" />
            <Input value={social.website} onChange={(e) => setSocialField('website', e.target.value)} placeholder="Website URL" />
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 justify-end pt-4 mt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>Save changes</Button>
      </div>
    </Dialog>
  );
}
