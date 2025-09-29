import React from 'react';
import { Link } from 'react-router-dom';
import { palette, radii, shadows, transitions } from '../styles/theme';

const heroBackgroundUrl = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80';

const HomePage: React.FC = () => {
  return (
    <main>
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: palette.accentContrast,
          textAlign: 'center',
          backgroundImage: `linear-gradient(135deg, rgba(15, 23, 42, 0.68), rgba(15, 23, 42, 0.55)), url(${heroBackgroundUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          padding: '0 1.5rem',
          transition: `color ${transitions.slow}`,
        }}
      >
        <div style={{ maxWidth: '640px' }}>
          <p style={{ letterSpacing: '0.2em', fontSize: '0.875rem', fontWeight: 500, marginBottom: '1rem', textTransform: 'uppercase' }}>
            Izpēti un dalies ar saviem iecienītākajiem dabas stūrīšiem
          </p>
          <h1 style={{ fontSize: 'clamp(2.75rem, 5vw, 4rem)', fontWeight: 700, marginBottom: '1.5rem', lineHeight: 1.1 }}>
            Laipni lūgts Spotz
          </h1>
          <p style={{ fontSize: '1.125rem', lineHeight: 1.6, marginBottom: '2.5rem', color: 'rgba(255, 255, 255, 0.82)' }}>
            Atrodi jaunas pastaigu vietas, saglabā savus slepenos punktus un dalies ar draugiem.
          </p>
          <Link
            to="/map"
            className="spotz-btn spotz-btn--primary"
            style={{
              padding: '0.85rem 2.6rem',
              borderRadius: radii.pill,
              fontSize: '1rem',
              boxShadow: shadows.medium,
              transformOrigin: 'center',
            }}
          >
            Sākt
          </Link>
        </div>
      </section>

      <section
        style={{
          padding: '4rem 1.5rem',
          backgroundColor: palette.surface,
          color: palette.textPrimary,
          transition: `background ${transitions.slow}, color ${transitions.slow}`,
        }}
      >
        <div className="spotz-card" style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center', padding: '2.5rem 3rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem', color: palette.textPrimary }}>Kāpēc Spotz?</h2>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: palette.textSecondary }}>
            Spotz ir platforma dabas cienītājiem, kas vēlas sakārtot savus atklātos apskates punktus, dalīties ar neaizmirstamiem piedzīvojumiem un iedvesmot citus doties tuvāk dabai. Saglabā savas vietas privāti vai padari tās pieejamas kopienai – izvēle ir tavās rokās.
          </p>
        </div>
      </section>
    </main>
  );
};

export default HomePage;
