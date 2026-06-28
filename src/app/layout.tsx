import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AppContextProvider } from '@/context/AppContext';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'PSO SME — Customer 360',
  description: 'Customer 360 operations workspace — sales, invoices, customer management and outreach.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} light`}>
      <body className="bg-background text-foreground antialiased font-sans">
        <AppContextProvider>
          <div className="min-h-screen flex font-sans">
            {/* Shared Sidebar Navigation */}
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0">
              {/* Shared Top Navigation Bar */}
              <Header />

              {/* Main Content Area */}
              <main className="ml-[208px] pt-[52px] min-h-screen bg-background">
                {children}
              </main>
            </div>
          </div>
        </AppContextProvider>
      </body>
    </html>
  );
}
