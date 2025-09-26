import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Loader2, MapPinned, Search } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Spot } from "@/types";

export function PublicSpotsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"latest" | "most-liked">("latest");
  const [loading, setLoading] = useState(false);
  const [likeLoadingId, setLikeLoadingId] = useState<number | null>(null);

  const loadSpots = useCallback(
    async (query: string, order: "latest" | "most-liked") => {
      try {
        setLoading(true);
        const { data } = await api.get<Spot[]>("/spots/public", {
          params: {
            search: query.trim() ? query.trim() : undefined,
            sort: order,
          },
        });
        setSpots(data);
      } catch (error) {
        console.error("Failed to load public spots", error);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const handler = setTimeout(() => {
      loadSpots(search, sort);
    }, 300);

    return () => clearTimeout(handler);
  }, [loadSpots, search, sort]);

  const sortOptions: { value: "latest" | "most-liked"; label: string; description: string }[] = useMemo(
    () => [
      { value: "latest", label: "Jaunākie", description: "Rāda vispirms nesen pievienotos spotus." },
      {
        value: "most-liked",
        label: "Visvairāk atzīmētie",
        description: "Izcel tos spotus, kuri saņēmuši visvairāk sirsniņu.",
      },
    ],
    []
  );

  const handleToggleLike = useCallback(
    async (spot: Spot) => {
      if (!user) {
        navigate("/login");
        return;
      }

      try {
        setLikeLoadingId(spot.id);
        let updated: Spot;
        if (spot.liked_by_me) {
          const { data } = await api.delete<Spot>(`/spots/${spot.id}/likes`);
          updated = data;
        } else {
          const { data } = await api.post<Spot>(`/spots/${spot.id}/likes`);
          updated = data;
        }
        setSpots((prev) => {
          const next = prev.map((item) => (item.id === updated.id ? updated : item));
          if (sort === "most-liked") {
            return [...next].sort((a, b) => {
              if (b.like_count === a.like_count) {
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              }
              return b.like_count - a.like_count;
            });
          }
          return next;
        });
      } catch (error) {
        console.error("Failed to toggle like", error);
      } finally {
        setLikeLoadingId(null);
      }
    },
    [navigate, sort, user]
  );

  return (
    <section className="container space-y-10 py-12">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold">Publiskie Spotz</h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Iedvesmojies no kopienas iecienītākajām vietām, meklē konkrētus nosaukumus un kārto rezultātus pēc
          jaunākajām pievienotajām lokācijām vai sirsniņu skaita.
        </p>
      </div>

      <div className="grid gap-4 rounded-3xl border border-border bg-card/60 p-6 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Meklēt spotu pēc nosaukuma"
              className="w-full rounded-full pl-11"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sortOptions.map((option) => (
              <Button
                key={option.value}
                variant={sort === option.value ? "default" : "outline"}
                onClick={() => setSort(option.value)}
                className="rounded-full"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {sortOptions.find((option) => option.value === sort)?.description}
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Ielādē publiskos spotus...
        </div>
      ) : (
        <div className="card-grid">
          {spots.map((spot) => (
            <Card key={spot.id} className="flex h-full flex-col overflow-hidden">
              {spot.image ? (
                <img src={spot.image} alt={spot.name} className="h-48 w-full object-cover" />
              ) : (
                <div className="flex h-48 items-center justify-center bg-muted text-muted-foreground">
                  <MapPinned className="h-10 w-10" />
                </div>
              )}
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{spot.name}</CardTitle>
                    <CardDescription>
                      {spot.description || "Bez apraksta"}
                      <span className="mt-2 block text-xs text-muted-foreground">Autors: {spot.username}</span>
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant={spot.liked_by_me ? "secondary" : "outline"}
                    onClick={() => handleToggleLike(spot)}
                    disabled={likeLoadingId === spot.id}
                    className="h-9 rounded-full"
                  >
                    <Heart className={`mr-2 h-4 w-4 ${spot.liked_by_me ? "fill-current text-rose-500" : ""}`} />
                    {spot.like_count}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <div className="rounded-2xl bg-primary/10 p-4 text-sm text-primary">
                  Koordinātes: {Number(spot.lat).toFixed(4)}, {Number(spot.lng).toFixed(4)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && spots.length === 0 && (
        <p className="text-center text-muted-foreground">
          Pagaidām publisko spotu nav. Esi pirmais, kas pievieno!
        </p>
      )}
    </section>
  );
}
