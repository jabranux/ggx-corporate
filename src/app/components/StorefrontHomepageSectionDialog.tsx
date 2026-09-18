import { useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import type { Collection, HomepageSectionInput, HomepageSectionType } from '../services/storefrontService';

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
);

/**
 * Add a homepage section — either pointing at one of the account's
 * collections, or "New Arrivals" (computed server-side from the newest
 * active products; never merchant-curated, never references a collection —
 * see docs/commerce/COMMERCE_IMPLEMENTATION_CHECKPOINT.md's settled UX
 * decision). Sections are edit-title/enabled-only after creation (the
 * server doesn't support changing `sectionType`/`collectionId` post-create),
 * so this dialog only covers creation; ordering/enabling happens inline on
 * the Storefront page.
 */
export function StorefrontHomepageSectionDialog({
  open,
  collections,
  hasNewArrivals,
  onClose,
  onSubmit,
}: {
  open: boolean;
  collections: Collection[];
  /** Whether a New Arrivals section already exists (only one is meaningful). */
  hasNewArrivals: boolean;
  onClose: () => void;
  onSubmit: (input: HomepageSectionInput) => void;
}) {
  const [sectionType, setSectionType] = useState<HomepageSectionType>(hasNewArrivals || collections.length === 0 ? 'new_arrivals' : 'collection');
  const [collectionId, setCollectionId] = useState<string>(collections[0]?.id ?? '');
  const [title, setTitle] = useState('');

  const effectiveTitle = title.trim() || (sectionType === 'new_arrivals' ? 'New Arrivals' : collections.find((c) => c.id === collectionId)?.name ?? '');
  const canSubmit = sectionType === 'new_arrivals' ? !hasNewArrivals : !!collectionId;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: effectiveTitle || 'Untitled section',
      sectionType,
      collectionId: sectionType === 'collection' ? collectionId : undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add homepage section" size="md">
      <div className="space-y-4">
        <div>
          <Label>Section type</Label>
          <Select value={sectionType} onChange={(e) => setSectionType(e.target.value as HomepageSectionType)}>
            <option value="collection" disabled={collections.length === 0}>Collection</option>
            <option value="new_arrivals" disabled={hasNewArrivals}>New Arrivals (automatic)</option>
          </Select>
          {sectionType === 'new_arrivals' && (
            <p className="text-xs text-gray-400 mt-1">
              Shows your newest active products automatically — nothing to curate here.
              {hasNewArrivals && ' A New Arrivals section already exists.'}
            </p>
          )}
          {sectionType === 'collection' && collections.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">Create a collection first to add a collection section.</p>
          )}
        </div>

        {sectionType === 'collection' && (
          <div>
            <Label>Collection</Label>
            <Select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}

        <div>
          <Label>Section title (optional)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={sectionType === 'new_arrivals' ? 'New Arrivals' : 'Section title shown to customers'} />
        </div>
      </div>

      <div className="flex gap-2.5 justify-end pt-4 mt-4 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>Add section</Button>
      </div>
    </Dialog>
  );
}
