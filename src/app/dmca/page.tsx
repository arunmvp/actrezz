import type { Metadata } from "next";
import { DmcaNoticeForm } from "@/components/public/DmcaNoticeForm";
import { InfoPage } from "@/components/youtube/InfoPage";

export const metadata: Metadata = {
  title: "DMCA Takedown Policy & Copyright Contact",
  description: "DMCA copyright takedown notice requirements and rights-holder removal process for Actrezz.",
  alternates: { canonical: "/dmca" },
};

export default function DmcaPage() {
  return (
    <InfoPage title="DMCA Takedown Policy & Copyright Contact">
      <p>Actrezz respects copyright and responds to valid notices of claimed infringement under the Digital Millennium Copyright Act and other applicable copyright laws.</p>
      <p>Media may be delivered through third-party cloud infrastructure. Credit or attribution does not replace permission, a licence, or another lawful basis to publish material.</p>
      <p>If you are a copyright owner, performer, rights holder or authorised agent, you may request removal, restriction or correction of a matching Actrezz page, thumbnail, metadata entry or linked media object.</p>

      <h2 className="text-lg font-semibold text-yt-text">Copyright contact form</h2>
      <p>Use the secure form below. The receiving address is kept private to reduce spam, while every accepted submission receives a private reference number and is retained for review.</p>

      <h2 className="text-lg font-semibold text-yt-text">Your notice should include</h2>
      <ol className="list-decimal space-y-3 pl-5">
        <li>The exact Actrezz URL where the material appears.</li>
        <li>Identification of the copyrighted work or rights-protected material claimed to be infringed.</li>
        <li>Your full name, organisation if applicable, email address and a physical or electronic signature.</li>
        <li>A statement that you have a good-faith belief that the disputed use is not authorised by the copyright owner, its agent or the law.</li>
        <li>A statement that the information in the notice is accurate and, under penalty of perjury, that you are the owner or authorised to act on behalf of the owner.</li>
      </ol>

      <h2 className="text-lg font-semibold text-yt-text">Review process</h2>
      <p>After receiving a valid request, Actrezz may remove or disable access to the material, update metadata, restrict public indexing, request additional information, or reject notices that are incomplete, abusive or materially inaccurate.</p>
      <p>Please note that knowingly misrepresenting that material or activity is infringing may create legal liability. Counter-notices may be reviewed where permitted by law.</p>

      <h2 className="text-lg font-semibold text-yt-text">Submit a notice</h2>
      <DmcaNoticeForm />
    </InfoPage>
  );
}
