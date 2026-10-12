import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  // A template so every page reads "Sign in · SecureGate" and the like, while
  // pages that set no title (home, dashboard) fall back to the bare name.
  title: {
    default: "SecureGate",
    template: "%s · SecureGate",
  },
  description:
    "A focused authentication and security app: sign up, verify your email, sign in, and reset your password.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
