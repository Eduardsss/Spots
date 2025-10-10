import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { palette, radii, shadows, transitions } from '../styles/theme';

// Šī komponenta mērķis ir parādīt galvenās Spotz lietotnes sadaļas un kopienas izceltos spotus/autorus.

type HighlightSpot = {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  likesCount: number;
  owner: {
    id: number;
    username: string;
    profile_image: string | null;
  };
};

type HighlightCreator = {
  id: number;
  username: string;
  profile_image: string | null;
  totalLikes: number;
  publicSpots: number;
};

type HighlightsResponse = {
  topSpots: HighlightSpot[];
  topCreators: HighlightCreator[];
};

const heroBackgroundUrl =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80';

const numberFormatter = new Intl.NumberFormat('lv-LV');

export default function HomePage() {
  // Glabājam ielādes statusu un galvenos datus, lai varētu atspoguļot dažādus stāvokļus UI.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topSpots, setTopSpots] = useState<HighlightSpot[]>([]);
  const [topCreators, setTopCreators] = useState<HighlightCreator[]>([]);

  useEffect(() => {
    let isMounted = true;

    // Atsevišķa funkcija, kas pieslēdzas API un saglabā atbildi stāvokļos.
    const loadHighlights = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch<HighlightsResponse>('/spots/highlights');

        if (!isMounted) {
          return;
        }

        setTopSpots(Array.isArray(response.topSpots) ? response.topSpots : []);
        setTopCreators(Array.isArray(response.topCreators) ? response.topCreators : []);
      } catch (err) {
        if (!isMounted) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Neizdevās ielādēt jaunāko informāciju.';
        setError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadHighlights();

    return () => {
      isMounted = false;
    };
  }, []);

  const podiumLayout = useMemo(() => {
    // Nodrošina, ka pjedestāla kartītes tiek pārrēķinātas tikai tad, kad mainās top autori.
    return (
      [
        { creator: topCreators[1], label: '2. vieta', height: 170 },
        { creator: topCreators[0], label: '1. vieta', height: 220 },
        { creator: topCreators[2], label: '3. vieta', height: 150 },
      ].filter((item): item is { creator: HighlightCreator; label: string; height: number } => Boolean(item.creator))
    );
  }, [topCreators]);

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Galvenais izkārtojums ar hero un kopienas datu blokiem. */}
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(248, 250, 252, 0.96)',
          textAlign: 'center',
          backgroundImage: `linear-gradient(135deg, rgba(15, 23, 42, 0.68), rgba(15, 23, 42, 0.55)), url(${heroBackgroundUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          padding: '0 1.5rem',
          transition: `color ${transitions.slow}`,
        }}
      >
        <div style={{ maxWidth: '720px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p
            style={{
              letterSpacing: '0.2em',
              fontSize: '0.875rem',
              fontWeight: 600,
              margin: 0,
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.85)',
            }}
          >
            Atrodi. Pieraksti. Dalies.
          </p>
          <h1
            style={{
              fontSize: 'clamp(2.75rem, 5vw, 4rem)',
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Spotz — tava dabas piedzīvojumu karte
          </h1>
          <p
            style={{
              fontSize: '1.2rem',
              lineHeight: 1.7,
              margin: 0,
              color: 'rgba(255, 255, 255, 0.82)',
            }}
          >
            Saglabā iemīļotās vietas, veido maršrutus draugiem un iepazīsti kopienas izvēlētos punktus.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Link
              to="/map"
              className="spotz-btn spotz-btn--primary"
              style={{
                padding: '0.9rem 2.8rem',
                borderRadius: radii.pill,
                fontSize: '1rem',
                boxShadow: shadows.medium,
                transformOrigin: 'center',
              }}
            >
              Sākt ceļojumu
            </Link>
            <Link
              to="/public"
              className="spotz-btn spotz-btn--outline"
              style={{
                padding: '0.9rem 2.8rem',
                borderRadius: radii.pill,
                fontSize: '1rem',
                color: 'rgba(248, 250, 252, 0.95)',
                borderColor: 'rgba(255, 255, 255, 0.7)',
                backgroundColor: 'rgba(15, 23, 42, 0.35)',
              }}
            >
              Apskati populārākos spotus
            </Link>
          </div>
        </div>
      </section>

      <section
        style={{
          padding: '4rem 1.5rem 3rem',
          backgroundColor: palette.surface,
          color: palette.textPrimary,
          transition: `background ${transitions.slow}, color ${transitions.slow}`,
        }}
      >
        <div
          style={{
            margin: '0 auto',
            maxWidth: '1080px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2.5rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 700, margin: 0 }}>Kopienas līderi</h2>
            <p style={{ margin: 0, color: palette.textSecondary, maxWidth: '680px', lineHeight: 1.7 }}>
              Uz pjedestāla nonāk Spotz lietotāji, kuru publiskajiem spotiem ir visvairāk ❤️. Pievienojies un
              kāp augšup kopā ar viņiem!
            </p>
          </div>

          {loading ? (
            <div
              style={{
                padding: '3rem 1.5rem',
                borderRadius: radii.xl,
                border: `1px solid ${palette.border}`,
                background: palette.surfaceAlt,
                textAlign: 'center',
                color: palette.textSecondary,
                fontWeight: 600,
              }}
            >
              Ielādējam jaunākos rezultātus…
            </div>
          ) : podiumLayout.length === 0 ? (
            <div
              style={{
                padding: '3rem 1.5rem',
                borderRadius: radii.xl,
                border: `1px solid ${palette.border}`,
                background: palette.surfaceAlt,
                textAlign: 'center',
                color: palette.textSecondary,
                fontWeight: 600,
              }}
            >
              Šeit drīz parādīsies aktīvākie Spotz radītāji.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                gap: '1.5rem',
                flexWrap: 'wrap',
              }}
            >
              {podiumLayout.map(({ creator, label, height }, index) => {
                const isWinner = label.startsWith('1');
                return (
                  <div
                    key={creator.id}
                    style={{
                      flex: '0 1 220px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '1rem',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          width: isWinner ? 88 : 72,
                          height: isWinner ? 88 : 72,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          border: `3px solid ${isWinner ? palette.accentStrong : palette.border}`,
                          boxShadow: shadows.medium,
                          background: palette.accentGradientSoft,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: isWinner ? '2rem' : '1.7rem',
                          fontWeight: 700,
                          color: palette.accentStrong,
                        }}
                      >
                        {creator.profile_image ? (
                          <img
                            src={creator.profile_image}
                            alt={creator.username}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          creator.username.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <strong style={{ fontSize: '1.2rem', letterSpacing: '-0.01em' }}>{creator.username}</strong>
                        <span style={{ fontSize: '0.95rem', color: palette.textSecondary }}>
                          ❤️ {numberFormatter.format(creator.totalLikes)} | {numberFormatter.format(creator.publicSpots)}
                          {' '}publiski spoti
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        width: '100%',
                        borderRadius: `${radii.lg} ${radii.lg} ${radii.sm} ${radii.sm}`,
                        background: isWinner
                          ? 'linear-gradient(135deg, rgba(250, 204, 21, 0.85), rgba(234, 179, 8, 0.9))'
                          : 'linear-gradient(135deg, rgba(96, 165, 250, 0.6), rgba(37, 99, 235, 0.65))',
                        height,
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        boxShadow: shadows.medium,
                        color: isWinner ? '#2b2100' : 'rgba(248, 250, 252, 0.94)',
                        paddingBottom: '1rem',
                        fontWeight: 700,
                        fontSize: '1rem',
                      }}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error ? (
            <div
              style={{
                padding: '1rem 1.25rem',
                borderRadius: radii.lg,
                background: palette.dangerSoft,
                color: palette.danger,
                fontWeight: 600,
                border: `1px solid ${palette.border}`,
              }}
            >
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section
        style={{
          padding: '3.5rem 1.5rem 5rem',
          background: palette.background,
          transition: `background ${transitions.slow}`,
        }}
      >
        <div
          style={{
            margin: '0 auto',
            maxWidth: '1080px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '2rem',
            alignItems: 'stretch',
          }}
        >
          <article
            className="spotz-card"
            style={{
              borderRadius: radii.xl,
              padding: '2.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              boxShadow: shadows.soft,
              background: palette.surface,
            }}
          >
            <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, color: palette.textPrimary }}>
              Kāpēc Spotz?
            </h2>
            <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: palette.textSecondary, margin: 0 }}>
              Spotz ir vieta dabas un pilsētvides pētniekiem, kuri vēlas saglabāt savus atklājumus vienuviet. Atzīmē
              slepenos saulrietu skatus, brīvdienu piknika vietas vai iecienītākās pārgājienu takas un ļauj citiem tās
              atrast.
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                color: palette.textPrimary,
              }}
            >
              <li>Saglabā privātus un publiskus punktus vienā kartē</li>
              <li>Inspirojies no kopienas ieteikumiem un foto galerijām</li>
              <li>Krāj sirsniņas par saviem spotiem un kļūsti par līderi</li>
            </ul>
          </article>

          <article
            className="spotz-card"
            style={{
              borderRadius: radii.xl,
              padding: '2.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              boxShadow: shadows.soft,
              background: palette.surface,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, color: palette.textPrimary }}>
                Visvairāk atzīmētie spoti
              </h2>
              <p style={{ margin: 0, color: palette.textSecondary }}>
                Skaties, kuras vietas šobrīd iedvesmo Spotz kopienu visvairāk.
              </p>
            </div>

            {loading ? (
              <p style={{ margin: 0, color: palette.textSecondary }}>Dati tiek ielādēti…</p>
            ) : topSpots.length === 0 ? (
              <p style={{ margin: 0, color: palette.textSecondary }}>Vēl nav pieejamu populārāko spotu.</p>
            ) : (
              <ol
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                {/* Izveidojam pārskatāmu sarakstu ar līderu vietām un to informāciju. */}
                {topSpots.map((spot, index) => (
                  <li
                    key={spot.id}
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      alignItems: 'center',
                      borderRadius: radii.lg,
                      border: `1px solid ${palette.border}`,
                      padding: '1rem',
                      background: palette.surfaceAlt,
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: radii.lg,
                        overflow: 'hidden',
                        background: palette.accentGradientSoft,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: palette.accentStrong,
                        fontWeight: 700,
                      }}
                    >
                      {spot.image ? (
                        <img
                          src={spot.image}
                          alt={spot.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        index + 1
                      )}
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <strong style={{ fontSize: '1.05rem', letterSpacing: '-0.01em' }}>{spot.name}</strong>
                      <span style={{ fontSize: '0.9rem', color: palette.textSecondary }}>
                        Autors: {spot.owner.username}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontWeight: 600,
                        color: palette.danger,
                      }}
                    >
                      <span aria-hidden="true">❤️</span>
                      <span>{numberFormatter.format(spot.likesCount)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}
