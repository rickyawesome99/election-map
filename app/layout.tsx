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
  themeColor: "#f6f8fa",
  viewportFit: "cover",
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
            __html: `(function(){try{var dark=localStorage.getItem('darkMode')==='true';var color=dark?'#0d1117':'#f6f8fa';document.documentElement.classList.toggle('dark',dark);document.documentElement.style.backgroundColor=color;document.documentElement.style.colorScheme=dark?'dark':'light';var metas=document.querySelectorAll('meta[name="theme-color"]');if(!metas.length){var meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta);metas=[meta]}metas.forEach(function(meta){meta.removeAttribute('media');meta.content=color})}catch(e){}})()`,
          }}
        />
        <AppShell />
        {children}
      </body>
    </html>
  );
}
