'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import RichTextEditor from '@/app/components/RichTextEditor';
import { updatePageAction } from '@/app/products/actions';
import type { Page } from '@/lib/store';

export default function PageEditForm({
  productId,
  page,
}: {
  productId: string;
  page: Page;
}) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [saved, setSaved] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const previewSlug =
    title.trim() === page.title ? page.slug : undefined;

  const handleSave = () => {
    startTransition(async () => {
      await updatePageAction(productId, page.id, { title, content });
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        Title (page H1)
      </label>
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setSaved(false);
        }}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <p style={{ fontSize: 12, color: '#888', marginTop: 0 }}>
        Current slug: <code>/{page.slug}</code>
        {!previewSlug && ' — will regenerate from the new title on save'}
      </p>

      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, margin: '16px 0 6px' }}>
        Content
      </label>
      <RichTextEditor
        value={content}
        onChange={(html) => {
          setContent(html);
          setSaved(false);
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={handleSave} disabled={isPending || !title.trim()}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {previewSlug && (
          <a
            href={`/products/${productId}/pages/${page.id}/preview`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 13 }}
          >
            Preview saved page &rarr;
          </a>
        )}
        {saved && !isPending && (
          <span style={{ fontSize: 13, color: '#2a8a2a' }}>Saved</span>
        )}
      </div>
    </div>
  );
}
