import type { Metadata } from "next";
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
      <body className="min-h-full flex flex-col font-sans">
        <ProfileProvider>
          <AuthProvider>{children}</AuthProvider>
        </ProfileProvider>
      </body>
    </html>
  );
}
