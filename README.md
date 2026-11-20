# L'Atelier à colorier

Page web (GitHub Pages) qui transforme une idée en page de coloriage A4.

- `index.html`, `app.js`, `config.js` : la page (aucun secret).
- `supabase/functions/atelier` : la fonction serveur (limite par jour, retouches, code parent, appel à Claude).
- `supabase/migrations` : le schéma de la base.

Secrets à définir dans Supabase → Edge Functions → Secrets : `ANTHROPIC_API_KEY` et `OPENAI_API_KEY` (générateur d'images ; sans elle, retour au dessin vectoriel).
