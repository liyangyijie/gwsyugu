import type { Metadata } from "next";
import "./globals.css";
import 'katex/dist/katex.min.css';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import MainLayout from "./components/MainLayout";
import zhCN from 'antd/locale/zh_CN';

export const metadata: Metadata = {
  title: "高温水用热量预估系统",
  description: "Heat Estimation & Billing System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="bg-slate-50">
        <AntdRegistry>
          <ConfigProvider
            locale={zhCN}
            theme={{
              token: {
                // Professional Blue Theme (Mini-program like)
                colorPrimary: '#1677ff',
                colorSuccess: '#52c41a',
                colorWarning: '#faad14',
                colorError: '#ff4d4f',
                borderRadius: 8,
                wireframe: false,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
              },
              components: {
                Layout: {
                  bodyBg: '#f5f7fa',
                  headerBg: '#ffffff',
                  siderBg: '#ffffff',
                },
                Card: {
                  boxShadowTertiary: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
                },
                Button: {
                  controlHeight: 36,
                },
                Table: {
                  headerBg: '#fafafa',
                  headerSplitColor: 'transparent',
                }
              }
            }}
          >
            <MainLayout>{children}</MainLayout>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
