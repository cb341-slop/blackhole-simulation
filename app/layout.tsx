import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Singularity — A spacetime observatory",
  description: "Explore an interactive black hole and naked singularity simulation.",
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
      <body>{children}</body>
    </html>
  );
}
