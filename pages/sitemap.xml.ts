import type { GetServerSideProps } from 'next';

// Only expose static routes per spec
const STATIC_ROUTES: string[] = [
  '/',
  '/about',
  '/rules',
  '/privacy',
  '/terms',
  '/contact',
];

function buildBaseUrl(req: any): string {
  // Prefer proxy headers on Vercel / reverse proxies
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'verseword.com';
  const base = `${proto}://${host}`;
  try {
    // Ensure we return a valid origin
    const url = new URL(base);
    return url.origin;
  } catch {
    return 'https://verseword.com';
  }
}

function generateXml(baseUrl: string): string {
  const today = new Date().toISOString();
  const urls = STATIC_ROUTES.map((path) => {
    const loc = `${baseUrl}${path}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const baseUrl = buildBaseUrl(req);
  const xml = generateXml(baseUrl);

  res.setHeader('Content-Type', 'application/xml');
  res.write(xml);
  res.end();

  return { props: {} };
};

export default function SiteMap() {
  return null;
}


