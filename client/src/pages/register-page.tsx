import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, UserPlus } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { convertFileToBase64 } from "@/lib/files";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const profileImage = formData.get("profileImage") as File | null;

    try {
      setLoading(true);
      let encoded: string | null = null;
      if (profileImage && profileImage.size > 0) {
        encoded = await convertFileToBase64(profileImage);
      }
      await register(username, password, encoded ?? undefined);
      navigate("/map");
    } catch (err) {
      console.error(err);
      setError("Neizdevās izveidot kontu. Lietotājvārds jau var tikt izmantots.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="container flex min-h-[calc(100vh-5rem)] items-center justify-center py-12">
      <Card className="w-full max-w-md border-none bg-white/80 shadow-2xl backdrop-blur dark:bg-slate-900/80">
        <CardHeader className="space-y-3 text-center">
          <CardTitle className="text-3xl">Izveido Spotz kontu</CardTitle>
          <CardDescription>Seko līdzi saviem piedzīvojumiem un dalies ar tiem ar citiem ceļotājiem.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2 text-left">
              <Label htmlFor="username">Lietotājvārds</Label>
              <Input id="username" name="username" placeholder="spotzlover" required />
            </div>
            <div className="space-y-2 text-left">
              <Label htmlFor="password">Parole</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <div className="space-y-2 text-left">
              <Label htmlFor="profileImage">Profila attēls</Label>
              <Input id="profileImage" name="profileImage" type="file" accept="image/*" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Reģistrē..." : <><UserPlus className="mr-2 h-4 w-4" /> Reģistrēties</>}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Jau ir konts? <Link to="/login" className="text-primary underline">Pieslēdzies</Link>
          </div>
          <div className="mt-4 text-center text-xs">
            <Link to="/" className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-4 w-4" /> Atpakaļ uz sākumu
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
