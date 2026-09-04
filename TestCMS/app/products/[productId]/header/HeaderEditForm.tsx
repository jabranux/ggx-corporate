'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateHeaderAction } from '@/app/products/actions';
import type { Header, NavItem } from '@/lib/store';

export default function HeaderEditForm({
  productId,
  header,
}: {
  productId: string;
  header: Header;
}) {
  const [siteName, setSiteName] = useState(header.siteName);
  const [navigation, setNavigation] = useState<NavItem[]>(header.navigation);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(true);
  const router = useRouter();

  const update = (fn: (items: NavItem[]) => NavItem[]) => {
    setNavigation((items) => fn(items));
    setSaved(false);
  };

  const addItem = () => update((items) => [...items, { label: '', url: '' }]);
  const removeItem = (index: number) =>
    update((items) => items.filter((_, i) => i !== index));
  const editItem = (index: number, field: keyof NavItem, value: string) =>
    update((items) =>
      items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  const moveItem = (index: number, direction: -1 | 1) =>
    update((items) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const handleSave = () => {
    startTransition(async () => {
      await updateHeaderAction(productId, { siteName, navigation });
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        Site / app name
      </label>
      <input
        value={siteName}
        onChange={(e) => {
          setSiteName(e.target.value);
          setSaved(false);
        }}
        style={{ width: '100%', marginBottom: 20 }}
      />

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Navigation</h2>
      {navigation.length === 0 && (
        <p style={{ fontSize: 13, color: '#888' }}>No navigation items yet.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {navigation.map((item, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              border: '1px solid #e5e5e5',
              borderRadius: 8,
              padding: 8,
            }}
          >
            <input
              placeholder="Label (e.g. About Us)"
              value={item.label}
              onChange={(e) => editItem(index, 'label', e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              placeholder="URL / path (e.g. /about-us)"
              value={item.url}
              onChange={(e) => editItem(index, 'url', e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => moveItem(index, -1)}
              disabled={index === 0}
              title="Move up"
              style={{ padding: '6px 10px' }}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveItem(index, 1)}
              disabled={index === navigation.length - 1}
              title="Move down"
              style={{ padding: '6px 10px' }}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => removeItem(index)}
              style={{ padding: '6px 10px', background: '#fff', color: '#c0392b', border: '1px solid #c0392b' }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addItem} style={{ marginTop: 12, marginLeft: 0 }}>
        + Add navigation item
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24 }}>
        <button type="button" onClick={handleSave} disabled={isPending || !siteName.trim()}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !isPending && (
          <span style={{ fontSize: 13, color: '#2a8a2a' }}>Saved</span>
        )}
      </div>
    </div>
  );
}
