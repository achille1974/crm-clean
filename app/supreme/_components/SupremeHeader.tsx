"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SupremeHeader() {
  const pathname = usePathname();

  const linkClass = (path: string) =>
    `px-4 py-2 rounded-md text-sm font-medium ${
      pathname.startsWith(path)
        ? "bg-black text-white"
        : "text-zinc-600 hover:text-black"
    }`;

  return (
    <header className="w-full border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
        <span className="text-lg font-semibold">SUPREME</span>

        <nav className="flex gap-2">
          <Link href="/supreme/dashboard" className={linkClass("/supreme/dashboard")}>
            Dashboard
          </Link>

          <Link href="/supreme/tabaccai" className={linkClass("/supreme/tabaccai")}>
            Tabaccai
          </Link>
        </nav>
      </div>
    </header>
  );
}
