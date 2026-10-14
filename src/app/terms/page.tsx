import type { Metadata } from "next";
import { InfoPage } from "@/components/youtube/InfoPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms of use for browsing Actrezz, an adults-only video catalogue.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <InfoPage title="Terms of Use">
      <p>By using Actrezz, you confirm that you are an adult and legally permitted to view adult material in your location.</p>
      <h2 className="text-lg font-semibold text-yt-text">Public browsing</h2>
      <p>The public site is provided for catalogue browsing and video playback. Visitors may not attempt to bypass security controls, scrape protected systems, overload the service or misuse the site.</p>
      <h2 className="text-lg font-semibold text-yt-text">Content accuracy</h2>
      <p>We work to keep titles, metadata, tags and credits accurate. If you find an error, use the DMCA Takedown Policy with the relevant page URL and a clear description of the issue.</p>
      <h2 className="text-lg font-semibold text-yt-text">Rights and removals</h2>
      <p>Copyright, privacy or content removal requests are handled through the Copyright Policy and DMCA Takedown Policy.</p>
    </InfoPage>
  );
}
