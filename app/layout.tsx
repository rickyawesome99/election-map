import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppShell from "@/components/AppShell";
import SiteFooter from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/siteUrl";

// Self-hosted copies of the Google Fonts files (app/fonts/README.md): a build that downloads
// them from Google fails whenever that fetch does.
const ibmPlexSans = localFont({
  variable: "--font-ibm-plex-sans",
  src: "./fonts/IBMPlexSans-Variable.woff2",
  weight: "100 700",
});

const ibmPlexMono = localFont({
  variable: "--font-ibm-plex-mono",
  src: [
    { path: "./fonts/IBMPlexMono-400.woff2", weight: "400" },
    { path: "./fonts/IBMPlexMono-500.woff2", weight: "500" },
    { path: "./fonts/IBMPlexMono-600.woff2", weight: "600" },
  ],
});

// NOTE: Update year here manually when changing election cycle (all other references use electionYear from forecastData)
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "2026 Election Forecast",
  description: "Interactive U.S. election forecast map for House, Senate, and Governor races",
  // Share previews: app/opengraph-image.png site-wide (scripts/buildSiteShareCard.tsx) and a per-race card from each race segment's opengraph-image.tsx.
  openGraph: { siteName: "CT Strategies", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f9f8f5",
  viewportFit: "cover",
};

const restoreThemeScript = `(function(){try{var dark=localStorage.getItem('darkMode')==='true';var themeColor=dark?'#0d1117':'#f9f8f5';var colorScheme=dark?'dark':'light';var root=document.documentElement;root.classList.toggle('dark',dark);root.dataset.theme=colorScheme;root.style.setProperty('--browser-chrome-bg',themeColor);root.style.backgroundColor=themeColor;root.style.colorScheme=colorScheme;function syncMeta(name,content,removeMedia){var metas=Array.prototype.slice.call(document.querySelectorAll('meta[name="'+name+'"]'));var meta=metas.shift()||document.createElement('meta');meta.name=name;meta.content=content;if(removeMedia)meta.removeAttribute('media');if(!meta.parentNode)document.head.appendChild(meta);metas.forEach(function(extra){extra.remove()})}syncMeta('theme-color',themeColor,true);syncMeta('color-scheme',colorScheme,false);syncMeta('apple-mobile-web-app-status-bar-style',dark?'black':'default',false)}catch(e){}})()`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs in head so iOS Safari sees the active status-bar color before paint. */}
        <script dangerouslySetInnerHTML={{ __html: restoreThemeScript }} />
      </head>
      <body className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} antialiased`}>
        <AppShell />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
