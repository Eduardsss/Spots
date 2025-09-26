export type User = {
  id: number;
  username: string;
  profile_image: string | null;
  is_admin: boolean;
};

export type SpotStatus = "public" | "private";

export type Spot = {
  id: number;
  user_id: number;
  username: string;
  name: string;
  description: string;
  image: string | null;
  lat: number;
  lng: number;
  status: SpotStatus;
  created_at: string;
  updated_at: string;
  like_count: number;
  liked_by_me: boolean;
};
