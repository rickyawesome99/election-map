import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import AppShell from "@/components/AppShell";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// NOTE: Update year here manually when changing election cycle (all other references use electionYear from forecastData)
export const metadata: Metadata = {
  title: "2026 Election Forecast",
  description: "Interactive U.S. election forecast map for House, Senate, and Governor races",
  appleWebApp: {
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} antialiased`}>
        {/* Runs before hydration to restore dark class without flash */}
        <Script
          id="restore-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var dark=localStorage.getItem('darkMode')==='true';document.documentElement.classList.toggle('dark',dark);var color=dark?'#0d1117':'#f6f8fa';var meta=document.querySelector('meta[name="theme-color"]:not([media])');if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}meta.content=color}catch(e){}})()`,
          }}
        />
        <AppShell />
        {children}
      </body>
    </html>
  );
}
