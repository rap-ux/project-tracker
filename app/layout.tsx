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

// Runs before paint so the saved theme (light/dark/auto) is applied with no flash.
const themeScript = `(function(){try{var t=localStorage.getItem('theme')||'auto';var d=t==='dark'||(t==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-bg text-text antialiased">
        <PresenceTracker />
        {children}
      </body>
    </html>
  );
}
