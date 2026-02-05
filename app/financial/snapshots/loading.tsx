'use client';

import { Skeleton } from 'antd';

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-6">
           <Skeleton.Input active size="large" />
           <div className="flex gap-2">
             <Skeleton.Button active />
           </div>
        </div>
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    </div>
  );
}
