import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSP Nexus - Fleet Intelligence Platform",
  description:
    "Digital Twin Fleet Intelligence Platform for Amazon Delivery Service Partners",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
