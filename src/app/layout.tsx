import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "./app-header";

export const metadata: Metadata = {
  title: "Kuntakuva",
  description: "Tutki Suomen kuntien väestöä ja kehitystä.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fi"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <a className="skip-link" href="#main-content">Siirry sisältöön</a>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
