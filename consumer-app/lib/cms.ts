export type NavItem = { label: string; url: string };
export type Site = {
  header: { siteName: string; navigation: NavItem[] };
  footer: { content: string };
};
export type CmsPage = { title: string; slug: string; content: string };

function cmsHeaders(): HeadersInit {
  return { Authorization: `Bearer ${process.env.CMS_API_KEY}` };
}

export async function getSite(): Promise<Site> {
  const res = await fetch(`${process.env.CMS_URL}/api/site`, {
    headers: cmsHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`CMS /api/site request failed with status ${res.status}`);
  }
  return res.json() as Promise<Site>;
}

export async function getPage(slug: string): Promise<CmsPage | null> {
  const res = await fetch(`${process.env.CMS_URL}/api/pages/${slug}`, {
    headers: cmsHeaders(),
    cache: 'no-store',
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`CMS /api/pages/${slug} request failed with status ${res.status}`);
  }

  return res.json() as Promise<CmsPage>;
}
