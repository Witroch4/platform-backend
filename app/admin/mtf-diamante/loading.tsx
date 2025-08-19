export default function MtfDiamanteLoading() {
  return (
    <div className="p-6 space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse bg-gray-200 rounded" />
        <div className="h-8 w-24 animate-pulse bg-gray-200 rounded" />
      </div>
      
      {/* Content skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-full animate-pulse bg-gray-200 rounded" />
        <div className="h-4 w-5/6 animate-pulse bg-gray-200 rounded" />
        <div className="h-4 w-4/6 animate-pulse bg-gray-200 rounded" />
      </div>
      
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 border border-gray-200 rounded-lg">
            <div className="h-6 w-32 animate-pulse bg-gray-200 rounded mb-2" />
            <div className="h-4 w-full animate-pulse bg-gray-200 rounded mb-1" />
            <div className="h-4 w-3/4 animate-pulse bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
