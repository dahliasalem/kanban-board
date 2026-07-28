"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return null;
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        You&apos;re signed in
      </h1>
      <p className="text-sm text-gray-500">
        Signed in as {user.email ?? "your account"}. Boards are coming soon.
      </p>
      <button
        type="button"
        onClick={() => signOut()}
        className="mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
      >
        Sign out
      </button>
    </main>
  );
}
