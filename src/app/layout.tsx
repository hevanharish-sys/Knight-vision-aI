import type { Metadata, Viewport } from "next";
import { Figtree, Inter, Outfit, Sora } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { ProfileProvider } from "@/lib/profile";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Knight Vision AI — Healthcare Without Barriers",
  description:
    "AI that empowers visually impaired and deaf individuals to communicate confidently with healthcare professionals.",
  applicationName: "Knight Vision AI",
  icons: {
    icon: [{ url: "/image.png?v=20260806b", type: "image/png" }],
    apple: [{ url: "/image.png?v=20260806b" }],
    shortcut: ["/image.png?v=20260806b"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Knight Vision",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${figtree.variable} ${sora.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full min-h-[100dvh] flex-col overflow-x-hidden font-sans">
        <ProfileProvider>
          <AuthProvider>{children}</AuthProvider>
        </ProfileProvider>
      </body>
    </html>
  );
}
