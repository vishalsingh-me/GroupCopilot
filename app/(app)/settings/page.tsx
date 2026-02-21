"use client";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <Link href="/" className="text-sm text-muted-foreground">
          ← Back to home
        </Link>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Coming soon</p>
      </div>
    </main>
  );
}
