# Pilota Lagunekin

Planning partagé et personnalisable pour répartir équitablement quatre joueurs
lors d'un rendez-vous hebdomadaire.

## Lancer le site

```bash
npm install
npx vite
```

Sans configuration, l'application démarre en mode démo avec dix joueurs
fictifs. Les modifications ne sont alors pas partagées.

## Activer le partage

1. Créer un projet gratuit sur [Supabase](https://supabase.com).
2. Ouvrir l'éditeur SQL et exécuter, dans cet ordre :
   - `supabase/schema.sql`
   - `supabase/multi-groups.sql`
   - `supabase/admin-space.sql`
3. Copier `.env.example` vers `.env`.
4. Dans les réglages API du projet Supabase, copier l'URL et la clé anonyme
   dans `.env`.
5. Relancer le serveur.

La page d'accueil permet de créer plusieurs groupes indépendants. Chaque groupe
choisit son nom, son jour, son heure et son message principal. Un lien privé
contenant une clé secrète est ensuite créé : il faut conserver et partager ce
lien complet avec les membres concernés.

Le bouton « Recalculer le planning » prépare les douze prochaines semaines. À
chaque semaine, l'algorithme choisit les quatre joueurs ayant le moins de
parties, puis ceux qui n'ont pas joué depuis le plus longtemps. Les anciennes
parties sont conservées ; seules les dates à venir sont recalculées.

Pour chaque jeudi, un joueur non retenu peut se déclarer « disponible en
renfort ». Si l'un des quatre joueurs est retiré, une place libre apparaît et
un remplaçant disponible peut être ajouté en un clic.

### Mettre à jour une base déjà créée

Si l'ancienne version est déjà installée, exécuter d'abord
`supabase/add-availability.sql` si nécessaire, puis
`supabase/multi-groups.sql`. Les anciennes données sont conservées dans un
premier groupe ; la dernière requête SQL affiche son chemin privé.

## Mise en ligne

Le projet peut être déployé sur Vercel ou Netlify. Il faut y déclarer les deux
variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.

Chaque groupe est isolé par les règles de sécurité Supabase. Toute personne
possédant le lien privé d'un groupe peut toutefois gérer ses joueurs et son
planning : ce lien doit donc être traité comme un mot de passe.

## Administration

Le script `supabase/admin-space.sql` affiche, dans son résultat, un chemin de
la forme `/?admin=...`. Ajoutez ce chemin à l'adresse du site et conservez le
lien obtenu : il ouvre la liste de tous les groupes et permet d'accéder à
chacun d'eux. Ce lien donne accès à toute l'application et doit être conservé
comme un mot de passe administrateur.
