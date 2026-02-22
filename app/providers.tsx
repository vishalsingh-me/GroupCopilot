"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/common/use-toast";
import { ToastRenderer } from "@/components/common/toaster";

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            {children}
            <ToastRenderer />
          </ToastProvider>
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
