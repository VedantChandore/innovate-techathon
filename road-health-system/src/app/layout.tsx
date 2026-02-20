import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Road Raksha — India Road Health System",
  description:
    "Digital road condition management system with CIBIL-style health scoring for India's national highways",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
