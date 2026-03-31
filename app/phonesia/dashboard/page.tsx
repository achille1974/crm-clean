import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PhonesiaDashboardPage() {
  redirect("/phonesia/dashboard/clienti");
}
