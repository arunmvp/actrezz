export default function Loading() {
  return (
    <main className="min-h-dvh bg-yt-bg px-3 pb-12 pt-20 text-yt-text sm:px-5 lg:px-8">
      <div className="mx-auto w-full max-w-[1400px] animate-pulse">
        <div className="h-8 w-52 rounded-lg bg-yt-skeleton" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-yt-skeleton" />
        <div className="mt-8 grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index}>
              <div className="aspect-video rounded-xl bg-yt-skeleton" />
              <div className="mt-3 h-4 w-11/12 rounded bg-yt-skeleton" />
              <div className="mt-2 h-3 w-7/12 rounded bg-yt-skeleton" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
