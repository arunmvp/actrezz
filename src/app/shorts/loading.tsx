export default function ShortsLoading() {
  return (
    <main className="min-h-dvh bg-yt-bg px-3 pb-12 pt-20 text-yt-text sm:px-5 lg:px-8">
      <div className="mx-auto w-full max-w-[1680px] animate-pulse">
        <div className="mb-5 space-y-2">
          <div className="h-3 w-20 rounded bg-yt-skeleton" />
          <div className="h-8 w-36 rounded-lg bg-yt-skeleton" />
          <div className="h-4 w-64 max-w-full rounded bg-yt-skeleton" />
        </div>
        <div className="grid grid-cols-3 gap-0 overflow-hidden rounded-xl sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          {Array.from({ length: 18 }, (_, index) => <div key={index} className="aspect-[9/16] bg-yt-skeleton odd:bg-white/[0.045]" />)}
        </div>
      </div>
    </main>
  );
}
