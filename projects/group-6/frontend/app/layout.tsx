import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SprintBoard",
  description: "Assign backlog tasks to team members without ever going over 8 points.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
