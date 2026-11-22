# Nestive — site démo cinématique 3D

Site vitrine fictif (maison connectée) pensé pour être **filmé**. Concept : *24 h dans une maison Nestive*. Le scroll fait avancer l'heure (matin, golden hour, heure bleue, nuit, aube) pendant que la caméra tourne autour d'une maison 3D 100 % procédurale (aucun modèle à charger).

## Lancer

```bash
npm install
npm run dev        # ouvre http://localhost:5173
npm run build      # version de production dans dist/
npm run preview    # sert dist/
```

## Enregistrer la vidéo

| Touche / URL | Effet |
|---|---|
| **← / →** | Scène précédente / suivante (de 01 à 07), avec le même mouvement de caméra fluide. Appuie plusieurs fois rapidement pour sauter plusieurs scènes. |
| **P** | Pilote automatique (~80 s) : défile tout le site avec des pauses, change l'ambiance lumineuse (Cinema / Focus / Evening), éteint puis rallume la maison la nuit. **P** ou **Échap** pour arrêter. |
| **H** | Masque le HUD (horloge, index) et le curseur personnalisé. |
| `?autoplay` | Intro complète, puis pilote automatique. |
| `?skip` | Saute l'intro (pratique pour répéter une prise). |
| **F5** | Rejoue l'intro (nuit étoilée → la maison s'allume pièce par pièce → lever du soleil). |

Conseils : navigateur en plein écran (F11), fenêtre en 1920×1080, zoom à 100 %, OBS à 60 fps. Le pilote automatique donne un scroll parfaitement fluide, sans à-coups de molette.

## Les 7 scènes

1. **Hero** (07:40) : la composition de la référence, la maison flotte, les cartes d'étapes s'animent en boucle.
2. **Ambient** (12:30) : orbite autour de la maison, le manifeste se révèle mot à mot au scroll.
3. **Anatomy** (18:45, golden hour) : la maison s'éclate en 5 modules avec anneau de scan, lignes de données et étiquettes accrochées en 3D.
4. **Devices** (20:40, heure bleue) : gros plan sur le salon. Cartes interactives : thermostat ±, scènes lumineuses qui changent réellement la couleur des pièces en 3D.
5. **Night** (23:10) : étoiles, lune, lucioles. L'interrupteur « House lights » éteint et rallume la maison.
6. **Steps** (02:30) : travelling de 100° autour de la maison, les 4 étapes s'allument au scroll.
7. **Final + footer** (06:05, aube) : grue arrière, CTA, logotype géant.

## Où modifier

- **Mouvements de caméra** : `src/three/Director.js` (`SHOTS` = plans, `TRACK` = position de chaque plan dans le scroll)
- **Lumière et couleurs selon l'heure** : `src/three/palette.js`
- **La maison** (modules, intérieurs, lampes) : `src/three/House.js`
- **Post-production** (grain, vignette, aberration) : `src/three/CinematicShader.js`
- **Textes et sections** : `index.html` · **Styles** : `src/style.css`

## Stack

three.js r187 (PBR, ombres douces, verre à transmission, bloom, ACES), GSAP + ScrollTrigger, Lenis (smooth scroll), Vite. Polices auto-hébergées : Instrument Serif, Manrope, IBM Plex Mono.
