import "./globals.css";

export const metadata = {
  title: "JCB Rental",
  description: "Book, manage and track JCB rental machines.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "JCB Rental", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffb51b",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
