import { useEffect, useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Switch } from './ui/Switch';
import { getSkuSettings, updateSkuSettings, type SkuSettings } from '../services/inventoryService';

/**
 * Account-level SKU generation settings (`commerce_sku_settings`) — shared by
 * the Inventory toolbar ("SKU settings" dialog) and read-only-summarized
 * inside `ProductFormDialog`. Auto-generate uses `{prefix}-{next 6-digit
 * sequence}`; changing the prefix only affects FUTURE allocations, existing
 * SKUs are never renamed (server-enforced — see `commerceProducts.ts`).
 */
export function SkuSettingsPanel({
  scopeId,
  onSaved,
}: {
  scopeId: string;
  onSaved?: (settings: SkuSettings) => void;
}) {
  const [settings, setSettings] = useState<SkuSettings | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getSkuSettings(scopeId)
      .then((s) => {
        if (!active) return;
        setSettings(s);
        setAutoGenerate(s.autoGenerate);
        setPrefix(s.prefix);
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Could not load SKU settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scopeId]);

  const prefixValid = !prefix || /^[A-Za-z0-9]{1,12}$/.test(prefix);

  const handleSave = async () => {
    if (!prefixValid) return;
    setSaving(true);
    setError(null);
    try {
      const next = await updateSkuSettings(scopeId, { autoGenerate, prefix: prefix.toUpperCase() });
      setSettings(next);
      setPrefix(next.prefix);
      onSaved?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save SKU settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500 py-4">Loading SKU settings…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Auto-generated SKUs follow <code className="text-xs bg-gray-100 rounded px-1 py-0.5">PREFIX-000001</code>.
        You can still enter a manual SKU on any product — auto-generate only fills in the ones left blank.
      </p>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3.5 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900">Auto-generate SKUs</p>
          <p className="text-xs text-gray-500 mt-0.5">Fill in a SKU automatically when a product is created without one.</p>
        </div>
        <Switch checked={autoGenerate} onCheckedChange={setAutoGenerate} aria-label="Auto-generate SKUs" />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Prefix</label>
        <Input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          placeholder="e.g. COF"
          maxLength={12}
        />
        {!prefixValid && <p className="text-xs text-red-600 mt-1">1–12 letters or numbers only.</p>}
        {settings && (
          <p className="text-xs text-gray-400 mt-1.5">
            Next allocation: <span className="font-medium text-gray-600">{(prefix || settings.prefix) || 'PREFIX'}-{String(settings.nextSequence).padStart(6, '0')}</span>.
            Changing the prefix only affects new SKUs — existing ones are never renamed.
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 text-sm text-red-700">
          <IconAlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving || !prefixValid}>
          {saving ? 'Saving…' : 'Save SKU settings'}
        </Button>
      </div>
    </div>
  );
}
