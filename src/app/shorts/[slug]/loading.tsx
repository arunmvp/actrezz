export default function ShortPlayerLoading() {
  return (
    <main className="grid min-h-dvh place-items-center overflow-hidden bg-black text-white">
      <div className="relative aspect-[9/16] h-dvh max-h-[820px] max-w-full overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-black sm:h-[calc(100dvh-56px)] sm:rounded-2xl">
        <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_40%,rgba(255,45,120,.14),transparent_45%)]" />
        <div className="absolute inset-0 grid place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/20 border-t-white" /></div>
        <div className="absolute inset-x-4 bottom-7 space-y-2"><div className="h-4 w-24 rounded bg-white/15" /><div className="h-5 w-4/5 rounded bg-white/15" /></div>
      </div>
    </main>
  );
}
