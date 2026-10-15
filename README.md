# Pilota Lagunekin

Planning partagé pour répartir équitablement quatre joueurs chaque jeudi à
18 h.

## Lancer le site

```bash
npm install
npx vite
```

Sans configuration, l'application démarre en mode démo avec dix joueurs
fictifs. Les modifications ne sont alors pas partagées.

## Activer le partage

1. Créer un projet gratuit sur [Supabase](https://supabase.com).
2. Ouvrir l'éditeur SQL et exécuter `supabase/schema.sql`.
3. Copier `.env.example` vers `.env`.
4. Dans les réglages API du projet Supabase, copier l'URL et la clé anonyme
   dans `.env`.
5. Relancer le serveur.

Le bouton « Recalculer le planning » prépare les douze prochains jeudis. À
chaque semaine, l'algorithme choisit les quatre joueurs ayant le moins de
parties, puis ceux qui n'ont pas joué depuis le plus longtemps. Les anciennes
parties sont conservées ; seules les dates à venir sont recalculées.

Pour chaque jeudi, un joueur non retenu peut se déclarer « disponible en
renfort ». Si l'un des quatre joueurs est retiré, une place libre apparaît et
un remplaçant disponible peut être ajouté en un clic.

### Mettre à jour une base déjà créée

Si `schema.sql` a déjà été exécuté avant l'ajout des disponibilités, exécuter
une fois `supabase/add-availability.sql` dans l'éditeur SQL de Supabase.

## Mise en ligne

Le projet peut être déployé sur Vercel ou Netlify. Il faut y déclarer les deux
variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.

Cette première version convient à un lien privé partagé avec le groupe : toute
personne ayant le lien peut gérer les joueurs. Pour un site public, ajouter une
authentification administrateur avant le déploiement.
