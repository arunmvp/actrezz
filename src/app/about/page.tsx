import type { Metadata } from "next";
import { InfoPage } from "@/components/youtube/InfoPage";

export const metadata: Metadata = {
  title: "About Actrezz",
  description: "About Actrezz, an adult celebrity movie and television video catalogue organised by actress, title, year and tag.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <InfoPage title="About Actrezz">
      <p>Actrezz is an adults-only celebrity video catalogue focused on curated movie and television scenes. Videos are organised by actress, movie, TV series, release year and descriptive tags so visitors can find related scenes quickly.</p>
      <p>All credit to the original posters and rights holders. Actrezz publishes media only under the rights, permissions or licences available to the site operator and responds to valid removal requests.</p>
      <p>The public site is browse-only. Visitors do not need an account, and only the site administrator can publish or update catalogue entries.</p>
      <p>Every production item should include accurate titles, actress credits, source work details, tags, duration, thumbnail and rights-review status before it is published.</p>
      <p>Actrezz is designed for clear navigation, fast playback, search-engine-friendly metadata and a professional takedown process for copyright or content concerns.</p>
    </InfoPage>
  );
}
