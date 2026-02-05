'use client';

import { Skeleton, Card } from 'antd';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton.Input active size="large" />
        <div className="flex gap-2">
            <Skeleton.Button active />
            <Skeleton.Button active />
        </div>
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} size="small">
             <Skeleton active paragraph={{ rows: 1 }} />
          </Card>
        ))}
      </div>

      {/* Main Content Skeleton */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <Skeleton active title={false} paragraph={{ rows: 8 }} />
          </Card>
          <Card className="shadow-sm">
             <Skeleton active title={false} paragraph={{ rows: 8 }} />
          </Card>
       </div>
    </div>
  );
}
