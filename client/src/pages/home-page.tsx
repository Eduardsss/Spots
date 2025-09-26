import { Link } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";

import { Button } from "@/components/ui/button";

const highlights = [
  {
    title: "Atklāj noslēptās vietas",
    description: "Pārlūko kopienas veidotus spotus ar fotogrāfijām, aprakstiem un precīzām lokācijām.",
  },
  {
    title: "Veido savu ceļvedi",
    description: "Saglabā privātas piezīmes vai padari savus iecienītākos spotus publiski pieejamus citiem ceļotājiem.",
  },
  {
    title: "Booking.com iedvesmota pieredze",
    description: "Elegants dizains, gaišā un tumšā režīma atbalsts un mūsdienīga navigācija katrai ierīcei.",
  },
];

export function HomePage() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1600&q=80')] bg-cover bg-center" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-sky-900/40" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col items-start justify-center gap-12 px-6 py-24 text-white">
        <div className="glass-card max-w-3xl bg-white/10 p-12 text-left shadow-2xl backdrop-blur">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1 text-sm uppercase tracking-widest">
            <Star className="h-4 w-4 text-amber-300" /> Jaunākais spotu ceļvedis Baltijā
          </p>
          <h1 className="text-5xl font-bold leading-tight md:text-6xl">
            Laipni lūgts <span className="text-sky-300">Spotz</span>
          </h1>
          <p className="mt-6 text-lg text-slate-100">
            Izpēti pasauli ar draugu un ceļotāju ieteikumiem. Spotz apvieno ceļojumu stāstus ar kartes funkcionalitāti, ļaujot tev
            atrast, plānot un dalīties ar vietām, kas patiesi iedvesmo.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="bg-sky-500 hover:bg-sky-500/90">
              <Link to="/map">
                Sākt <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="bg-white/20 text-white hover:bg-white/30">
              <Link to="/public">Apskatīt publiskos spotus</Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-white/20 bg-white/10 p-8 text-left shadow-xl backdrop-blur transition hover:-translate-y-1"
            >
              <h3 className="text-xl font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-sm text-slate-100/90">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
