'use client';
import { AppSidebar } from './AppSidebar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState } from 'react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen bg-[hsl(var(--background))]">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
      <Toaster richColors position="top-right" closeButton />
    </QueryClientProvider>
  );
}
