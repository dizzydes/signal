import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Autoheal",
  description: "A site that fixes itself.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
