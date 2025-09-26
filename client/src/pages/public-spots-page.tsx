import { useEffect, useState } from "react";
import { MapPinned } from "lucide-react";

import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Spot } from "@/types";

export function PublicSpotsPage() {
  const [spots, setSpots] = useState<Spot[]>([]);

  useEffect(() => {
    api.get<Spot[]>("/spots/public").then((response) => setSpots(response.data));
  }, []);

  return (
    <section className="container space-y-10 py-12">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold">Publiskie Spotz</h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Atlasi izcelotos ceļojumu galamērķus un apskati, ko kopiena ir atradusi. Booking.com stila kartītes ar bildēm un aprakstiem
          sniedz ātru pārskatu par to, kas gaida tevi nākamajā piedzīvojumā.
        </p>
      </div>
      <div className="card-grid">
        {spots.map((spot) => (
          <Card key={spot.id} className="overflow-hidden">
            {spot.image ? (
              <img src={spot.image} alt={spot.name} className="h-48 w-full object-cover" />
            ) : (
              <div className="flex h-48 items-center justify-center bg-muted text-muted-foreground">
                <MapPinned className="h-10 w-10" />
              </div>
            )}
            <CardHeader>
              <CardTitle>{spot.name}</CardTitle>
              <CardDescription>
                {spot.description || "Bez apraksta"}
                <span className="mt-2 block text-xs text-muted-foreground">Autors: {spot.username}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl bg-primary/10 p-4 text-sm text-primary">
                Koordinātes: {Number(spot.lat).toFixed(4)}, {Number(spot.lng).toFixed(4)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {spots.length === 0 && (
        <p className="text-center text-muted-foreground">
          Pagaidām publisko spotu nav. Esi pirmais, kas pievieno!
        </p>
      )}
    </section>
  );
}
