export default function Loading() {
  return (
    <div className="min-h-screen md:pl-72 p-4 sm:p-6 space-y-5 animate-pulse">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="h-10 w-64 rounded-2xl bg-[#D5F0DD]" />
        <div className="h-14 w-full rounded-2xl bg-[#E3F7E9]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 rounded-2xl bg-white border border-[#CDE9D5]" />
          <div className="h-28 rounded-2xl bg-white border border-[#CDE9D5]" />
          <div className="h-28 rounded-2xl bg-white border border-[#CDE9D5]" />
          <div className="h-28 rounded-2xl bg-white border border-[#CDE9D5]" />
        </div>
        <div className="h-64 rounded-2xl bg-white border border-[#CDE9D5]" />
      </div>
    </div>
  );
}
