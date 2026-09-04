'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useState, type CSSProperties } from 'react';

type Props = {
  value: string;
  onChange: (html: string) => void;
};

export default function RichTextEditor({ value, onChange }: Props) {
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'rte-content',
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // Only re-sync when the external value changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return null;

  const openLinkPanel = () => {
    setLinkUrl((editor.getAttributes('link').href as string | undefined) || 'https://');
    setLinkPanelOpen(true);
  };

  const applyLink = () => {
    if (linkUrl.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
    }
    setLinkPanelOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkPanelOpen(false);
  };

  const btn = (active: boolean): CSSProperties => ({
    padding: '6px 10px',
    border: '1px solid #ccc',
    borderRadius: 6,
    background: active ? '#1a1a1a' : '#fff',
    color: active ? '#fff' : '#1a1a1a',
    fontSize: 13,
    cursor: 'pointer',
  });

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 8 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: 8,
          borderBottom: '1px solid #e5e5e5',
          background: '#fafafa',
        }}
      >
        <button
          type="button"
          style={btn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          style={btn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          style={btn(editor.isActive('paragraph'))}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          Paragraph
        </button>
        <button
          type="button"
          style={btn(editor.isActive('heading', { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          type="button"
          style={btn(editor.isActive('heading', { level: 3 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </button>
        <button
          type="button"
          style={btn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Bulleted list
        </button>
        <button
          type="button"
          style={btn(editor.isActive('orderedList'))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          Numbered list
        </button>
        <button
          type="button"
          style={btn(editor.isActive('link') || linkPanelOpen)}
          onClick={() => (linkPanelOpen ? setLinkPanelOpen(false) : openLinkPanel())}
        >
          Link
        </button>
      </div>

      {linkPanelOpen && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            padding: 8,
            borderBottom: '1px solid #e5e5e5',
            background: '#fafafa',
          }}
        >
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
            }}
            placeholder="https://example.com"
            style={{ flex: 1 }}
          />
          <button type="button" onClick={applyLink} style={btn(false)}>
            Apply
          </button>
          {editor.isActive('link') && (
            <button type="button" onClick={removeLink} style={btn(false)}>
              Remove link
            </button>
          )}
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
