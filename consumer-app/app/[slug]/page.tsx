import { notFound } from 'next/navigation';

type CmsPage = { title: string; slug: string };

async function getPage(slug: string): Promise<CmsPage | null> {
  const res = await fetch(`${process.env.CMS_URL}/api/pages/${slug}`, {
    headers: { Authorization: `Bearer ${process.env.CMS_API_KEY}` },
    cache: 'no-store',
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`CMS request failed with status ${res.status}`);
  }

  return res.json() as Promise<CmsPage>;
}

export default async function CmsSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  return <h1>{page.title}</h1>;
}
