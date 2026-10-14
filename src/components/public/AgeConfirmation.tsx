"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "actrezz-age-confirmed";
const COOKIE_NAME = "actrezz_age_confirmed";
const CONFIRMATION_DAYS = 365;

function hasConfirmation() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
      || document.cookie.split(";").some((cookie) => cookie.trim() === `${COOKIE_NAME}=1`);
  } catch {
    return false;
  }
}

/**
 * A lightweight, first-visit age gate. The confirmation is deliberately kept
 * on the visitor's device, so it does not create accounts or track identity.
 */
export function AgeConfirmation() {
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setConfirmed(hasConfirmation());
    setChecked(true);
  }, []);

  useEffect(() => {
    if (!checked || confirmed) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [checked, confirmed]);

  const continueToSite = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
      document.cookie = `${COOKIE_NAME}=1; Max-Age=${CONFIRMATION_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax; Secure`;
    } catch {
      // The current tab still remains open if browser storage is unavailable.
    }
    setConfirmed(true);
  };

  const leaveSite = () => {
    window.location.replace("https://www.google.com/");
  };

  if (!checked || confirmed) return null;

  return (
    <div
      data-popunder-exclude="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-confirmation-title"
      aria-describedby="age-confirmation-description"
      className="fixed inset-0 z-[2000] grid place-items-center bg-black/80 p-4 backdrop-blur-md"
    >
      <section className="w-full max-w-[525px] overflow-hidden rounded-xl border border-white/10 bg-[#191919] shadow-2xl shadow-black/70">
        <header className="bg-black px-6 py-7 sm:px-9">
          <h1 id="age-confirmation-title" className="text-2xl font-medium tracking-tight text-white sm:text-3xl">AGE CONFIRMATION</h1>
        </header>
        <div className="px-6 py-9 sm:px-9">
          <p id="age-confirmation-description" className="text-base leading-6 text-zinc-300">
            This website contains adult content.<br />
            <strong className="font-semibold text-white">Are you 18 years or older?</strong>
          </p>
          <div className="mt-7 grid grid-cols-2 gap-4">
            <button type="button" onClick={continueToSite} className="min-h-12 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">
              CONTINUE
            </button>
            <button type="button" onClick={leaveSite} className="min-h-12 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">
              EXIT
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
