import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Group Copilot",
  description: "AI Collaboration Governor for Student Group Projects",
  icons: {
    icon: "/group-copilot-logo.svg",
    shortcut: "/group-copilot-logo.svg",
    apple: "/group-copilot-logo.svg"
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
