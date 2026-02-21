"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
<<<<<<< HEAD
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/common/toaster";
=======
import { ToastProvider } from "@/components/common/use-toast";
import { ToastRenderer } from "@/components/common/toaster";
>>>>>>> a20adac (fix: resolve build errors after frontend merge)

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
<<<<<<< HEAD
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster />
        </QueryClientProvider>
      </SessionProvider>
=======
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {children}
          <ToastRenderer />
        </ToastProvider>
      </QueryClientProvider>
>>>>>>> a20adac (fix: resolve build errors after frontend merge)
    </ThemeProvider>
  );
}
