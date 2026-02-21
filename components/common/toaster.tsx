"use client";

import { ToastProvider as RadixToastProvider } from "@/components/ui/toast";
import { ToastViewport, Toast, ToastTitle, ToastDescription } from "@/components/ui/toast";
import { ToastProvider, useToast } from "@/components/common/use-toast";

function ToastRenderer() {
  const { toasts, dismiss } = useToast();

  return (
    <RadixToastProvider swipeDirection="right">
      {toasts.map((item) => (
        <Toast key={item.id} onOpenChange={(open) => !open && dismiss(item.id)}>
          <ToastTitle>{item.title}</ToastTitle>
          {item.description ? <ToastDescription>{item.description}</ToastDescription> : null}
        </Toast>
      ))}
      <ToastViewport />
    </RadixToastProvider>
  );
}

export function Toaster() {
  return (
    <ToastProvider>
      <ToastRenderer />
    </ToastProvider>
  );
}
