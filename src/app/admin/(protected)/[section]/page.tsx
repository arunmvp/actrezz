import { notFound } from "next/navigation";
import { AdminConsolePro, type AdminSection } from "@/components/admin/AdminConsolePro";

const sections: AdminSection[] = [
  "videos",
  "actresses",
  "works",
  "shorts",
  "tags",
  "media",
  "imports",
  "seo",
  "settings",
];

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section as AdminSection)) notFound();
  return <AdminConsolePro section={section as AdminSection} />;
}
