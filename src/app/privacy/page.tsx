import type { Metadata } from "next";
import { InfoPage } from "@/components/youtube/InfoPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for Actrezz visitors, analytics, cookies, security logs and content requests.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy Policy">
      <p>Actrezz is a public adults-only video catalogue. Visitors can browse the site without creating a public account.</p>
      <p>All credit belongs to the original posters and rights holders. The site operator reviews valid copyright and removal requests through the DMCA policy.</p>
      <h2 className="text-lg font-semibold text-yt-text">Information we process</h2>
      <p>We may process basic technical information such as IP address, device type, browser type, pages visited, referral URL, playback errors and security logs. This helps us keep the site fast, secure and reliable.</p>
      <p>If you submit a copyright, privacy, correction or removal request, we process the information you provide, such as your email address, request details and URLs related to the request.</p>
      <p>Copyright notices are retained in a restricted compliance database and may be delivered to the site operator through a server-side email service. The private receiving address is not exposed to public visitors.</p>
      <h2 className="text-lg font-semibold text-yt-text">Cookies and analytics</h2>
      <p>The site may use essential cookies, local storage and privacy-conscious analytics to remember interface preferences, improve performance and understand aggregated traffic patterns.</p>
      <h2 className="text-lg font-semibold text-yt-text">Adult content notice</h2>
      <p>Actrezz is intended only for adults who are legally permitted to view adult material in their location. Do not use the site if you are under the required age.</p>
      <h2 className="text-lg font-semibold text-yt-text">Requests</h2>
      <p>For privacy, correction or removal requests, use the DMCA Takedown Policy with the relevant URL and a clear description of the request.</p>
    </InfoPage>
  );
}
