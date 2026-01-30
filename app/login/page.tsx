'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Title } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();

  const onFinish = async (values: { password: string }) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: values.password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        messageApi.success('登录成功');
        router.push('/dashboard');
        router.refresh(); // Refresh to update middleware state
      } else {
        messageApi.error(data.error || '密码错误');
      }
    } catch (error) {
      messageApi.error('登录请求失败，请稍后重试');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      {contextHolder}
      <Card className="w-full max-w-md shadow-lg rounded-xl overflow-hidden">
        <div className="text-center mb-8 mt-4">
          <Title level={3} style={{ marginBottom: 0, color: '#1890ff' }}>
            系统访问保护
          </Title>
          <p className="text-gray-500 mt-2">请输入密码以继续访问</p>
        </div>

        <Form
          name="login"
          initialValues={{ remember: true }}
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入访问密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined className="site-form-item-icon text-gray-400" />}
              placeholder="访问密码"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" className="w-full" loading={loading}>
              解锁进入
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
