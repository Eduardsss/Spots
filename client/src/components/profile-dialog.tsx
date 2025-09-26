import { useEffect, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { convertFileToBase64 } from "@/lib/files";

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState(user?.username ?? "");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
    }
  }, [user]);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setUsername(user?.username ?? "");
    }
    onOpenChange(nextOpen);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const formData = new FormData(event.currentTarget);
    const profileImage = formData.get("profileImage") as File | null;
    let encoded: string | undefined;

    try {
      setUploading(true);
      if (profileImage && profileImage.size > 0) {
        encoded = await convertFileToBase64(profileImage);
      }
      await updateProfile({ username, profileImage: encoded ?? undefined });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update profile", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rediģēt profila informāciju</DialogTitle>
          <DialogDescription>
            Maini lietotājvārdu un augšupielādē jaunu profila attēlu. Izmaiņas stāsies spēkā nekavējoties.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2 text-left">
            <Label htmlFor="username">Lietotājvārds</Label>
            <Input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2 text-left">
            <Label htmlFor="profileImage">Profila attēls</Label>
            <Input id="profileImage" name="profileImage" type="file" accept="image/*" />
          </div>
          <Button type="submit" className="w-full" disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saglabā...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Saglabāt izmaiņas
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
