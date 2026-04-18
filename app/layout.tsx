import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} antialiased`}>
        {/* Runs before hydration to restore dark class without flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('darkMode')==='true')document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
