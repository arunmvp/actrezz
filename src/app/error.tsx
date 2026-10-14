"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-yt-bg px-6 text-center text-yt-text">
      <div>
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-sm text-yt-text2">Please try loading this page again.</p>
        <button onClick={reset} className="mt-6 rounded-full bg-yt-text px-5 py-2.5 text-sm font-medium text-yt-bg">Try again</button>
      </div>
    </main>
  );
}
