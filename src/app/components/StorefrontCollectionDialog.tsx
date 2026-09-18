import { useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { Select } from './ui/Select';
import { Switch } from './ui/Switch';
import type { Collection, CollectionInput, CollectionType } from '../services/storefrontService';

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
);

const TYPE_OPTIONS: { value: CollectionType; label: string; hint: string }[] = [
  { value: 'custom', label: 'Custom', hint: 'A general merchandising group you curate.' },
  { value: 'featured', label: 'Featured', hint: 'Highlighted products, e.g. a homepage spotlight.' },
  { value: 'sale', label: 'Sale', hint: 'Discounted or promotional items.' },
];

/**
 * Create or edit a collection's own fields (name, description, type,
 * visibility). Product membership is managed separately via
 * `ProductPickerDialog` from the Storefront page — kept apart so this dialog
 * stays a short, focused form. `type: 'featured'|'sale'` are just collections
 * with a different type, not a separate concept (see the Commerce checkpoint).
 */
export function StorefrontCollectionDialog({
  open,
  collection,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** Omit to create a new collection. */
  collection?: Collection;
  onClose: () => void;
  onSubmit: (input: CollectionInput) => void;
}) {
  const [form, setForm] = useState<CollectionInput>({
    name: collection?.name ?? '',
    description: collection?.description ?? '',
    type: collection?.type ?? 'custom',
    visible: collection?.visible ?? true,
  });

  const set = <K extends keyof CollectionInput>(k: K, v: CollectionInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const canSubmit = !!form.name?.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ ...form, name: form.name.trim() });
  };

  return (
    <Dialog open={open} onClose={onClose} title={collection ? 'Edit collection' : 'New collection'} size="md">
      <div className="space-y-4">
        <div>
          <Label>Collection name</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Best Sellers" />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            placeholder="Short description shown to customers (optional)"
          />
        </div>

        <div>
          <Label>Type</Label>
          <Select value={form.type} onChange={(e) => set('type', e.target.value as CollectionType)} disabled={!!collection}>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <p className="text-xs text-gray-400 mt-1">
            {TYPE_OPTIONS.find((o) => o.value === form.type)?.hint}
            {collection ? ' Type can’t be changed after creation.' : ''}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-gray-900">Visible on storefront</p>
            <p className="text-xs text-gray-500">Hide to keep this collection in draft without deleting it.</p>
          </div>
          <Switch checked={!!form.visible} onCheckedChange={(v) => set('visible', v)} />
        </div>
      </div>

      <div className="flex gap-2.5 justify-end pt-4 mt-4 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>{collection ? 'Save changes' : 'Create collection'}</Button>
      </div>
    </Dialog>
  );
}
