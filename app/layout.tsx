import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
