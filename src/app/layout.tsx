import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import GlobalProgress from "@/components/GlobalProgress";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "OpenLearn Manager",
  description: "Modern Admin Dashboard for OpenLearn",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} h-full antialiased light`}
    >
      <body className="bg-background text-on-surface font-body selection:bg-primary-container selection:text-on-primary-container min-h-full flex flex-col">
        <GlobalProgress />
        {children}
      </body>
    </html>
  );
}
