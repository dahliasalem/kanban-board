"use client";

import { FirebaseError } from "firebase/app";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";

function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-email":
        return "That email address doesn't look right.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Incorrect email or password.";
      case "auth/email-already-in-use":
        return "An account with that email already exists — try signing in instead.";
      case "auth/weak-password":
        return "Password should be at least 6 characters.";
      case "auth/popup-closed-by-user":
        return "Sign-in was cancelled.";
      default:
        return "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

export default function SignInPage() {
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } =
    useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || user) {
    return null;
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "signin" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {mode === "signin"
            ? "Welcome back to Kanban Board."
            : "Get started with Kanban Board."}
        </p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={submitting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />
          or
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode(mode === "signin" ? "signup" : "signin");
            }}
            className="font-medium text-blue-600 hover:underline"
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
