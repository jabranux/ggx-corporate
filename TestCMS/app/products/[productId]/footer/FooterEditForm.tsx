'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import RichTextEditor from '@/app/components/RichTextEditor';
import { updateFooterAction } from '@/app/products/actions';
import type { Footer } from '@/lib/store';

export default function FooterEditForm({
  productId,
  footer,
}: {
  productId: string;
  footer: Footer;
}) {
  const [content, setContent] = useState(footer.content);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(true);
  const router = useRouter();

  const handleSave = () => {
    startTransition(async () => {
      await updateFooterAction(productId, { content });
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div>
      <RichTextEditor
        value={content}
        onChange={(html) => {
          setContent(html);
          setSaved(false);
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !isPending && (
          <span style={{ fontSize: 13, color: '#2a8a2a' }}>Saved</span>
        )}
      </div>
    </div>
  );
}
