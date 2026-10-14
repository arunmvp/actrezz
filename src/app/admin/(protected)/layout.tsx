import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifyAdminSession(token))) redirect("/admin/login");
  return children;
}
