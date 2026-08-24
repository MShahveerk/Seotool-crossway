"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid reset token");
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invalid reset token");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to reset password");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-black">Password Reset!</h2>
          <p className="text-gray-600 dark:text-gray-800 mb-4">
            Your password has been successfully reset. Redirecting to login...
          </p>
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white dark:bg-gray-100 shadow-xl rounded-xl border border-gray-200 dark:border-gray-300 p-8 text-center">
          <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-black">Invalid Token</h2>
          <p className="text-gray-600 dark:text-gray-800 mb-4">
            The reset token is missing or invalid.
          </p>
          <Link
            href="/forgot-password"
            className="inline-block text-gray-900 dark:text-black hover:text-gray-700 dark:hover:text-gray-700 font-semibold"
          >
            Request a new reset link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white dark:bg-gray-100 shadow-xl rounded-xl border border-gray-200 dark:border-gray-300 p-8">
        <h1 className="text-3xl font-bold mb-2 text-center text-gray-900 dark:text-black">Reset Password</h1>
        <p className="text-gray-600 dark:text-gray-800 mb-8 text-center text-sm">
          Enter your new password below
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-semibold text-gray-900 dark:text-black mb-2"
            >
              New Password <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              type="password"
              required
              placeholder="At least 6 characters"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-400 bg-white dark:bg-gray-50 px-3 py-2.5 text-sm md:text-base text-black dark:text-black placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:border-gray-400 dark:focus:border-gray-500 transition-all duration-150"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-semibold text-gray-900 dark:text-black mb-2"
            >
              Confirm New Password <span className="text-red-500">*</span>
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              placeholder="Confirm your password"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-400 bg-white dark:bg-gray-50 px-3 py-2.5 text-sm md:text-base text-black dark:text-black placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:border-gray-400 dark:focus:border-gray-500 transition-all duration-150"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
          >
            {loading ? (
              <>
                <span className="mr-2 h-4 w-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                Resetting...
              </>
            ) : (
              "Reset Password"
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 border-2 border-gray-400 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
          </div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
