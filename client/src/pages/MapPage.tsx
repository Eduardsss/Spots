import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  GoogleMap,
  DirectionsRenderer,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from '@react-google-maps/api';
import { SpotComments } from '../components/SpotComments';
import { SpotGallery } from '../components/SpotGallery';
import { SpotFormModal, type SpotFormValues, type SpotFormSubmission } from '../components/SpotFormModal';
import { apiFetch } from '../lib/api';
import {
  areTagListsEqual,
  mergeTagLists,
  MAX_TAGS_PER_SPOT,
  normalizeTagName,
} from '../lib/tags';
import { palette, radii, shadows, transitions } from '../styles/theme';

// Kartes lapā apvieno Google Maps karti, spotu sarakstu un iespēju veidot/rediģēt savus punktus.
type AuthUser = {
  id: number;
  username: string;
  role: string;
  profile_image?: string | null;
};

type Spot = {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  image: string | null;
  images: string[];
  lat: number;
  lng: number;
  status: 'public' | 'private';
  likesCount: number;
  likedByCurrentUser?: boolean;
  visitedByCurrentUser?: boolean;
  visitedAt?: string | null;
  owner: {
    id: number;
    username: string;
    profile_image: string | null;
  };
  tags: string[];
};

type OwnerOption = {
  id: number;
  username: string;
};

type SpotFormState =
  | {
      mode: 'create';
      position: { lat: number; lng: number };
      values: SpotFormValues;
    }
  | {
      mode: 'edit';
      spot: Spot;
      values: SpotFormValues;
    };

type SpotsResponse = {
  spots: Spot[];
};

type CreateSpotResponse = {
  spot: Spot;
};

type UpdateSpotResponse = {
  spot: Spot;
};

type NearbySpot = Spot & {
  distance: number;
};

type NearbySpotsResponse = {
  spots: Array<Spot & { distance?: number }>;
};

type NotificationState = {
  type: 'success' | 'error';
  message: string;
};

type TagsResponse = {
  tags: string[];
};

type VisitResponse = {
  success: boolean;
  visited: boolean;
  visitedAt: string | null;
  alreadyVisited?: boolean;
};

type RemoveVisitResponse = {
  success: boolean;
  visited: boolean;
  alreadyVisited?: boolean;
};

type StreakResponse = {
  success: boolean;
  currentStreak: number;
  longestStreak: number;
  todayVisited: boolean;
  lastVisitedAt: string | null;
  nextMilestone: number;
  totalUniqueDays: number;
};

type StreakInfo = {
  currentStreak: number;
  longestStreak: number;
  todayVisited: boolean;
  lastVisitedAt: string | null;
  nextMilestone: number;
  totalUniqueDays: number;
};

const formatVisitedDate = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('lv-LV', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const mapStreakResponse = (response: StreakResponse): StreakInfo => ({
  currentStreak: Math.max(0, Number(response.currentStreak ?? 0)),
  longestStreak: Math.max(0, Number(response.longestStreak ?? 0)),
  todayVisited: Boolean(response.todayVisited),
  lastVisitedAt: response.lastVisitedAt ?? null,
  nextMilestone: Math.max(
    1,
    Number(
      response.nextMilestone ?? Number(response.currentStreak ?? 0) + 1
    )
  ),
  totalUniqueDays: Math.max(0, Number(response.totalUniqueDays ?? 0)),
});

const mergeOwnerLists = (current: OwnerOption[], incoming: OwnerOption[]): OwnerOption[] => {
  // Apvieno īpašnieku sarakstus, lai dropdown vienmēr saturētu jaunākos vārdus.
  if (!incoming.length) {
    return current;
  }

  const map = new Map<number, OwnerOption>();
  current.forEach((owner) => {
    map.set(owner.id, owner);
  });

  let changed = false;
  incoming.forEach((owner) => {
    if (!map.has(owner.id) || map.get(owner.id)?.username !== owner.username) {
      map.set(owner.id, owner);
      changed = true;
    }
  });

  if (!changed) {
    return current;
  }

  return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username));
};

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
};

const MAP_WRAPPER_STYLE: CSSProperties = {
  height: '100%',
  width: '100%',
  borderRadius: radii.xl,
  overflow: 'hidden',
  boxShadow: shadows.medium,
  border: `1px solid ${palette.border}`,
  transition: `box-shadow ${transitions.base}, border-color ${transitions.base}`,
};

const DEFAULT_CENTER = { lat: 56.9496, lng: 24.1052 };

const mapContainerStyle: CSSProperties = { width: '100%', height: '100%' };

// Nolasa lietotāju no localStorage, lai zinātu kuras darbības ir atļautas.
function parseStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem('user');
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as AuthUser;
  } catch (error) {
    console.warn('Failed to parse stored user', error);
    return null;
  }
}

export default function MapPage() {
  const location = useLocation();
  // Galvenie stāvokļi, kas kontrolē kartes izvēlētās vietas, filtrus un formu.
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => parseStoredUser());
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const [formState, setFormState] = useState<SpotFormState | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'public' | 'private' | 'mine'>('all');
  const [ownerFilter, setOwnerFilter] = useState<'any' | 'me' | number>('any');
  const [tagFilterInput, setTagFilterInput] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [nearbySpots, setNearbySpots] = useState<NearbySpot[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState('');
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [visitedMutationId, setVisitedMutationId] = useState<number | null>(null);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [streakError, setStreakError] = useState('');
  const [spotIdFromQuery, setSpotIdFromQuery] = useState<number | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [directionsResult, setDirectionsResult] =
    useState<google.maps.DirectionsResult | null>(null);
  const [directionsSpotId, setDirectionsSpotId] = useState<number | null>(null);
  const [directionsLoadingSpotId, setDirectionsLoadingSpotId] = useState<number | null>(null);
  const [directionsError, setDirectionsError] = useState('');
  const [directionsErrorSpotId, setDirectionsErrorSpotId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const ownerIdForQuery = useMemo(() => {
    if (ownerFilter === 'me') {
      return currentUser ? String(currentUser.id) : '';
    }

    if (typeof ownerFilter === 'number') {
      return Number.isNaN(ownerFilter) ? '' : String(ownerFilter);
    }

    return '';
  }, [ownerFilter, currentUser]);

  const spotsQuery = useMemo(() => {
    const params = new URLSearchParams();

    if (statusFilter === 'mine') {
      if (currentUser) {
        params.set('status', 'mine');
      }
    } else if (statusFilter === 'public' || statusFilter === 'private') {
      params.set('visibility', statusFilter);
    }

    if (ownerIdForQuery) {
      params.set('ownerId', ownerIdForQuery);
    }

    if (tagFilter) {
      params.set('tag', tagFilter);
    }

    return params.toString();
  }, [statusFilter, ownerIdForQuery, tagFilter, currentUser]);

  const spotsEndpoint = useMemo(
    () => (spotsQuery ? `/spots?${spotsQuery}` : '/spots'),
    [spotsQuery]
  );

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'spotz-map-loader',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  });

  const requestUserLocation = useCallback(() => {
    // Pieprasa lietotāja atrašanās vietu, lai atrastu tuvākos spotus.
    setIsRequestingLocation(true);

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocationError('Neizdevās noteikt atrašanās vietu. Lūdzu, ieslēdz GPS vai atļauj piekļuvi.');
      setIsRequestingLocation(false);
      setNearbySpots([]);
      setNearbyError('');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(coords);
        setLocationError('');
        setNearbyError('');
        setIsRequestingLocation(false);
      },
      (error) => {
        console.warn('Failed to retrieve user location', error);
        setLocationError('Neizdevās noteikt atrašanās vietu. Lūdzu, ieslēdz GPS vai atļauj piekļuvi.');
        setIsRequestingLocation(false);
        setNearbySpots([]);
        setNearbyError('');
      },
      { enableHighAccuracy: false, maximumAge: 60_000 }
    );
  }, []);

  const fetchNearbySpots = useCallback(async () => {
    if (!userLocation || !discoveryMode) {
      return;
    }

    setNearbyLoading(true);
    setNearbyError('');

    try {
      const params = new URLSearchParams({
        lat: String(userLocation.lat),
        lng: String(userLocation.lng),
        limit: '10',
      });

      if (discoveryMode) {
        params.set('discover', '1');
      }

      const response = await apiFetch<NearbySpotsResponse>(`/spots/nearby?${params.toString()}`);

      const normalized: NearbySpot[] = (response.spots ?? []).map((spot) => {
        const distanceValue = Number(spot.distance ?? 0);
        return {
          ...spot,
          visitedByCurrentUser: Boolean(spot.visitedByCurrentUser),
          visitedAt: spot.visitedAt ?? null,
          distance: Number.isFinite(distanceValue) ? distanceValue : 0,
        };
      });

      setNearbySpots(normalized);
    } catch (error) {
      console.error('Failed to load discovery spots', error);
      let message =
        error instanceof Error && error.message
          ? error.message
          : 'Neizdevās ielādēt atklāšanas režīma spotus. Lūdzu, mēģini vēlreiz.';
      const status = (error as { status?: number }).status;
      if (status === 401) {
        message = 'Atklāšanas režīms pieejams tikai pieteiktajiem lietotājiem.';
        setDiscoveryMode(false);
        setNotification({ type: 'error', message });
      }
      setNearbyError(message);
      setNearbySpots([]);
    } finally {
      setNearbyLoading(false);
    }
  }, [userLocation, discoveryMode]);

  useEffect(() => {
    // Nolasām URL parametrus, lai iespējotu dalīšanos ar konkrētu kartes skatu vai spotu.
    const params = new URLSearchParams(location.search);
    const latParam = parseFloat(params.get('lat') ?? '');
    const lngParam = parseFloat(params.get('lng') ?? '');
    const spotParam = parseInt(params.get('spotId') ?? '', 10);

    if (!Number.isNaN(latParam) && !Number.isNaN(lngParam)) {
      setCenter({ lat: latParam, lng: lngParam });
    }

    if (!Number.isNaN(spotParam)) {
      setSpotIdFromQuery(spotParam);
    } else {
      setSpotIdFromQuery(null);
    }
  }, [location.search]);

  useEffect(() => {
    if (!spotIdFromQuery) {
      return;
    }

    const targetSpot = spots.find((spot) => spot.id === spotIdFromQuery);
    if (!targetSpot) {
      return;
    }

    setCenter({ lat: targetSpot.lat, lng: targetSpot.lng });
    setSelectedSpotId(targetSpot.id);
    setSpotIdFromQuery(null);
  }, [spotIdFromQuery, spots]);

  //Šis ir nepieciešams, lai automātiski nolasītu lietotāja atrašanās vietu
  useEffect(() => {
    requestUserLocation();
  }, [requestUserLocation]);


  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'user') {
        setCurrentUser(parseStoredUser());
      }
      if (event.key === 'token' && !event.newValue) {
        setCurrentUser(null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setStreakInfo(null);
      setStreakError('');
      return;
    }

    let ignore = false;

    const loadStreak = async () => {
      try {
        const response = await apiFetch<StreakResponse>('/spots/visits/streak');
        if (!ignore) {
          setStreakInfo(mapStreakResponse(response));
          setStreakError('');
        }
      } catch (error) {
        if (!ignore) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : 'Neizdevās ielādēt streak datus.';
          setStreakInfo(null);
          setStreakError(message);
        }
      }
    };

    void loadStreak();

    return () => {
      ignore = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setStatusFilter((previous) => (previous === 'mine' || previous === 'private' ? 'all' : previous));
      setOwnerFilter((previous) => (previous === 'me' ? 'any' : previous));
      return;
    }

    setOwnerOptions((current) => {
      if (current.some((owner) => owner.id === currentUser.id)) {
        return current;
      }
      return mergeOwnerLists(current, [{ id: currentUser.id, username: currentUser.username }]);
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setDiscoveryMode(false);
      setNearbySpots([]);
      setNearbyError('');
    }
  }, [currentUser]);

  const refreshStreak = useCallback(async () => {
    if (!currentUser) {
      setStreakInfo(null);
      setStreakError('');
      return;
    }

    try {
      const response = await apiFetch<StreakResponse>('/spots/visits/streak');
      setStreakInfo(mapStreakResponse(response));
      setStreakError('');
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Neizdevās ielādēt streak datus.';
      setStreakInfo(null);
      setStreakError(message);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!userLocation || !discoveryMode) {
      return;
    }

    void fetchNearbySpots();
  }, [userLocation, discoveryMode, fetchNearbySpots]);

  useEffect(() => {
    let ignore = false;

    // Iegūstam pieejamos tagus, lai lietotājs varētu izvēlēties no populārajām birkām.
    const fetchTags = async () => {
      try {
        const response = await apiFetch<TagsResponse>('/spots/tags');
        if (!ignore && Array.isArray(response.tags)) {
          setAvailableTags(response.tags);
        }
      } catch (error) {
        if (!ignore) {
          setAvailableTags([]);
        }
      }
    };

    void fetchTags();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    // Sūta pieprasījumu ar aktīvajiem filtriem un atjauno kartes datus.
    const fetchSpots = async () => {
      setLoading(true);
      setFetchError('');
      setSelectedSpotId(null);
      try {
        const response = await apiFetch<SpotsResponse>(spotsEndpoint);
        if (!ignore) {
          const nextSpots = (response.spots ?? []).map((spot) => ({
            ...spot,
            visitedByCurrentUser: Boolean(spot.visitedByCurrentUser),
            visitedAt: spot.visitedAt ?? null,
          }));
          setSpots(nextSpots);

          if (nextSpots.length) {
            const collectedTags = nextSpots.flatMap((spot) => spot.tags ?? []);
            if (collectedTags.length) {
              setAvailableTags((current) => mergeTagLists(current, collectedTags));
            }

            const owners = nextSpots.map((spot) => ({
              id: spot.owner.id,
              username: spot.owner.username,
            }));
            setOwnerOptions((current) => mergeOwnerLists(current, owners));
          }
        }
      } catch (error) {
        if (!ignore) {
          const message =
            error instanceof Error ? error.message : 'Neizdevās ielādēt spotus. Lūdzu, mēģini vēlreiz.';
          setFetchError(message);
          setSpots([]);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void fetchSpots();

    return () => {
      ignore = true;
    };
  }, [spotsEndpoint]);

  useEffect(() => {
    if (!notification || typeof window === 'undefined') {
      return undefined;
    }

    const timeout = window.setTimeout(() => setNotification(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notification]);

  const selectedSpot = useMemo(
    () => (selectedSpotId ? spots.find((spot) => spot.id === selectedSpotId) ?? null : null),
    [selectedSpotId, spots]
  );

  const nearbySpotIds = useMemo(() => new Set<number>(nearbySpots.map((spot) => spot.id)), [nearbySpots]);

  const handleStatusFilterChange = (nextValue: string) => {
    // Nodrošina, ka filtrs pieņem tikai zināmās vērtības.
    if (nextValue === 'public' || nextValue === 'private' || nextValue === 'mine' || nextValue === 'all') {
      setStatusFilter(nextValue);
    }
  };

  const handleOwnerFilterChange = (nextValue: string) => {
    // Pārslēdz starp “visi”, “mani” vai konkrēta lietotāja ID.
    if (nextValue === 'any' || nextValue === 'me') {
      setOwnerFilter(nextValue);
      return;
    }

    const numeric = Number(nextValue);
    setOwnerFilter(Number.isNaN(numeric) ? 'any' : numeric);
  };

  const handleTagFilterApply = () => {
    // Saglabā tagu filtrā tikai tad, ja ievade nav tukša basicly neļauj tukšu lauku.
    const normalized = normalizeTagName(tagFilterInput);
    if (normalized) {
      setTagFilter(normalized);
      setTagFilterInput(normalized);
    } else {
      setTagFilter('');
      setTagFilterInput('');
    }
  };

  const handleTagFilterInputChange = (value: string) => {
    setTagFilterInput(value);
  };

  const handleTagFilterKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter nospiešana aktivizē filtra piemērošanu.
    if (event.key === 'Enter') {
      event.preventDefault();
      handleTagFilterApply();
    }
  };

  const handleClearFilters = () => {
    // Poga “Notīrīt filtrus” atgriež sākotnējos iestatījumus.
    setStatusFilter('all');
    setOwnerFilter('any');
    setTagFilter('');
    setTagFilterInput('');
  };

  const clearDirections = useCallback(() => {
    setDirectionsResult(null);
    setDirectionsSpotId(null);
    setDirectionsLoadingSpotId(null);
    setDirectionsError('');
    setDirectionsErrorSpotId(null);
  }, []);

  const handleMapClick = (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) {
      return;
    }

    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    setSelectedSpotId(null);
    clearDirections();
    setFormError('');
    setFormState({
      mode: 'create',
      position: { lat, lng },
      values: {
        name: '',
        description: '',
        status: 'public',
        image: null,
        images: [],
        tags: [],
      },
    });
  };

  const handleCloseForm = () => {
    setFormState(null);
    setFormError('');
    setFormSubmitting(false);
  };

  const handleCreateSubmit = async (values: SpotFormSubmission) => {
    if (formState?.mode !== 'create') {
      return;
    }

    if (!values.name) {
      setFormError('Nosaukums ir obligāts.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');

    try {
      const body = {
        name: values.name,
        description: values.description.trim() ? values.description.trim() : null,
        status: values.status,
        images: values.images,
        lat: formState.position.lat,
        lng: formState.position.lng,
        tags: values.tags,
      };

      const response = await apiFetch<CreateSpotResponse>('/spots', {
        method: 'POST',
        body,
      });

      const createdSpot = {
        ...response.spot,
        visitedByCurrentUser: Boolean(response.spot.visitedByCurrentUser),
        visitedAt: response.spot.visitedAt ?? null,
      };

      setSpots((current) => [...current, createdSpot]);
      setAvailableTags((current) => mergeTagLists(current, createdSpot.tags ?? []));
      handleCloseForm();
      setNotification({ type: 'success', message: 'Spots veiksmīgi pievienots.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās izveidot spotu.';
      setFormError(message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (values: SpotFormSubmission) => {
    if (formState?.mode !== 'edit') {
      return;
    }

    const target = formState.spot;
    const updates: Record<string, unknown> = {};

    if (values.name && values.name !== target.name) {
      updates.name = values.name;
    }

    const normalizedDescription = values.description.trim();
    if (normalizedDescription !== (target.description ?? '')) {
      updates.description = normalizedDescription ? normalizedDescription : null;
    }

    if (values.status !== target.status) {
      updates.status = values.status;
    }

    if (values.imagesChanged) {
      updates.images = values.images;
    }

    if (!areTagListsEqual(values.tags, target.tags ?? [])) {
      updates.tags = values.tags;
    }

    if (Object.keys(updates).length === 0) {
      setFormError('Nav izmaiņu, ko saglabāt.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');

    try {
      const response = await apiFetch<UpdateSpotResponse>(`/spots/${target.id}`, {
        method: 'PUT',
        body: updates,
      });

      const updatedSpot = {
        ...response.spot,
        visitedByCurrentUser: Boolean(response.spot.visitedByCurrentUser),
        visitedAt: response.spot.visitedAt ?? null,
      };

      setSpots((current) =>
        current.map((spot) => (spot.id === target.id ? updatedSpot : spot))
      );
      setAvailableTags((current) => mergeTagLists(current, updatedSpot.tags ?? []));
      handleCloseForm();
      setNotification({ type: 'success', message: 'Spots atjaunināts.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās atjaunināt spotu.';
      setFormError(message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteSpot = async (spot: Spot) => {
    if (!window.confirm(`Vai tiešām dzēst "${spot.name}"? Šo darbību nevarēs atsaukt.`)) {
      return;
    }

    try {
      await apiFetch(`/spots/${spot.id}`, { method: 'DELETE' });
      setSpots((current) => current.filter((item) => item.id !== spot.id));
      setNearbySpots((current) => current.filter((item) => item.id !== spot.id));
      setSelectedSpotId(null);
      setNotification({ type: 'success', message: 'Spots izdzēsts.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās dzēst spotu.';
      setNotification({ type: 'error', message });
    }
  };

  const handleShowDirections = useCallback(
    (spot: Spot) => {
      if (!isLoaded || typeof window === 'undefined' || !window.google?.maps) {
        return;
      }

      if (!userLocation) {
        setDirectionsResult(null);
        setDirectionsSpotId(null);
        setDirectionsLoadingSpotId(null);
        setDirectionsError('Lai parādītu maršrutu, lūdzu, atļauj piekļuvi savai atrašanās vietai.');
        setDirectionsErrorSpotId(spot.id);
        requestUserLocation();
        return;
      }

      setDirectionsLoadingSpotId(spot.id);
      setDirectionsError('');
      setDirectionsErrorSpotId(null);

      const service = new window.google.maps.DirectionsService();
      service.route(
        {
          origin: { lat: userLocation.lat, lng: userLocation.lng },
          destination: { lat: spot.lat, lng: spot.lng },
          travelMode: window.google.maps.TravelMode.WALKING,
        },
        (result, status) => {
          setDirectionsLoadingSpotId(null);

          if (status === 'OK' && result) {
            setDirectionsResult(result);
            setDirectionsSpotId(spot.id);
            const bounds = result.routes?.[0]?.bounds;
            if (bounds && mapInstance) {
              mapInstance.fitBounds(bounds);
            }
          } else {
            setDirectionsResult(null);
            setDirectionsSpotId(null);
            setDirectionsError('Neizdevās aprēķināt maršrutu. Lūdzu, mēģini vēlreiz.');
            setDirectionsErrorSpotId(spot.id);
          }
        }
      );
    },
    [isLoaded, mapInstance, requestUserLocation, userLocation]
  );

  const handleClearDirections = useCallback(() => {
    clearDirections();
    if (mapInstance && userLocation) {
      mapInstance.panTo(userLocation);
      mapInstance.setZoom(12);
    }
  }, [clearDirections, mapInstance, userLocation]);

  const handleToggleVisited = async (spot: Spot) => {
    if (!currentUser) {
      setNotification({
        type: 'error',
        message: 'Lai atzīmētu spotu kā apmeklētu, nepieciešams pieteikties.',
      });
      return;
    }

    const isVisited = Boolean(spot.visitedByCurrentUser);
    setVisitedMutationId(spot.id);

    try {
      if (isVisited) {
        await apiFetch<RemoveVisitResponse>(`/spots/${spot.id}/visit`, { method: 'DELETE' });

        setSpots((current) =>
          current.map((item) =>
            item.id === spot.id
              ? { ...item, visitedByCurrentUser: false, visitedAt: null }
              : item
          )
        );

        if (discoveryMode) {
          void fetchNearbySpots();
        }

        setNotification({ type: 'success', message: 'Apmeklējums noņemts.' });
      } else {
        const response = await apiFetch<VisitResponse>(`/spots/${spot.id}/visit`, {
          method: 'POST',
        });

        setSpots((current) =>
          current.map((item) =>
            item.id === spot.id
              ? {
                  ...item,
                  visitedByCurrentUser: true,
                  visitedAt: response.visitedAt ?? null,
                }
              : item
          )
        );

        setNearbySpots((current) => current.filter((item) => item.id !== spot.id));
        setNotification({ type: 'success', message: 'Spots atzīmēts kā apmeklēts!' });
      }

      await refreshStreak();
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Neizdevās atjaunināt apmeklējumu.';
      setNotification({ type: 'error', message });
    } finally {
      setVisitedMutationId(null);
    }
  };

  const handleToggleLike = async (spot: Spot) => {
    if (!currentUser) {
      setNotification({ type: 'error', message: 'Lai pievienotu patīk, nepieciešams pieteikties.' });
      return;
    }

    const liked = Boolean(spot.likedByCurrentUser);
    setSpots((current) =>
      current.map((item) =>
        item.id === spot.id
          ? {
              ...item,
              likedByCurrentUser: !liked,
              likesCount: Math.max(0, item.likesCount + (liked ? -1 : 1)),
            }
          : item
      )
    );

    try {
      if (liked) {
        await apiFetch(`/spots/${spot.id}/like`, { method: 'DELETE' });
      } else {
        await apiFetch(`/spots/${spot.id}/like`, { method: 'POST' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neizdevās atjaunināt patīk reakciju.';
      setSpots((current) => current.map((item) => (item.id === spot.id ? spot : item)));
      setNotification({ type: 'error', message });
    }
  };

  const handleShareSpot = async (spot: Spot) => {
    if (typeof window === 'undefined') {
      return;
    }

    const shareUrl = `${window.location.origin}/public?spotId=${spot.id}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setNotification({ type: 'success', message: 'Saite uz spotu ir nokopēta.' });
        return;
      }

      throw new Error('Starpliktuves API nav pieejams');
    } catch (error) {
      console.warn('Clipboard write failed', error);
      window.prompt('Kopējiet šo saiti ar draugiem:', shareUrl);
      setNotification({ type: 'success', message: 'Saite sagatavota kopēšanai.' });
    }
  };

  const handleReportSpot = async (spot: Spot) => {
    if (!currentUser) {
      setNotification({ type: 'error', message: 'Lai ziņotu, nepieciešams pieteikties.' });
      return;
    }

    const reason = window.prompt(
      'Pastāsti, kas šajā spotā ir neatbilstošs (neobligāti):'
    );

    if (reason === null) {
      return;
    }

    try {
      await apiFetch('/reports', {
        method: 'POST',
        body: {
          targetType: 'spot',
          targetId: spot.id,
          reason: reason.trim() ? reason.trim() : undefined,
        },
      });

      setNotification({ type: 'success', message: 'Ziņojums nosūtīts moderatoriem.' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Neizdevās nosūtīt ziņojumu par spotu.';
      setNotification({ type: 'error', message });
    }
  };

  const canManageSpot = (spot: Spot) => {
    if (!currentUser) {
      return false;
    }

    return currentUser.role === 'admin' || currentUser.id === spot.user_id;
  };

  const renderInfoWindow = () => {
    if (!selectedSpot) {
      return null;
    }

    const galleryImages = (
      Array.isArray(selectedSpot.images) && selectedSpot.images.length
        ? selectedSpot.images
        : selectedSpot.image
        ? [selectedSpot.image]
        : []
    ).filter((image) => typeof image === 'string' && image.trim().length > 0);
    const liked = Boolean(selectedSpot.likedByCurrentUser);
    const visited = Boolean(selectedSpot.visitedByCurrentUser);
    const visitedAtLabel = visited ? formatVisitedDate(selectedSpot.visitedAt ?? null) : null;
    const visitedButtonBusy = visitedMutationId === selectedSpot.id;
    const isDirectionsLoading = directionsLoadingSpotId === selectedSpot.id;
    const hasDirections =
      Boolean(directionsResult) && directionsSpotId === selectedSpot.id;
    const directionsLeg = hasDirections
      ? directionsResult?.routes?.[0]?.legs?.[0] ?? null
      : null;
    const showDirectionsError =
      directionsErrorSpotId === selectedSpot.id && Boolean(directionsError);

    return (
      <InfoWindow
        position={{ lat: selectedSpot.lat, lng: selectedSpot.lng }}
        onCloseClick={() => setSelectedSpotId(null)}
      >
        <div
          className="spotz-card"
          style={{
            width: '320px',
            maxHeight: '72vh',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: '0',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: radii.lg,
            position: 'relative',
            background: 'var(--surface-color)',
          }}
        >
          {/* Header with name + close button */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '16px 16px 0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: radii.md,
                  overflow: 'hidden',
                  background: palette.accentGradientSoft,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  color: palette.accentStrong,
                  flexShrink: 0,
                }}
              >
                {selectedSpot.owner.profile_image ? (
                  <img
                    src={selectedSpot.owner.profile_image}
                    alt={selectedSpot.owner.username}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  selectedSpot.owner.username.slice(0, 1).toUpperCase()
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: palette.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedSpot.name}</h3>
                  <span
                    style={{
                      padding: '1px 7px',
                      borderRadius: radii.pill,
                      background: selectedSpot.status === 'public' ? palette.accentGradientSoft : 'linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(168, 85, 247, 0.24))',
                      color: selectedSpot.status === 'public' ? palette.accentStrong : palette.textSecondary,
                      fontWeight: 600,
                    }}
                  >
                    {selectedSpot.status === 'public' ? 'Publisks' : 'Privāts'}
                  </span>
              </div>
            </div>

            {/* Close button inside the card */}
            <button
              type="button"
              onClick={() => setSelectedSpotId(null)}
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: `1px solid ${palette.border}`,
                background: palette.surfaceAlt,
                color: palette.textSecondary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                cursor: 'pointer',
                lineHeight: 1,
              }}
              aria-label="Aizvērt"
            >
              ✕
            </button>
          </div>

          {/* Gallery */}
          {galleryImages.length ? (
            <div style={{ marginTop: '12px' }}>
              <SpotGallery images={galleryImages} title={selectedSpot.name} height={180} />
            </div>
          ) : null}

          {/* Body content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 16px 16px' }}>

          {selectedSpot.description ? (
            <p style={{ margin: 0, color: palette.textSecondary, fontSize: '13px', lineHeight: 1.6 }}>
              {selectedSpot.description}
            </p>
          ) : null}

          {selectedSpot.tags.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {selectedSpot.tags.map((tag) => (
                <span
                  key={tag}
                  className="spotz-chip"
                  style={{
                    background: palette.surfaceAlt,
                    color: palette.accentStrong,
                    border: `1px solid ${palette.border}`,
                    fontSize: '12px',
                    padding: '4px 10px',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => handleShowDirections(selectedSpot)}
                className="spotz-btn spotz-btn--outline"
                style={{ padding: '8px 14px', borderRadius: radii.md }}
                disabled={isDirectionsLoading}
                aria-busy={isDirectionsLoading}
              >
                {isDirectionsLoading ? 'Aprēķinām maršrutu…' : 'Ceļot uz šo vietu'}
              </button>
              {hasDirections && directionsLeg ? (
                <button
                  type="button"
                  onClick={handleClearDirections}
                  className="spotz-btn spotz-btn--ghost"
                  style={{ padding: '8px 14px', borderRadius: radii.md }}
                >
                  Noņemt maršrutu
                </button>
              ) : null}
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => handleToggleVisited(selectedSpot)}
                  className="spotz-btn"
                  style={{
                    padding: '8px 14px',
                    borderRadius: radii.md,
                    border: visited
                      ? `1px solid ${palette.success}`
                      : `1px solid ${palette.border}`,
                    background: visited ? palette.successSoft : palette.surfaceAlt,
                    color: visited ? palette.success : palette.textPrimary,
                  }}
                  disabled={visitedButtonBusy}
                  aria-busy={visitedButtonBusy}
                >
                  {visited ? 'Noņemt apmeklējumu' : 'Atzīmēt kā apmeklētu'}
                </button>
              ) : null}
            </div>
            {visited && visitedAtLabel ? (
              <span style={{ fontSize: '12px', color: palette.textMuted }}>
                Apmeklēts {visitedAtLabel}
              </span>
            ) : null}
            {hasDirections && directionsLeg ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '10px 12px',
                  borderRadius: radii.md,
                  background: palette.surfaceAlt,
                  border: `1px solid ${palette.border}`,
                }}
              >
                <strong style={{ fontSize: '13px', color: palette.textPrimary }}>
                  Maršruta kopsavilkums
                </strong>
                <span style={{ fontSize: '12px', color: palette.textSecondary }}>
                  Attālums: {directionsLeg?.distance?.text ?? '—'}
                </span>
                <span style={{ fontSize: '12px', color: palette.textSecondary }}>
                  Ilgums: {directionsLeg?.duration?.text ?? '—'}
                </span>
              </div>
            ) : null}
            {showDirectionsError ? (
              <span style={{ fontSize: '12px', color: palette.danger }}>
                {directionsError}
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => handleToggleLike(selectedSpot)}
                  className="spotz-btn"
                  style={{
                    padding: '8px 16px',
                    borderRadius: radii.pill,
                    border: liked ? `1px solid ${palette.danger}` : `1px solid ${palette.border}`,
                    background: liked
                      ? 'linear-gradient(135deg, rgba(248, 113, 113, 0.28), rgba(239, 68, 68, 0.4))'
                      : palette.surfaceAlt,
                    color: palette.danger,
                  }}
                >
                  {liked ? 'Noņemt patīk' : 'Patīk'} · {selectedSpot.likesCount}
                </button>
              ) : (
                <span
                  className="spotz-chip"
                  style={{ background: palette.dangerSoft, color: palette.danger }}
                  aria-label={`${selectedSpot.likesCount} patīk`}
                >
                  ❤ {selectedSpot.likesCount}
                </span>
              )}

              <button
                type="button"
                onClick={() => handleShareSpot(selectedSpot)}
                className="spotz-btn spotz-btn--ghost"
                style={{ padding: '8px 14px', borderRadius: radii.md }}
              >
                Kopēt saiti
              </button>

              {selectedSpot.status === 'public' ? (
                <button
                  type="button"
                  onClick={() => handleReportSpot(selectedSpot)}
                  className="spotz-btn spotz-btn--outline"
                  style={{ padding: '8px 14px', borderRadius: radii.md, borderColor: palette.danger, color: palette.danger }}
                >
                  Ziņot
                </button>
              ) : null}
            </div>

            {canManageSpot(selectedSpot) ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setFormError('');
                    setFormState({
                      mode: 'edit',
                      spot: selectedSpot,
                      values: {
                        name: selectedSpot.name,
                        description: selectedSpot.description ?? '',
                        status: selectedSpot.status,
                        image: selectedSpot.image,
                        images: [...(selectedSpot.images ?? [])],
                        tags: [...(selectedSpot.tags ?? [])],
                      },
                    });
                  }}
                  className="spotz-btn spotz-btn--outline"
                  style={{ padding: '8px 14px', borderRadius: radii.md }}
                >
                  Rediģēt
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSpot(selectedSpot)}
                  className="spotz-btn spotz-btn--danger"
                  style={{ padding: '8px 14px', borderRadius: radii.md }}
                >
                  Dzēst
                </button>
              </div>
            ) : null}
          </div>

          {selectedSpot.status === 'public' ? (
            <div
              style={{
                borderTop: `1px solid ${palette.border}`,
                paddingTop: '12px',
              }}
            >
              <SpotComments
                spotId={selectedSpot.id}
                currentUser={currentUser}
                canComment={Boolean(currentUser)}
                variant="compact"
                maxHeight={160}
              />
            </div>
          ) : null}
          </div>
        </div>
      </InfoWindow>
    );
  };

  if (loadError) {
    return (
      <div
        className="spotz-card"
        style={{
          minHeight: '60vh',
          borderRadius: radii.xl,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.surface,
          color: palette.danger,
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        Neizdevās ielādēt Google Maps. Lūdzu, pārbaudi API atslēgu.
      </div>
    );
  }

  const hasActiveFilters =
    statusFilter !== 'all' || ownerFilter !== 'any' || Boolean(tagFilter);
  const canSeePrivate = Boolean(currentUser);
  const ownerFilterValue =
    ownerFilter === 'any' || ownerFilter === 'me' ? ownerFilter : String(ownerFilter);
  const discoveryButtonLabel = discoveryMode
    ? nearbyLoading
      ? 'Atjaunojam atklāšanas režīmu…'
      : 'Iziet no atklāšanas režīma'
    : isRequestingLocation
    ? 'Nosakām atrašanās vietu…'
    : nearbyLoading
    ? 'Ieslēdzam atklāšanas režīmu…'
    : 'Atklāšanas režīms';
  const discoveryButtonDisabled = !discoveryMode && (isRequestingLocation || nearbyLoading);
  const shouldShowNearbyPanel =
    discoveryMode &&
    (Boolean(userLocation) || nearbyLoading || Boolean(locationError) || nearbySpots.length > 0);

  const handleDiscoveryToggle = () => {
    if (discoveryMode) {
      setDiscoveryMode(false);
      setNearbyLoading(false);
      setNearbySpots([]);
      setNearbyError('');
      return;
    }

    if (!currentUser) {
      setNotification({
        type: 'error',
        message: 'Atklāšanas režīms pieejams tikai pēc pieteikšanās.',
      });
      return;
    }

    setDiscoveryMode(true);
    setNearbyError('');

    if (userLocation) {
      setCenter(userLocation);
    } else {
      requestUserLocation();
    }
  };

  // UI tiek veidots no vairākiem slāņiem: kartes pārklājumiem un vadības paneļiem.
  return (
    <div style={{ height: 'calc(100vh - 160px)', minHeight: '520px', position: 'relative' }}>
      <style>{`
        .spotz-map-filters { display: block; }
        .spotz-map-filter-toggle { display: none; }
        .spotz-map-right-panel { display: flex; }
        @media (max-width: 768px) {
          .spotz-map-filters { display: none; }
          .spotz-map-filters.is-open { display: block; }
          .spotz-map-filter-toggle { display: flex; }
          .spotz-map-right-panel { display: none; }
        }
      `}</style>
      {notification ? (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 18px',
            borderRadius: radii.md,
            background:
              notification.type === 'success' ? palette.successSoft : palette.dangerSoft,
            color: notification.type === 'success' ? palette.success : palette.danger,
            fontWeight: 600,
            boxShadow: shadows.soft,
            zIndex: 15,
            backdropFilter: 'var(--backdrop-blur)',
          }}
        >
          {notification.message}
        </div>
      ) : null}

      <div
        className="spotz-map-right-panel"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 30,
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '12px',
        }}
      >
        {fetchError ? (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: radii.md,
              background: palette.dangerSoft,
              color: palette.danger,
              fontWeight: 600,
              boxShadow: shadows.soft,
              maxWidth: '280px',
              textAlign: 'right',
            }}
          >
            {fetchError}
          </div>
        ) : null}

        {currentUser ? (
          <div
            className="spotz-card"
            style={{
              padding: '14px 16px',
              borderRadius: radii.lg,
              border: `1px solid ${palette.border}`,
              background: palette.surfaceGlass,
              boxShadow: shadows.soft,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxWidth: '280px',
              pointerEvents: 'auto',
            }}
          >
            <span style={{ fontWeight: 700, color: palette.accent }}>
              🔥{' '}
              {streakInfo
                ? `${streakInfo.currentStreak} dienu streak`
                : streakError
                ? 'Streak neizdevās ielādēt'
                : 'Ielādējam streak…'}
            </span>
            <span style={{ fontSize: '12px', color: palette.textSecondary }}>
              {streakInfo
                ? streakInfo.todayVisited
                  ? 'Šodien esi jau apmeklējis jaunu spotu!'
                  : 'Apmeklē jaunu spotu, lai noturētu streak.'
                : streakError
                ? streakError
                : 'Sekojam līdzi taviem piedzīvojumiem.'}
            </span>
            {streakInfo ? (
              <div
                style={{
                  fontSize: '11px',
                  color: palette.textMuted,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <span>Rekords: {streakInfo.longestStreak} dienas</span>
                <span>Nākamais mērķis: {streakInfo.nextMilestone} dienas</span>
                {streakInfo.lastVisitedAt ? (
                  <span>
                    Pēdējais jauns spots:{' '}
                    {formatVisitedDate(streakInfo.lastVisitedAt) ?? 'nesen'}
                  </span>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void refreshStreak();
              }}
              className="spotz-btn spotz-btn--ghost"
              style={{
                alignSelf: 'flex-end',
                padding: '4px 10px',
                borderRadius: radii.pill,
                fontSize: '11px',
              }}
            >
              Atjaunot streak
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleDiscoveryToggle}
          className="spotz-btn spotz-btn--primary"
          disabled={discoveryButtonDisabled}
          style={{
            padding: '10px 16px',
            borderRadius: radii.pill,
            fontWeight: 600,
            pointerEvents: 'auto',
            minWidth: '220px',
          }}
          aria-busy={isRequestingLocation || nearbyLoading}
        >
          {discoveryButtonLabel}
        </button>

        {discoveryMode && locationError ? (
          <div
            style={{
              padding: '10px 16px',
              borderRadius: radii.md,
              background: palette.dangerSoft,
              color: palette.danger,
              fontWeight: 600,
              boxShadow: shadows.soft,
              maxWidth: '280px',
              textAlign: 'right',
            }}
          >
            {locationError}
          </div>
        ) : null}

      </div>

      {/* Mobile filter toggle button */}
      <button
        type="button"
        onClick={() => setFiltersOpen((o) => !o)}
        className="spotz-btn spotz-btn--outline spotz-map-filter-toggle"
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 31,
          padding: '8px 14px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-glass)',
          backdropFilter: 'var(--backdrop-blur)',
          boxShadow: '0 2px 8px rgba(15,23,42,0.15)',
          gap: '6px',
          fontWeight: 600,
          fontSize: '13px',
        }}
      >
        {filtersOpen ? '✕ Aizvērt' : '⚙ Filtri'}
      </button>

      <div
        className={`spotz-map-filters${filtersOpen ? ' is-open' : ''}`}
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          zIndex: 30,
          pointerEvents: 'none',
          maxWidth: '340px',
        }}
      >
        <div
          className="spotz-card"
          style={{
            padding: '18px',
            borderRadius: radii.lg,
            border: `1px solid ${palette.border}`,
            boxShadow: shadows.soft,
            background: palette.surfaceGlass,
            backdropFilter: 'var(--backdrop-blur)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '16px', color: palette.textPrimary }}>Kartes filtri</h2>
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
              className="spotz-btn spotz-btn--ghost"
              style={{
                padding: '6px 12px',
                borderRadius: radii.pill,
                fontSize: '13px',
                opacity: hasActiveFilters ? 1 : 0.5,
              }}
            >
              Notīrīt
            </button>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
            Redzamība
            <select
              value={statusFilter}
              onChange={(event) => handleStatusFilterChange(event.target.value)}
              className="spotz-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="all">Visi spoti</option>
              <option value="public">Tikai publiskie</option>
              <option value="private" disabled={!canSeePrivate}>
                Tikai privātie
              </option>
              <option value="mine" disabled={!canSeePrivate}>
                Tikai mani spoti
              </option>
            </select>
            {!canSeePrivate ? (
              <span style={{ fontSize: '11px', color: palette.textMuted }}>
                Piesakies, lai skatītu privātos vai savus spotus.
              </span>
            ) : null}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: palette.textPrimary }}>
            Autors
            <select
              value={ownerFilterValue}
              onChange={(event) => handleOwnerFilterChange(event.target.value)}
              className="spotz-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="any">Jebkurš autors</option>
              {currentUser ? <option value="me">Tikai es</option> : null}
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={String(owner.id)}>
                  {owner.username}
                  {currentUser && owner.id === currentUser.id ? ' (tu)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              color: palette.textPrimary,
            }}
          >
            <span>Tags</span>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <input
                value={tagFilterInput}
                onChange={(event) => handleTagFilterInputChange(event.target.value)}
                onKeyDown={handleTagFilterKeyDown}
                placeholder="#daba"
                className="spotz-input"
                style={{ flex: 1 }}
                list="map-tag-options"
              />
              <button
                type="button"
                onClick={handleTagFilterApply}
                className="spotz-btn spotz-btn--outline"
                style={{ padding: '8px 14px', borderRadius: radii.md, flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                Piemērot
              </button>
            </div>
            {tagFilter ? (
              <span style={{ fontSize: '12px', color: palette.accent }}>
                Filtrē pēc <strong>{tagFilter}</strong>
              </span>
            ) : (
              <span style={{ fontSize: '12px', color: palette.textMuted }}>
                Izvēlies tagu vai ieraksti savu, lai izceltu atbilstošos spotus.
              </span>
            )}
            <datalist id="map-tag-options">
              {availableTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      {isLoaded ? (
        <div style={MAP_WRAPPER_STYLE}>
          {/* Kad Google Maps bibliotēka ir ielādēta, uzzīmējam karti un pievienojam marķierus. */}
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={12}
            options={MAP_OPTIONS}
            onClick={handleMapClick}
            onLoad={(map) => setMapInstance(map)}
            onUnmount={() => setMapInstance(null)}
          >
            {userLocation ? (
              <Marker
                position={userLocation}
                icon="http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                title="Tava atrašanās vieta"
                zIndex={999}
              />
            ) : null}
            {spots.map((spot) => {
              const isNearby = nearbySpotIds.has(spot.id);
              return (
                <Marker
                  key={spot.id}
                  position={{ lat: spot.lat, lng: spot.lng }}
                  onClick={() => setSelectedSpotId(spot.id)}
                  icon={
                    isNearby
                      ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
                      : undefined
                  }
                  zIndex={isNearby ? 50 : undefined}
                />
              );
            })}
            {renderInfoWindow()}
            {directionsResult ? (
              <DirectionsRenderer
                directions={directionsResult}
                options={{
                  suppressMarkers: true,
                  polylineOptions: {
                    strokeColor: palette.accent,
                    strokeOpacity: 0.9,
                    strokeWeight: 5,
                  },
                }}
              />
            ) : null}
          </GoogleMap>
        </div>
      ) : (
        <div
          style={{
            ...MAP_WRAPPER_STYLE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: palette.surfaceAlt,
          }}
        >
          <span style={{ color: palette.textSecondary, fontWeight: 600 }}>Ielādējam karti…</span>
        </div>
      )}

      {shouldShowNearbyPanel ? (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            zIndex: 25,
            maxWidth: '320px',
            pointerEvents: 'none',
          }}
        >
          <div
            className="spotz-card"
            style={{
              padding: '18px',
              borderRadius: radii.lg,
              border: `1px solid ${palette.border}`,
              boxShadow: shadows.soft,
              background: palette.surfaceGlass,
              backdropFilter: 'var(--backdrop-blur)',
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: palette.textPrimary }}>
                Atklāšanas režīms
              </h3>
              <span style={{ fontSize: '12px', color: palette.textSecondary }}>
                Neapmeklētie spoti tuvumā
              </span>
            </div>

            {locationError ? (
              <p style={{ margin: 0, color: palette.danger, fontWeight: 600 }}>
                {locationError}
              </p>
            ) : nearbyLoading ? (
              <p style={{ margin: 0, color: palette.accent }}>Ielādējam neapmeklētos spotus…</p>
            ) : nearbySpots.length ? (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {nearbySpots.map((spot) => {
                  const active = selectedSpotId === spot.id;
                  return (
                    <li key={spot.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCenter({ lat: spot.lat, lng: spot.lng });
                          setSelectedSpotId(spot.id);
                        }}
                        className="spotz-btn spotz-btn--ghost"
                        style={{
                          width: '100%',
                          justifyContent: 'space-between',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 14px',
                          borderRadius: radii.md,
                          border: `1px solid ${active ? palette.accent : palette.border}`,
                          background: active ? palette.successSoft : palette.surfaceAlt,
                          color: palette.textPrimary,
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ textAlign: 'left' }}>{spot.name}</span>
                        <span style={{ color: palette.accent }}>
                          {spot.distance.toFixed(1)} km
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p style={{ margin: 0, color: palette.textMuted }}>
                Visi tuvumā esošie spoti jau ir apmeklēti! 🎉
              </p>
            )}

            {nearbyError && !nearbyLoading && !locationError ? (
              <p style={{ margin: 0, color: palette.accent }}>{nearbyError}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: palette.overlay,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radii.xl,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '12px 18px',
              borderRadius: radii.pill,
              background: palette.surface,
              boxShadow: shadows.soft,
              color: palette.accent,
              fontWeight: 600,
            }}
          >
            Ielādējam spotus…
          </div>
        </div>
      ) : null}

      <SpotFormModal
        title={formState?.mode === 'edit' ? 'Rediģēt spotu' : 'Pievienot spotu'}
        open={Boolean(formState)}
        onClose={handleCloseForm}
        onSubmit={formState?.mode === 'edit' ? handleEditSubmit : handleCreateSubmit}
        initialValues={
          formState
            ? formState.values
            : { name: '', description: '', status: 'public', image: null, images: [], tags: [] }
        }
        submitting={formSubmitting}
        error={formError}
        mode={formState?.mode ?? 'create'}
        position={formState?.mode === 'create' ? formState.position : undefined}
        availableTags={availableTags}
        maxTags={MAX_TAGS_PER_SPOT}
      />
    </div>
  );
}
