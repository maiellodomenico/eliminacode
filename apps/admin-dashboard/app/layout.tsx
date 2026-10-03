import './globals.css';
import { Nav } from '@/components/Nav';

export const metadata = { title: 'Eliminacode Admin', description: 'Dashboard amministratore Eliminacode' };

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="it"><body><Nav />{children}</body></html>;
}
