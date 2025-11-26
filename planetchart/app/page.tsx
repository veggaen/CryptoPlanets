"use client";

import CryptoPlanets from "./components/CryptoPlanets";

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-start py-10 px-4">
      <section className="w-full flex-1 flex flex-col gap-4 max-h-[calc(100vh-10rem)]">
        <CryptoPlanets />
      </section>
    </main>
  );
}
