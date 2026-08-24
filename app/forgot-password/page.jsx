"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthGuideButton } from "../components/ui-shared/PageGuide";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to send reset email");
        return;
      }

      setSuccess(true);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white dark:bg-gray-100 shadow-xl rounded-xl border border-gray-200 dark:border-gray-300 p-8 text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full" style={{ backgroundColor: 'oklch(37.3% 0.034 259.733 / 0.2)' }}>
              <svg
                className="w-8 h-8"
                style={{ color: 'oklch(37.3% 0.034 259.733)' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-black">Check your email</h2>
          <p className="text-gray-600 dark:text-gray-800 mb-6">
            If an account with that email exists, we&apos;ve sent a password reset
            link. Please check your inbox.
          </p>
          <Link
            href="/login"
            className="inline-block text-gray-900 dark:text-black hover:text-gray-700 dark:hover:text-gray-700 font-semibold"
          >
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white dark:bg-gray-100 shadow-xl rounded-xl border border-gray-200 dark:border-gray-300 p-8">
        <h1 className="text-3xl font-bold mb-2 text-center text-gray-900 dark:text-black">
          Forgot Password
        </h1>
        <div className="mb-6 flex justify-center">
          <AuthGuideButton pathname="/forgot-password" />
        </div>
        <p className="text-gray-600 dark:text-gray-800 mb-8 text-center text-sm">
          Enter your email address and we&apos;ll send you a link to reset your
          password
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div data-guide="auth-email">
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-gray-900 dark:text-black mb-2"
            >
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="your@email.com"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-400 bg-white dark:bg-gray-50 px-3 py-2.5 text-sm md:text-base text-black dark:text-black placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:border-gray-400 dark:focus:border-gray-500 transition-all duration-150"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-300 bg-red-50 dark:bg-red-100 px-4 py-3 text-sm text-red-800 dark:text-red-900">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-lg bg-[#00A3FF] px-4 py-2.5 text-sm md:text-base font-semibold text-black shadow-md hover:shadow-lg hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
            data-guide="auth-submit"
          >
            {loading ? (
              <>
                <span className="mr-2 h-4 w-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              "Send Reset Link"
            )}
          </button>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-gray-700 dark:text-gray-800 hover:text-gray-900 dark:hover:text-black font-medium"
            >
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

