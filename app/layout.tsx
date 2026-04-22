import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import PresenceTracker from "@/components/PresenceTracker";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Switchboard",
  description: "Project coordination for Totally Wired Electric",
  icons: {
    icon:   "/switchboard-icon.svg",
    apple:  "/switchboard-icon.svg",
    shortcut: "/switchboard-icon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Switchboard",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#101010",
  colorScheme: "dark light" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-gray-50 text-gray-900 antialiased">
        <PresenceTracker />
        {children}
      </body>
    </html>
  );
}
