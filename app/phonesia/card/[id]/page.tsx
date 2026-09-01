import { redirect } from "next/navigation";

export default async function Card() {
  // qui in futuro potremo registrare accessi cliente

  redirect("/phonesia/biglietto");
}
