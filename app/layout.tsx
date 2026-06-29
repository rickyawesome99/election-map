import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
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
  appleWebApp: {
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#000000",
  viewportFit: "cover",
};

const restoreThemeScript = `(function(){try{var dark=localStorage.getItem('darkMode')==='true';var themeColor=dark?'#000000':'#ffffff';var root=document.documentElement;root.classList.toggle('dark',dark);root.style.backgroundColor=themeColor;root.style.colorScheme=dark?'dark':'light';document.querySelectorAll('meta[name="theme-color"]').forEach(function(meta){meta.remove()});var themeMeta=document.createElement('meta');themeMeta.name='theme-color';themeMeta.content=themeColor;document.head.appendChild(themeMeta);var statusMeta=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(!statusMeta){statusMeta=document.createElement('meta');statusMeta.name='apple-mobile-web-app-status-bar-style';document.head.appendChild(statusMeta)}statusMeta.content=dark?'black-translucent':'default'}catch(e){}})()`;

function validRaceType(value: string | undefined): "house" | "senate" | "governor" | null {
  return value === "house" || value === "senate" || value === "governor" ? value : null;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialForecastTab = validRaceType((await cookies()).get("raceType")?.value);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs in head so iOS Safari sees the active status-bar color before paint. */}
        <script dangerouslySetInnerHTML={{ __html: restoreThemeScript }} />
      </head>
      <body className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} antialiased`}>
        <AppShell initialForecastTab={initialForecastTab} />
        {children}
      </body>
    </html>
  );
}
