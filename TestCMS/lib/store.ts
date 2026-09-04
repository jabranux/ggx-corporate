import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type Product = {
  id: string;
  name: string;
  apiKey: string;
  createdAt: string;
};

export type Page = {
  id: string;
  productId: string;
  title: string;
  slug: string;
  createdAt: string;
};

type Db = {
  products: Product[];
  pages: Page[];
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function readDb(): Db {
  if (!fs.existsSync(DB_PATH)) return { products: [], pages: [] };
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  if (!raw.trim()) return { products: [], pages: [] };
  return JSON.parse(raw) as Db;
}

function writeDb(db: Db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  let n = 2;
  while (taken.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

export function listProducts(): Product[] {
  return readDb().products;
}

export function getProduct(id: string): Product | undefined {
  return readDb().products.find((p) => p.id === id);
}

export function getProductByApiKey(apiKey: string): Product | undefined {
  return readDb().products.find((p) => p.apiKey === apiKey);
}

export function createProduct(name: string): Product {
  const db = readDb();
  const taken = new Set(db.products.map((p) => p.id));
  const id = uniqueSlug(slugify(name), taken);
  const product: Product = {
    id,
    name,
    apiKey: `tcms_${crypto.randomBytes(24).toString('hex')}`,
    createdAt: new Date().toISOString(),
  };
  db.products.push(product);
  writeDb(db);
  return product;
}

export function listPagesForProduct(productId: string): Page[] {
  return readDb().pages.filter((p) => p.productId === productId);
}

export function getPageById(productId: string, pageId: string): Page | undefined {
  return readDb().pages.find((p) => p.productId === productId && p.id === pageId);
}

export function getPageBySlug(productId: string, slug: string): Page | undefined {
  return readDb().pages.find((p) => p.productId === productId && p.slug === slug);
}

export function createPage(productId: string, title: string): Page {
  const db = readDb();
  const taken = new Set(
    db.pages.filter((p) => p.productId === productId).map((p) => p.slug)
  );
  const slug = uniqueSlug(slugify(title), taken);
  const page: Page = {
    id: crypto.randomUUID(),
    productId,
    title,
    slug,
    createdAt: new Date().toISOString(),
  };
  db.pages.push(page);
  writeDb(db);
  return page;
}
