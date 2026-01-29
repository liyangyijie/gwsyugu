'use client';
import React, { useState } from 'react';
import { Layout, Menu, Button } from 'antd';
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

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="light" className="border-r border-gray-200 shadow-sm z-10">
        <div className="h-16 flex items-center justify-center border-b border-gray-200">
           <div className={`font-bold text-lg text-blue-600 truncate transition-all duration-300 ${collapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100 px-4'}`}>
             热量预估系统
           </div>
           {collapsed && <span className="text-blue-600 font-bold text-xl">GW</span>}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
          style={{ borderRight: 0 }}
          className="mt-2"
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: '#fff' }} className="flex items-center px-4 border-b border-gray-200 justify-between shadow-sm z-10 h-16">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          <div className="mr-4 text-gray-500 text-sm">
             {new Date().getFullYear()} - 高温水热量管理
          </div>
        </Header>
        <Content
          style={{
            margin: '16px',
            padding: 24,
            minHeight: 280,
            background: '#f0f2f5', // Main background grey
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
