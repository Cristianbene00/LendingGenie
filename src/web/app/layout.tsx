import type { Metadata } from "next";
import { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "LendingGenie — AI Credit & Loan Assistant",
  description: "Understand your credit situation and find the right loan with LendingGenie's AI-powered assistant.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
