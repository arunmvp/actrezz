import type { Metadata } from "next";
import { InfoPage } from "@/components/youtube/InfoPage";

export const metadata: Metadata = {
  title: "Copyright Policy",
  description: "Copyright and rights policy for Actrezz catalogue videos, thumbnails and metadata.",
  alternates: { canonical: "/copyright" },
};

export default function CopyrightPage() {
  return (
    <InfoPage title="Copyright Policy">
      <p>Actrezz respects copyright and related rights. Published content should be added only when the administrator has the required rights, licence, permission or lawful basis to display it.</p>
      <p>Media may be stored or delivered using third-party cloud infrastructure. Attribution does not replace the rights, permission, licence or lawful basis required to publish material.</p>
      <p>Actrezz does not claim ownership of third-party works and will review valid rights-holder notices.</p>
      <h2 className="text-lg font-semibold text-yt-text">Catalogue material</h2>
      <p>Video pages may include titles, descriptions, thumbnails, tags, actress names, movie or TV series information and playback media. These details are maintained to help visitors identify and browse catalogue entries accurately.</p>
      <h2 className="text-lg font-semibold text-yt-text">Rights-holder requests</h2>
      <p>If you believe material on Actrezz infringes your rights, use the DMCA Takedown Policy with the URL, identification of the copyrighted work, your contact details and a statement that you are authorised to act for the rights holder.</p>
      <h2 className="text-lg font-semibold text-yt-text">Action after review</h2>
      <p>Valid requests may result in removal, restriction, correction of metadata or replacement of media. Repeat or bad-faith infringement sources should not be used in the admin publishing workflow.</p>
    </InfoPage>
  );
}
