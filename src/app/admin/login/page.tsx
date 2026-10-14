import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";

export default async function AdminLoginPage() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (await verifyAdminSession(token)) redirect("/admin");
  return <AdminLogin />;
}
