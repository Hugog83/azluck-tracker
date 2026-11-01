# AZLUCK Tracker

Application React + TypeScript + Vite en français, Tailwind CSS, Recharts, Lucide et Supabase. Le dossier contient le projet complet ; aucune clé secrète n’est nécessaire pour consulter les données initiales.

## Démarrage

Prérequis : Node.js 22.12+ et npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Ouvrir l’adresse indiquée par Vite. Sans variables Supabase, les pages affichent uniquement les informations fournies par le propriétaire. Les modifications sont désactivées : il ne s’agit pas d’une sauvegarde locale. Aucun chiffre de performance ni partie fictive n’est généré. Les noms du jeu et des armes reprennent le cahier des charges ; le catalogue et les conditions ne prétendent pas constituer une référence officielle vérifiée.

## Supabase

1. Créer un projet Supabase.
2. Dans SQL Editor, exécuter `supabase/migrations/001_tracker.sql`, puis `supabase/seed.sql`.
3. Dans Authentication > Providers, activer Email. Désactiver l’inscription publique si elle n’est pas souhaitée. L’application n’expose pas de formulaire d’inscription.
4. Créer le propriétaire dans Authentication > Users, avec une adresse et un mot de passe personnel. Relever son UUID.
5. Depuis SQL Editor, avec le rôle propriétaire de la base, autoriser explicitement ce compte :

```sql
insert into private.administrators(user_id)
values ('UUID_DU_COMPTE_AUTH');
```

Pour révoquer l’accès, supprimer cette ligne. La liste privée n’est ni lisible ni modifiable par les rôles navigateur. Ne jamais utiliser les métadonnées modifiables d’un utilisateur pour attribuer un rôle.

6. Dans `.env.local`, renseigner uniquement l’URL publique et la clé publique anon (ou publishable compatible) du projet :

```dotenv
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-publique
```

Ne jamais placer la clé `service_role`, un secret Supabase, ni un mot de passe dans une variable `VITE_*` : ces variables sont intégrées au navigateur. Redémarrer Vite après modification. 7. Ouvrir `/#admin` et se connecter. Les politiques RLS contrôlent les écritures côté PostgreSQL, indépendamment de la route et des contrôles du navigateur.

Les cinq collections sont stockées en JSONB dans `public.tracker`. Ce choix permet l’évolution des jeux et des champs tout en conservant un export autonome ; `game` identifie le jeu. L’interface actuelle cible `mw4`. Les schémas Zod, les calculs et les données de départ sont isolés dans `src/domain.ts`, l’accès aux données et le contrat du futur connecteur dans `src/data.ts`. Les sauvegardes multi-collections passent par une transaction RPC ; RLS s’applique aussi aux appels REST directs. Tout le contenu de ces collections, notes comprises, est public : aucune information privée ne doit y être stockée.

## Utilisation

- Dashboard : statistiques globales saisies, distinctes des calculs de l’historique. Un ratio dont le dénominateur vaut zéro reste non calculable (`—`). Le winrate des parties inclut les égalités dans le total.
- Camouflages : les 3 armes en Or et les 4 entrées connues du M4. Le pourcentage est la moyenne des progressions des **entrées renseignées**, pas le pourcentage de tous les défis du jeu. L’entrée militaire agrège les 8 camouflages confirmés. Or et Platine se règlent explicitement sur la fiche de l’arme, sans déduction à partir d’un catalogue incomplet.
- Historique : recherche par carte, mode ou résultat, filtre de résultat, ordre chronologique et courbe K/D.
- Arsenal : recherche, filtre de catégorie, fiche, statistiques et classes associées. Les catégories et niveaux inconnus restent à renseigner.
- Classes : cinq accessoires requis, équipements, atouts et notes publiques.
- Administration : ajout, modification, suppression (sauf le profil unique), compteurs et validation. Pour modifier une entrée existante, son identifiant reste stable. Les références aux armes sont vérifiées avant sauvegarde.
- Import : JSON complet ou CSV exporté par l’application (`collection,id,data`, avec champs JSON correctement échappés). Les autres formats CSV ne sont pas interprétés automatiquement. Fichier limité à 2 Mo ; aperçu du nombre d’éléments et confirmation avant remplacement. Toujours exporter avant import. Le format complet est validé, puis enregistré atomiquement.

Les écritures enregistrent un instantané complet. Éviter plusieurs onglets d’administration simultanés : la dernière sauvegarde gagne. Recharger après une modification faite depuis un autre appareil. Les statistiques globales ne sont jamais remplacées par l’agrégation des parties.

## Vérifications

```powershell
npm run typecheck
npm test
npm run build
```

Les tests couvrent les absences de données, les ratios, l’agrégation pondérée, les compteurs, les références, les doublons et les allers-retours CSV. Aucune donnée de démonstration n’est incluse dans les données réelles.

Pour vérifier RLS dans un projet de test : lecture anonyme autorisée ; écriture anonyme refusée ; compte authentifié non administrateur refusé sur REST et `save_tracker` ; administrateur autorisé ; liste privée inaccessible aux clients ; tentative d’auto-attribution impossible. La migration doit être testée sur Supabase avant une ouverture publique, aucune instance connectée n’étant fournie avec ce dépôt.

## Déploiement Vercel

1. Importer ce dépôt dans Vercel (preset Vite).
2. Commande : `npm run build`. Répertoire : `dist`.
3. Ajouter les deux variables publiques dans les réglages Vercel, puis déployer. Toute modification de variable exige une nouvelle compilation.
4. Dans Supabase Auth > URL Configuration, définir Site URL sur l’URL HTTPS du site. N’autoriser que les URL de redirection utilisées.
5. Appliquer migration, seed et autorisation du propriétaire avant utilisation. Vérifier la lecture publique et les refus RLS avec un utilisateur non administrateur.

`vercel.json` prépare le routage et quelques en-têtes de protection. L’administration utilise une session Supabase, avec l’autorisation imposée en base. Aucune intégration Activision, aucun cookie de session externe ni scraping ne sont utilisés. Il n’y a pas de publication automatique ni de création de compte distant depuis ce projet.

Références de sécurité : [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) et [variables publiques Vite](https://vite.dev/guide/env-and-mode).
