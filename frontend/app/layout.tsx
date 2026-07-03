import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Genesis Lab",
  description: "AI 科研工作流实验室"
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
