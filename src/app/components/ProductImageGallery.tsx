import { useRef, useState } from 'react';
import {
  IconPhoto, IconStar, IconStarFilled, IconX, IconUpload, IconChevronLeft, IconChevronRight, IconLoader2,
} from '@tabler/icons-react';
import { cn } from '../lib/utils';
import {
  requestProductImageUpload, uploadToPresignedUrl, attachProductImage, removeProductImage,
  reorderProductImages, setCoverImage, type InventoryProductDetail,
} from '../services/inventoryService';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024; // mirrors the server's advisory 10 MB ceiling (commerceStorage.ts)

/**
 * Multi-image gallery for an existing product — real R2 presigned upload
 * (mint URL -> PUT bytes to R2 -> attach the resulting key/url to the
 * product), cover selection, reordering, and removal. Every action here
 * applies immediately against the backend (the product already exists by
 * the time this renders — see `ProductFormDialog`'s two-step create flow).
 */
export function ProductImageGallery({
  product,
  scopeId,
  onChanged,
}: {
  product: InventoryProductDetail;
  scopeId: string;
  onChanged: (updated: InventoryProductDetail) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyGallery = (gallery: InventoryProductDetail['gallery']) => {
    const cover = gallery.find((i) => i.isCover) ?? gallery[0];
    onChanged({
      ...product,
      gallery,
      images: gallery.map((i) => i.url),
      coverImageUrl: cover?.url ?? null,
    });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!ACCEPTED_TYPES.has(file.type)) {
          setError(`"${file.name}" isn't a supported image type (use JPG, PNG, or WebP).`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(`"${file.name}" is larger than 10 MB.`);
          continue;
        }
        const presigned = await requestProductImageUpload(scopeId, file.type, product.id);
        await uploadToPresignedUrl(presigned.uploadUrl, file);
        const gallery = await attachProductImage(product.id, { r2ObjectKey: presigned.objectKey, url: presigned.publicUrl }, scopeId);
        applyGallery(gallery);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (imageId: string) => {
    setBusyId(imageId);
    setError(null);
    try {
      await removeProductImage(product.id, imageId, scopeId);
      applyGallery(product.gallery.filter((i) => i.id !== imageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that photo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSetCover = async (imageId: string) => {
    setBusyId(imageId);
    setError(null);
    try {
      const gallery = await setCoverImage(product.id, imageId, scopeId);
      applyGallery(gallery);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the cover photo.');
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, delta: -1 | 1) => {
    const next = index + delta;
    if (next < 0 || next >= product.gallery.length) return;
    const reordered = [...product.gallery];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    const orderedImageIds = reordered.map((i) => i.id);
    setBusyId(reordered[next].id);
    setError(null);
    try {
      const gallery = await reorderProductImages(product.id, orderedImageIds, scopeId);
      applyGallery(gallery);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder photos.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ''; }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors py-4 flex flex-col items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? <IconLoader2 className="w-5 h-5 text-gray-400 animate-spin" /> : <IconUpload className="w-5 h-5 text-gray-400" />}
        <span className="text-sm font-medium text-gray-600">{uploading ? 'Uploading…' : 'Upload photos'}</span>
        <span className="text-xs text-gray-400">JPG, PNG, or WebP, up to 10 MB each</span>
      </button>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {product.gallery.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 mt-3">
          {product.gallery.map((img, index) => (
            <div
              key={img.id}
              className={cn(
                'relative group rounded-lg overflow-hidden border',
                img.isCover ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200',
                busyId === img.id && 'opacity-60',
              )}
            >
              <img src={img.url} alt="" className="w-full aspect-square object-cover" />
              {img.isCover && (
                <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-blue-600 text-white text-[10px] px-1 py-0.5">
                  <IconStarFilled className="w-2.5 h-2.5" /> Cover
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity px-0.5">
                <button type="button" title="Move left" disabled={index === 0} onClick={() => move(index, -1)} className="p-1 text-white hover:text-blue-200 disabled:opacity-30 disabled:cursor-not-allowed">
                  <IconChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Set as cover" disabled={img.isCover} onClick={() => handleSetCover(img.id)} className="p-1 text-white hover:text-blue-200 disabled:opacity-30 disabled:cursor-not-allowed">
                  <IconStar className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Remove" onClick={() => handleRemove(img.id)} className="p-1 text-white hover:text-red-300">
                  <IconX className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Move right" disabled={index === product.gallery.length - 1} onClick={() => move(index, 1)} className="p-1 text-white hover:text-blue-200 disabled:opacity-30 disabled:cursor-not-allowed">
                  <IconChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
        <IconPhoto className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <ul className="text-xs text-blue-900/80 space-y-0.5 leading-relaxed">
          <li>Use square images. Recommended 1200 × 1200 px (minimum 800 × 800 px).</li>
          <li>The starred image is the cover shown in Inventory and your storefront.</li>
        </ul>
      </div>
    </div>
  );
}
