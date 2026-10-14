import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/youtube/InfoPage";

export const metadata: Metadata = {
  title: "18 U.S.C. § 2257 Compliance Statement",
  description: "Actrezz age-verification, performer-record and 18 U.S.C. sections 2257 and 2257A compliance policy.",
  alternates: { canonical: "/2257" },
};

export default function Compliance2257Page() {
  return (
    <InfoPage title="18 U.S.C. § 2257 Compliance Statement">
      <p>Actrezz is an adults-only catalogue. No person under 18 years of age is permitted to appear in material published on this service, and content that depicts or appears to depict a minor is strictly prohibited.</p>

      <h2 className="text-lg font-semibold text-yt-text">Producer status and records</h2>
      <p>Actrezz is not the primary producer of the visual depictions appearing in its catalogue. To the extent that 18 U.S.C. §§ 2257, 2257A and 28 C.F.R. Part 75 apply to a particular depiction, the required performer age and identity records are maintained by the original producer or other legally responsible records custodian identified with that production.</p>
      <p>Material not subject to those provisions may include depictions produced before the applicable dates, material that does not portray conduct covered by the statutes, and material for which Actrezz performs only activities excluded from the statutory definition of producer. This statement is not intended to claim an exemption where one does not lawfully apply.</p>

      <h2 className="text-lg font-semibold text-yt-text">Publishing policy</h2>
      <p>Administrators must publish only material for which the necessary rights, permissions or lawful basis are available. Actrezz may remove or restrict any material when age, identity, consent, ownership or record-keeping compliance cannot be reasonably established.</p>

      <h2 className="text-lg font-semibold text-yt-text">Compliance reports</h2>
      <p>If you believe any page raises an age, consent, performer-record or legal-compliance concern, submit the exact URL and supporting details through the <Link href="/dmca" className="font-medium text-[#ff73aa] underline underline-offset-2">copyright and compliance form</Link>. Reports involving a suspected minor receive immediate priority.</p>
    </InfoPage>
  );
}
