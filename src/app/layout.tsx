import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { getCensus } from '@/lib/data';
import LoginBox from '@/components/LoginBox';

export const metadata: Metadata = {
  title: 'prov_inspect',
  description: 'Provisional ECOD reps: amalgams, trims and retirements',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const census = await getCensus().catch(() => null);
  return (
    <html lang="en">
      <body>
        <div style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
          <div className="wrap" style={{ padding: '10px 16px', display: 'flex', gap: 18, alignItems: 'baseline' }}>
            <Link href="/" style={{ fontWeight: 600 }}>prov_inspect</Link>
            <Link href="/?rec=split" className="muted">split</Link>
            <Link href="/?rec=trim" className="muted">trim</Link>
            <Link href="/?rec=retire" className="muted">retire</Link>
            <Link href="/?dec=decided" className="muted">decided</Link>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
              snapshot {census?.built ?? '?'}
            </span>
            <LoginBox />
          </div>
        </div>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
