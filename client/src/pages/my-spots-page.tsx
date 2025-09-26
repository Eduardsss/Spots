import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Edit3, Heart, Loader2, MapPinned, Trash2 } from "lucide-react";

import { api } from "@/lib/api";
import { convertFileToBase64 } from "@/lib/files";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Spot, SpotStatus } from "@/types";

export function MySpotsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const loadSpots = useCallback(async () => {
    if (!user) return;
    const { data } = await api.get<Spot[]>("/spots/mine");
    setSpots(data);
  }, [user]);

  useEffect(() => {
    loadSpots();
  }, [loadSpots]);

  const openEdit = (spot: Spot) => {
    setSelectedSpot(spot);
    setIsEditOpen(true);
  };

  const handleDelete = async (spot: Spot) => {
    if (!confirm(`Vai tiešām dzēst spotu "${spot.name}"?`)) return;
    try {
      await api.delete(`/spots/${spot.id}`);
      setSpots((prev) => prev.filter((item) => item.id !== spot.id));
    } catch (error) {
      console.error("Failed to delete spot", error);
    }
  };

  const handleEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSpot) return;
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) ?? "";
    const status = (formData.get("status") as SpotStatus) ?? "public";
    const imageFile = formData.get("image") as File | null;

    try {
      setLoading(true);
      let encoded: string | null | undefined = selectedSpot.image ?? null;
      if (imageFile && imageFile.size > 0) {
        encoded = await convertFileToBase64(imageFile);
      }
      const { data } = await api.put<Spot>(`/spots/${selectedSpot.id}`, {
        name,
        description,
        status,
        image: encoded,
      });
      setSpots((prev) => prev.map((item) => (item.id === data.id ? data : item)));
      setSelectedSpot(data);
      setIsEditOpen(false);
    } catch (error) {
      console.error("Failed to update spot", error);
    } finally {
      setLoading(false);
    }
  };

  const selected = selectedSpot;

  const editDialog = useMemo(() => {
    if (!selected) return null;
    return (
      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setSelectedSpot(null);
          }
        }}
      >
        <DialogContent>
          <form className="space-y-5" onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>Rediģēt spotu</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-left">
              <div className="space-y-2">
                <Label htmlFor="name">Nosaukums</Label>
                <Input id="name" name="name" defaultValue={selected.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Apraksts</Label>
                <Textarea id="description" name="description" defaultValue={selected.description} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="image">Attēls</Label>
                <Input id="image" name="image" type="file" accept="image/*" />
                {selected.image && (
                  <img src={selected.image} alt={selected.name} className="mt-2 h-24 w-full rounded-2xl object-cover" />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Statuss</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={selected.status}
                  className="flex h-11 w-full rounded-full border border-input bg-background px-5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <option value="public">Publisks</option>
                  <option value="private">Privāts</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)}>
                Atcelt
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Edit3 className="mr-2 h-4 w-4" /> Saglabāt</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }, [isEditOpen, selected, loading]);

  if (!user) {
    return (
      <section className="container py-12 text-center">
        <h1 className="text-3xl font-semibold">Lūdzu, pieslēdzies</h1>
        <p className="mt-2 text-muted-foreground">Lai pārvaldītu savus spotus, nepieciešams autorizēties.</p>
      </section>
    );
  }

  return (
    <section className="container space-y-10 py-12">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold">Mani spoti</h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Rediģē, dzēs vai parādi kartē savus iecienītākos spotus. Viss, kas nepieciešams, atrodas vienā ērtā panelī.
        </p>
      </div>
      <div className="card-grid">
        {spots.map((spot) => (
          <Card key={spot.id} className="flex h-full flex-col overflow-hidden">
            {spot.image ? (
              <img src={spot.image} alt={spot.name} className="h-40 w-full object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center bg-muted text-muted-foreground">
                <MapPinned className="h-10 w-10" />
              </div>
            )}
            <CardHeader>
              <CardTitle>{spot.name}</CardTitle>
              <CardDescription>
                {spot.description || "Bez apraksta"}
                <span className="mt-2 block text-xs text-muted-foreground">
                  Statuss: {spot.status === "public" ? "Publisks" : "Privāts"}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">
                Koordinātes: {Number(spot.lat).toFixed(4)}, {Number(spot.lng).toFixed(4)}
              </div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1 text-xs text-muted-foreground">
                <Heart className={`h-3.5 w-3.5 ${spot.liked_by_me ? "fill-current text-rose-500" : ""}`} />
                {spot.like_count} patīk
              </div>
            </CardContent>
            <CardFooter className="mt-auto flex flex-col gap-3">
              <Button variant="destructive" onClick={() => handleDelete(spot)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete My Spot
              </Button>
              <Button variant="secondary" onClick={() => navigate(`/map?spotId=${spot.id}`)}>
                Show Spot
              </Button>
              <Button onClick={() => openEdit(spot)}>
                <Edit3 className="mr-2 h-4 w-4" /> Edit Spot
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {spots.length === 0 && (
        <p className="text-center text-muted-foreground">Vēl neesi izveidojis nevienu spotu.</p>
      )}
      {editDialog}
    </section>
  );
}
