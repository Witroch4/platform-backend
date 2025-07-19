'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function CaixaCardSkeleton() {
  return (
    <Card className="cursor-pointer transition-all">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="w-5 h-5 rounded-full" />
              <Skeleton className="h-6 w-32" />
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="w-8 h-8 rounded" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
          <Skeleton className="h-9 w-full rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

export function LoteCardSkeleton() {
  return (
    <Card className="transition-all">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-4 w-1 rounded-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-1 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <Skeleton className="w-8 h-8 rounded" />
            <Skeleton className="w-8 h-8 rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function VariavelSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="w-8 h-8 rounded" />
    </div>
  );
}