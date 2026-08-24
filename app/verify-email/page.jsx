"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { AuthGuideButton } from "../components/ui-shared/PageGuide";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const missingTokenMessage = "No verification token provided. Please check the link from your email.";
  const initialHasToken = Boolean(token);

  const [status, setStatus] = useState(initialHasToken ? "verifying" : "error"); // verifying | success | already_verified | error
  const [message, setMessage] = useState(initialHasToken ? "" : missingTokenMessage);
  const [userName, setUserName] = useState("");
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (!token) {
      return;
    }

    async function verify() {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (res.ok) {
          if (data.alreadyVerified) {
            setStatus("already_verified");
            setMessage(data.message);
          } else {
            setStatus("success");
            setMessage(data.message);
            setUserName(data.user?.name || "");
          }
        } else {
          setStatus("error");
          setMessage(data.error || "Verification failed.");
        }
      } catch {
        setStatus("error");
        setMessage("An unexpected error occurred. Please try again.");
      }
    }

    verify();
  }, [token]);

  return (
    <main className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-center">
          <AuthGuideButton pathname="/verify-email" />
        </div>
        {/* Verifying State */}
        {status === "verifying" && (
          <div className="bg-white dark:bg-gray-100 shadow-xl rounded-xl border border-gray-200 dark:border-gray-300 p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 border-4 border-gray-200 border-t-[#00A3FF] rounded-full animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-black mb-2">
              Verifying Your Email
            </h1>
            <p className="text-gray-600 dark:text-gray-700 text-sm">
              Please wait while we verify your email address...
            </p>
          </div>
        )}

        {/* Success State */}
        {status === "success" && (
          <div className="bg-white dark:bg-gray-100 shadow-xl rounded-xl border border-gray-200 dark:border-gray-300 p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-black mb-2">
              Email Verified!
            </h1>
            {userName && (
              <p className="text-gray-700 dark:text-gray-800 font-medium mb-2">
                Welcome, {userName}!
              </p>
            )}
            <p className="text-gray-600 dark:text-gray-700 text-sm mb-8">
              {message}
            </p>
            <Link
              href="/login"
              data-guide="auth-submit"
              className="inline-flex items-center justify-center w-full rounded-lg bg-[#00A3FF] px-4 py-2.5 text-sm font-semibold text-black shadow-md hover:shadow-lg hover:bg-[#0077CC] transition-all duration-200"
            >
              Go to Login
            </Link>
          </div>
        )}

        {/* Already Verified State */}
        {status === "already_verified" && (
          <div className="bg-white dark:bg-gray-100 shadow-xl rounded-xl border border-gray-200 dark:border-gray-300 p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-black mb-2">
              Already Verified
            </h1>
            <p className="text-gray-600 dark:text-gray-700 text-sm mb-8">
              {message}
            </p>
            <Link
              href="/login"
              data-guide="auth-submit"
              className="inline-flex items-center justify-center w-full rounded-lg bg-[#00A3FF] px-4 py-2.5 text-sm font-semibold text-black shadow-md hover:shadow-lg hover:bg-[#0077CC] transition-all duration-200"
            >
              Go to Login
            </Link>
          </div>
        )}

        {/* Error State */}
        {status === "error" && (
          <div className="bg-white dark:bg-gray-100 shadow-xl rounded-xl border border-gray-200 dark:border-gray-300 p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-black mb-2">
              Verification Failed
            </h1>
            <p className="text-gray-600 dark:text-gray-700 text-sm mb-8">
              {message}
            </p>
            <div className="space-y-3">
              <Link
                href="/login"
                data-guide="auth-submit"
                className="inline-flex items-center justify-center w-full rounded-lg bg-[#00A3FF] px-4 py-2.5 text-sm font-semibold text-black shadow-md hover:shadow-lg hover:bg-[#0077CC] transition-all duration-200"
              >
                Go to Login
              </Link>
              <p className="text-xs text-gray-500 dark:text-gray-600">
                If your link has expired, please contact your administrator to resend the verification email.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white dark:bg-gray-50 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md bg-white dark:bg-gray-100 shadow-xl rounded-xl border border-gray-200 dark:border-gray-300 p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="h-16 w-16 border-4 border-gray-200 border-t-[#00A3FF] rounded-full animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-black mb-2">Loading...</h1>
          </div>
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
