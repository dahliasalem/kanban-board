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

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.36 5.6A10.5 10.5 0 0 1 12 5c6.4 0 10 7 10 7a15.6 15.6 0 0 1-3.22 4.02M6.6 6.6C4.16 8.2 2 12 2 12s3.6 7 10 7c1.36 0 2.58-.32 3.64-.82"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SignInPage() {
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } =
    useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#fffbfe]">
      {/* Atmospheric animated background */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="animate-drift absolute top-[10%] opacity-20 blur-3xl"
          style={{ animationDuration: "40s", left: "-10%" }}
        >
          <div className="flex gap-4">
            <div className="h-64 w-32 rounded-3xl bg-[#6750a4]" />
            <div className="mt-12 h-80 w-32 rounded-3xl bg-[#e8def8]" />
            <div className="h-64 w-32 rounded-3xl bg-[#7d5260]" />
          </div>
        </div>

        <div
          className="animate-drift absolute top-[40%] opacity-15 blur-2xl"
          style={{ animationDuration: "55s", left: "-20%" }}
        >
          <div className="flex flex-col gap-6">
            <div className="h-24 w-48 rotate-12 rounded-2xl bg-[#e8def8]" />
            <div className="h-20 w-40 -rotate-6 rounded-2xl bg-[#6750a4]" />
          </div>
        </div>

        <div
          className="animate-drift absolute bottom-[10%] opacity-10 blur-[80px]"
          style={{ animationDuration: "70s", left: "-30%" }}
        >
          <div className="flex gap-8">
            <div className="h-96 w-56 rounded-full bg-[#7d5260]" />
            <div className="h-64 w-64 rounded-full bg-[#6750a4]" />
          </div>
        </div>
      </div>

      <main className="relative z-10 w-full max-w-sm px-6">
        <div className="rounded-[28px] border border-[#e7e0ec]/50 bg-[#f3edf7] p-8 shadow-xl">
          <div className="mb-8 text-center">
            <span className="mb-2 block text-4xl font-bold tracking-tight text-[#1c1b1f]">
              Kanban
            </span>
            <h1 className="text-2xl font-normal text-[#1c1b1f]">
              {mode === "signin" ? "Sign in" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-[#49454f]">
              {mode === "signin"
                ? "Welcome back to Kanban"
                : "Get started with Kanban"}
            </p>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-3 rounded-full border border-[#cac4d0] bg-transparent py-3 text-sm font-medium text-[#49454f] transition-all hover:bg-[#e8def8]/30 disabled:opacity-50"
            >
              <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                <path
                  fill="#FFC107"
                  d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
                />
                <path
                  fill="#4CAF50"
                  d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-4 py-2">
              <div className="h-px flex-1 bg-[#cac4d0]" />
              <span className="text-xs font-medium uppercase tracking-wider text-[#49454f]">
                or
              </span>
              <div className="h-px flex-1 bg-[#cac4d0]" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[#49454f]"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border-2 border-[#cac4d0] bg-white px-4 py-2.5 text-[#1c1b1f] outline-none focus:border-[#6750a4]"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[#49454f]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border-2 border-[#cac4d0] bg-white px-4 py-2.5 pr-12 text-[#1c1b1f] outline-none focus:border-[#6750a4]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#49454f] transition-colors hover:bg-black/5"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {mode === "signup" && (
                <div>
                  <label
                    htmlFor="confirm-password"
                    className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-[#49454f]"
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-2xl border-2 border-[#cac4d0] bg-white px-4 py-2.5 text-[#1c1b1f] outline-none focus:border-[#6750a4]"
                  />
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-full bg-[#6750a4] py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-[#5a4491] hover:shadow-lg disabled:opacity-50"
              >
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-[#49454f]">
          {mode === "signin"
            ? "Don't have an account?"
            : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setConfirmPassword("");
              setMode(mode === "signin" ? "signup" : "signin");
            }}
            className="font-semibold text-[#6750a4] hover:underline"
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      </main>
    </div>
  );
}
