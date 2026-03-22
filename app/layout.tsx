import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});



const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
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
