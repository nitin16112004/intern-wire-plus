import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InternWire+ — Internship Discovery & Tracker",
  description:
    "Find fresh internships, save promising roles, and track every application in one focused workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
