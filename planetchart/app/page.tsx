"use client";

import { Suspense } from "react";
import CryptoPlanets from "./components/CryptoPlanets";

// Loading fallback for Suspense
function GalaxyLoading() {
  return (
    <div className="w-full h-screen bg-black flex items-center justify-center text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
        <p className="text-white/60">Loading Crypto Galaxy...</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-start py-10 px-4">
      <section className="w-full flex-1 flex flex-col gap-4 max-h-[calc(100vh-10rem)]">
        <Suspense fallback={<GalaxyLoading />}>
          <CryptoPlanets />
        </Suspense>
      </section>
    </main>
  );
}
