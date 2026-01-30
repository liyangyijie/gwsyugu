'use client';
import React, { useState } from 'react';
import { Layout, Menu, Button, Drawer, Grid } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  BankOutlined
} from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const screens = useBreakpoint();

  // If screens.md is undefined (during SSR), assume desktop to avoid flash, or handle effect
  // But useBreakpoint is client-side.
  const isMobile = !screens.md;

  // Highlight 'units' menu even if subpath
  const selectedKey = pathname.startsWith('/units') ? '/units' : pathname;

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表板',
    },
    {
      key: '/units',
      icon: <UserOutlined />,
      label: '单位管理',
    },
    {
      key: '/financial',
      icon: <BankOutlined />,
      label: '财务报表',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
  ];

  const handleMenuClick = (key: string) => {
    router.push(key);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  const LogoContent = (
    <div className="h-16 flex items-center justify-center border-b border-gray-200">
       <div className={`font-bold text-lg text-blue-600 truncate transition-all duration-300 ${!isMobile && collapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100 px-4'}`}>
         热量预估系统
       </div>
       {!isMobile && collapsed && <span className="text-blue-600 font-bold text-xl">GW</span>}
    </div>
  );

  const MenuContent = (
    <Menu
      theme="light"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={({ key }) => handleMenuClick(key)}
      style={{ borderRight: 0 }}
      className="mt-2"
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sider */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="light"
        className="hidden md:block border-r border-gray-200 shadow-sm z-10"
        width={220}
      >
        {LogoContent}
        {MenuContent}
      </Sider>

      {/* Mobile Drawer */}
      <Drawer
        title={null}
        placement="left"
        onClose={() => setMobileOpen(false)}
        open={mobileOpen && isMobile}
        styles={{ body: { padding: 0 } }}
        width={220}
      >
         {LogoContent}
         {MenuContent}
      </Drawer>

      <Layout>
        <Header style={{ padding: 0, background: '#fff' }} className="flex items-center px-4 border-b border-gray-200 justify-between shadow-sm z-10 h-16 sticky top-0">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggleSidebar}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          <div className="mr-4 text-gray-500 text-sm hidden sm:block">
             {new Date().getFullYear()} - 高温水热量管理
          </div>
        </Header>
        <Content
          className="m-2 md:m-4 p-4 md:p-6"
          style={{
            minHeight: 280,
            background: '#f0f2f5',
            borderRadius: 8,
            overflow: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
