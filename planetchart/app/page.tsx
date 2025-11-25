"use client";

import CryptoPlanets from "./components/CryptoPlanets";

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-start py-10 px-4">
      <header className="w-full max-w-6xl flex flex-col gap-2 mb-6 text-center md:text-left">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          CryptoPlanets
        </h1>
        <p className="text-sm md:text-base text-zinc-400 max-w-2xl">
          A galaxy map of chains and tokens inspired by Coin360 &amp; CryptoBubbles.
        </p>
      </header>
      <section className="w-full max-w-6xl flex-1 flex flex-col gap-4">
        <CryptoPlanets />
      </section>
    </main>
  );
}
