import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-yt-bg px-6 text-center text-yt-text">
      <div>
        <p className="text-sm font-medium text-[#ff2d78]">404</p>
        <h1 className="mt-2 text-3xl font-bold">This page is unavailable</h1>
        <p className="mt-3 text-sm text-yt-text2">The video or profile may have been moved or removed.</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-yt-text px-5 py-2.5 text-sm font-medium text-yt-bg">Back to Actrezz</Link>
      </div>
    </main>
  );
}
