import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
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
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
  viewportFit: "cover",
};

const restoreThemeScript = `(function(){try{var dark=localStorage.getItem('darkMode')==='true';var themeColor=dark?'#000000':'#ffffff';var colorScheme=dark?'dark':'light';var root=document.documentElement;root.classList.toggle('dark',dark);root.dataset.theme=colorScheme;root.style.setProperty('--browser-chrome-bg',themeColor);root.style.backgroundColor=themeColor;root.style.colorScheme=colorScheme;function syncMeta(name,content,removeMedia){var metas=Array.prototype.slice.call(document.querySelectorAll('meta[name="'+name+'"]'));var meta=metas.shift()||document.createElement('meta');meta.name=name;meta.content=content;if(removeMedia)meta.removeAttribute('media');if(!meta.parentNode)document.head.appendChild(meta);metas.forEach(function(extra){extra.remove()})}syncMeta('theme-color',themeColor,true);syncMeta('color-scheme',colorScheme,false);syncMeta('apple-mobile-web-app-status-bar-style',dark?'black':'default',false)}catch(e){}})()`;

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
      </body>
    </html>
  );
}
