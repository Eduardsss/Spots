import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoadScript, GoogleMap, Marker, InfoWindow } from "@react-google-maps/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Edit3, Heart, Loader2, MapPinPlus, Trash2 } from "lucide-react";

import { api } from "@/lib/api";
import { convertFileToBase64 } from "@/lib/files";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Spot, SpotStatus } from "@/types";

const libraries: ("places")[] = [];
const defaultCenter = { lat: 56.9496, lng: 24.1052 };

type SpotFormState = {
  name: string;
  description: string;
  status: SpotStatus;
  image?: string | null;
};

export function MapPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [createLocation, setCreateLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [formState, setFormState] = useState<SpotFormState>({
    name: "",
    description: "",
    status: "public",
    image: null,
  });
  const [loading, setLoading] = useState(false);
  const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);
  const [likeLoadingId, setLikeLoadingId] = useState<number | null>(null);

  const googleMapsKey =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyAePRmVmcUEaHEGXBd1rloxy38ZH_N748k";
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: googleMapsKey,
    libraries,
  });

  const fetchSpots = useCallback(async () => {
    const { data } = await api.get<Spot[]>("/spots");
    setSpots(data);
  }, []);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots, user]);

  useEffect(() => {
    const spotIdParam = searchParams.get("spotId");
    if (!spotIdParam) return;
    const spot = spots.find((s) => s.id === Number(spotIdParam));
    if (spot && mapRef) {
      mapRef.panTo({ lat: Number(spot.lat), lng: Number(spot.lng) });
      mapRef.setZoom(14);
      setSelectedSpot(spot);
    }
  }, [searchParams, spots, mapRef]);

  const onMapClick = useCallback(
    (event: google.maps.MapMouseEvent) => {
      if (!user) {
        navigate("/login");
        return;
      }
      if (!event.latLng) return;
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      setCreateLocation({ lat, lng });
      setFormState({ name: "", description: "", status: "public", image: null });
      setIsCreateOpen(true);
    },
    [user, navigate]
  );

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createLocation) return;
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) ?? "";
    const status = (formData.get("status") as SpotStatus) ?? "public";
    const imageFile = formData.get("image") as File | null;

    try {
      setLoading(true);
      let encoded: string | null = null;
      if (imageFile && imageFile.size > 0) {
        encoded = await convertFileToBase64(imageFile);
      }
      const { data } = await api.post<Spot>("/spots", {
        name,
        description,
        status,
        image: encoded,
        lat: createLocation.lat,
        lng: createLocation.lng,
      });
      setSpots((prev) => [data, ...prev]);
      setIsCreateOpen(false);
      setCreateLocation(null);
    } catch (error) {
      console.error("Failed to create spot", error);
    } finally {
      setLoading(false);
    }
  };

  const updateSpotState = useCallback((updatedSpot: Spot) => {
    setSpots((prev) => {
      const exists = prev.some((spot) => spot.id === updatedSpot.id);
      if (exists) {
        return prev.map((spot) => (spot.id === updatedSpot.id ? updatedSpot : spot));
      }
      return [updatedSpot, ...prev];
    });
    setSelectedSpot((prev) => (prev && prev.id === updatedSpot.id ? updatedSpot : prev));
  }, []);

  const handleDelete = async (spot: Spot) => {
    if (!user) return;
    if (!confirm(`Vai tiešām dzēst spotu "${spot.name}"?`)) return;
    try {
      await api.delete(`/spots/${spot.id}`);
      setSpots((prev) => prev.filter((s) => s.id !== spot.id));
      setSelectedSpot((prev) => (prev && prev.id === spot.id ? null : prev));
    } catch (error) {
      console.error("Failed to delete spot", error);
    }
  };

  const handleToggleLike = useCallback(
    async (spot: Spot) => {
      if (!user) {
        navigate("/login");
        return;
      }
      if (spot.status !== "public") return;

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
        updateSpotState(updated);
      } catch (error) {
        console.error("Failed to toggle like", error);
      } finally {
        setLikeLoadingId(null);
      }
    },
    [navigate, updateSpotState, user]
  );

  const openEdit = useCallback((spot: Spot) => {
    setSelectedSpot(spot);
    setFormState({
      name: spot.name,
      description: spot.description,
      status: spot.status,
      image: spot.image,
    });
    setIsEditOpen(true);
  }, []);

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
      let encoded: string | null | undefined = formState.image ?? null;
      if (imageFile && imageFile.size > 0) {
        encoded = await convertFileToBase64(imageFile);
      }
      const { data } = await api.put<Spot>(`/spots/${selectedSpot.id}`, {
        name,
        description,
        status,
        image: encoded,
      });
      setSpots((prev) => prev.map((spot) => (spot.id === data.id ? data : spot)));
      setSelectedSpot(data);
      setIsEditOpen(false);
    } catch (error) {
      console.error("Failed to edit spot", error);
    } finally {
      setLoading(false);
    }
  };

  const renderMap = useMemo(() => {
    if (!googleMapsKey) {
      return (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-3 rounded-[3rem] border border-dashed border-primary/40 bg-primary/5 text-center text-sm text-muted-foreground">
          <p>Nav norādīta Google Maps API atslēga.</p>
          <p>Iestati <code>VITE_GOOGLE_MAPS_API_KEY</code> failā <code>.env</code>, lai aktivizētu karti.</p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="flex h-[70vh] items-center justify-center text-destructive">
          Neizdevās ielādēt Google karti. Pārbaudi API atslēgu.
        </div>
      );
    }

    if (!isLoaded) {
      return (
        <div className="flex h-[70vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <GoogleMap
        mapContainerClassName="h-[70vh] w-full rounded-[3rem] border border-border shadow-xl"
        center={defaultCenter}
        zoom={6}
        onLoad={(map) => setMapRef(map)}
        onClick={onMapClick}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          styles: [
            {
              featureType: "poi",
              stylers: [{ visibility: "off" }],
            },
          ],
        }}
      >
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            position={{ lat: Number(spot.lat), lng: Number(spot.lng) }}
            onClick={() => setSelectedSpot(spot)}
            icon={
              spot.status === "public"
                ? {
                    url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                  }
                : {
                    url: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
                  }
            }
          />
        ))}
        {selectedSpot && (
          <InfoWindow
            position={{ lat: Number(selectedSpot.lat), lng: Number(selectedSpot.lng) }}
            onCloseClick={() => setSelectedSpot(null)}
          >
            <div className="max-w-[260px] space-y-3 text-sm">
              <h3 className="text-lg font-semibold">{selectedSpot.name}</h3>
              <p className="text-muted-foreground">{selectedSpot.description}</p>
              {selectedSpot.image && (
                <img
                  src={selectedSpot.image}
                  alt={selectedSpot.name}
                  className="h-32 w-full rounded-2xl object-cover"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Statuss: {selectedSpot.status === "public" ? "Publisks" : "Privāts"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {selectedSpot.status === "public" && (
                  <Button
                    size="sm"
                    variant={selectedSpot.liked_by_me ? "secondary" : "outline"}
                    onClick={() => handleToggleLike(selectedSpot)}
                    disabled={likeLoadingId === selectedSpot.id}
                    className="flex items-center gap-1"
                  >
                    <Heart
                      className={`h-4 w-4 ${selectedSpot.liked_by_me ? "fill-current text-rose-500" : ""}`}
                    />
                    {selectedSpot.like_count}
                  </Button>
                )}
                {user?.id === selectedSpot.user_id && (
                  <Button size="sm" onClick={() => openEdit(selectedSpot)}>
                    <Edit3 className="mr-1 h-4 w-4" /> Labot
                  </Button>
                )}
                {(user?.id === selectedSpot.user_id || user?.is_admin) && (
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(selectedSpot)}>
                    <Trash2 className="mr-1 h-4 w-4" /> Dzēst
                  </Button>
                )}
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    );
  }, [
    googleMapsKey,
    handleDelete,
    handleToggleLike,
    isLoaded,
    likeLoadingId,
    loadError,
    onMapClick,
    openEdit,
    spots,
    selectedSpot,
    user,
  ]);

  const renderDialogFields = () => (
    <div className="space-y-4 text-left">
      <div className="space-y-2">
        <Label htmlFor="name">Nosaukums</Label>
        <Input id="name" name="name" defaultValue={formState.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Apraksts</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={formState.description}
          placeholder="Apraksti šo spotu un tā noskaņu"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="image">Attēls</Label>
        <Input id="image" name="image" type="file" accept="image/*" />
        {formState.image && (
          <img src={formState.image} alt="Spot preview" className="mt-2 h-24 w-full rounded-2xl object-cover" />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="status">Statuss</Label>
        <select
          id="status"
          name="status"
          defaultValue={formState.status}
          className="flex h-11 w-full rounded-full border border-input bg-background px-5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <option value="public">Publisks</option>
          <option value="private">Privāts</option>
        </select>
      </div>
    </div>
  );

  return (
    <section className="container space-y-8 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Spotu karte</h1>
          <p className="text-sm text-muted-foreground">
            Klikšķini uz kartes, lai pievienotu jaunu spotu. Publiskie spoti redzami visiem, privātie tikai tev.
          </p>
        </div>
        <Button
          onClick={() => {
            if (!user) {
              navigate("/login");
              return;
            }
            setCreateLocation(defaultCenter);
            setFormState({ name: "", description: "", status: "public", image: null });
            setIsCreateOpen(true);
          }}
        >
          <MapPinPlus className="mr-2 h-5 w-5" /> Pievienot spotu
        </Button>
      </div>
      {renderMap}

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setCreateLocation(null);
          }
        }}
      >
        <DialogContent>
          <form className="space-y-5" onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Jauns spotz</DialogTitle>
            </DialogHeader>
            {renderDialogFields()}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Atcelt
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saglabāt"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <form className="space-y-5" onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>Rediģēt spotu</DialogTitle>
            </DialogHeader>
            {renderDialogFields()}
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
    </section>
  );
}
