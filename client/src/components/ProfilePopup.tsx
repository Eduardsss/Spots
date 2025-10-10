import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { palette, radii, shadows, transitions } from '../styles/theme';

type AuthUser = {
  id: number;
  username: string;
  role: string;
  profile_image?: string | null;
};

type ProfilePopupProps = {
  user: AuthUser;
  onClose: () => void;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => void;
};

type UpdateResponse = {
  success: boolean;
  user: AuthUser;
};

export default function ProfilePopup({ user, onClose, onUserUpdated, onLogout }: ProfilePopupProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [username, setUsername] = useState(user.username);
  const [previewImage, setPreviewImage] = useState<string | null>(user.profile_image ?? null);
  const [selectedImageData, setSelectedImageData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Aizveram logu, ja lietotājs noklikšķina ārpus popup vai nospiež Escape.
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    // Kad saņemam jaunu lietotāja objektu, sinhronizējam formu ar jaunākajām vērtībām.
    setUsername(user.username);
    setPreviewImage(user.profile_image ?? null);
    setSelectedImageData(null);
  }, [user]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    // Nolasām izvēlēto attēlu un saglabājam kā base64 priekšskatījumam/API.
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      setPreviewImage(result);
      setSelectedImageData(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    // Atļaujam nosūtīt tikai izmainītos laukus, lai API nebūtu lieki dati.
    const trimmedUsername = username.trim();
    const payload: Record<string, unknown> = {};
    if (trimmedUsername && trimmedUsername !== user.username) {
      payload.username = trimmedUsername;
    }
    if (selectedImageData !== null) {
      payload.profile_image = selectedImageData;
    }

    if (Object.keys(payload).length === 0) {
      setSaving(false);
      setSuccess(true);
      return;
    }

    try {
      const response = await apiFetch<UpdateResponse>('/users/me', {
        method: 'PUT',
        body: payload,
      });
      // Ja saglabāšana izdevās, informējam vecāku komponentu par jaunajām vērtībām.
      onUserUpdated(response.user);
      setSuccess(true);
      setSelectedImageData(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Neizdevās atjaunināt profilu. Lūdzu, mēģini vēlreiz.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="spotz-popup"
      style={{
        position: 'absolute',
        top: 'calc(100% + 12px)',
        right: 0,
        width: '320px',
        background: palette.surface,
        borderRadius: radii.lg,
        boxShadow: shadows.soft,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        zIndex: 20,
        border: `1px solid ${palette.border}`,
        transition: `transform ${transitions.base}, box-shadow ${transitions.base}`,
      }}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="profile-username" style={{ fontWeight: 600, color: palette.textPrimary }}>
            Lietotājvārds
          </label>
          <input
            id="profile-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={saving}
            className="spotz-input"
            style={{ fontSize: '14px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontWeight: 600, color: palette.textPrimary }}>Profila attēls</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                overflow: 'hidden',
                background: palette.accentGradientSoft,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                color: palette.textSecondary,
              }}
            >
              {previewImage ? (
                <img
                  src={previewImage}
                  alt="Profila priekšskatījums"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                (user.username?.slice(0, 1) || '?').toUpperCase()
              )}
            </div>
            <label className="spotz-btn spotz-btn--outline" style={{ padding: '10px 16px' }}>
              Mainīt
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={saving}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {error ? (
          <div
            style={{
              background: palette.dangerSoft,
              color: palette.danger,
              padding: '10px 12px',
              borderRadius: radii.sm,
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        ) : null}

        {success ? (
          <div
            style={{
              background: palette.successSoft,
              color: palette.success,
              padding: '10px 12px',
              borderRadius: radii.sm,
              fontSize: '13px',
            }}
          >
            Profils atjaunots!
          </div>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="spotz-btn spotz-btn--primary"
          style={{ borderRadius: radii.md, fontSize: '15px' }}
        >
          {saving ? 'Saglabājam…' : 'Saglabāt izmaiņas'}
        </button>
      </form>

      <button
        type="button"
        onClick={onLogout}
        className="spotz-btn spotz-btn--danger"
        style={{ borderRadius: radii.md, width: '100%' }}
      >
        Izrakstīties
      </button>
    </div>
  );
}
