import { redirect } from "next/navigation";

export default async function Card({
  params,
}: {
  params: { id: string };
}) {

  // qui in futuro potremo registrare accessi cliente

  redirect("/phonesia/biglietto");

}
