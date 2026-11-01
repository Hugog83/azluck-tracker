# Camouflages MW4 — V2 et mise en service après revue

Cette V2 s’intègre au projet existant. Aucun projet Supabase/Vercel n’est recréé. La PR n’applique aucune migration distante et ne fusionne pas `main`.

## Modèle et conservation

- `public.tracker` reste intégralement en place : identifiants des 33 armes, statistiques, défis V1 et classes inchangés. La migration V2 n’écrit jamais dans cette table.
- `public.camo_definitions` contient uniquement les définitions (JSONB contrôlé, identifiant stable, arme, parcours, palier, source, condition, cible et niveau nullable).
- `public.camo_progress` contient uniquement les compteurs, confirmations d’obtention et révisions. `NULL` signifie « inconnu », jamais « terminé ».
- Les politiques Auth/RLS V1 et la liste privée d’administrateurs sont conservées. Les nouvelles tables sont publiques en lecture et réservées aux administrateurs existants en écriture.
- L’import `install_camo_catalog` est atomique et additionnel. Il actualise les définitions par identifiant ; `ON CONFLICT DO NOTHING` protège toute progression déjà présente. Un nouvel identifiant pour un emplacement déjà occupé est refusé, pas fusionné arbitrairement. Il n’y a aucune suppression automatique.
- Une correction de cible ne tronque jamais un compteur existant. Si ce compteur dépasse la nouvelle cible, la fiche affiche une incohérence à corriger explicitement avant une nouvelle saisie.
- `set_camo_progress` n’écrit qu’une seule progression et compare sa révision. En cas de conflit, recharger avant de saisir à nouveau.
- Les schémas V1 conservent les propriétés supplémentaires des enregistrements au lieu de les supprimer lors du parsing/export.

## Avant toute mise en service en production

1. Relire la PR et exporter les cinq collections historiques, ainsi que les tables V2 si elles existent déjà. Noter leurs empreintes à l’aide du SQL de vérification ci-dessous.
2. Appliquer **uniquement** `supabase/migrations/20261101183223_mw4_camo_catalog_v2.sql` sur une base de test disposant de V1. Vérifier les rôles anonyme, connecté non administrateur et administrateur. La migration crée des objets nouveaux ; elle n’est à appliquer qu’une fois par base. Ne pas relancer `001_tracker.sql` ni `seed.sql` sur la base existante.
3. Vérifier le catalogue généré depuis les véritables armes existantes. Aucun fichier de seed à 4 ou à 33 armes n’est chargé par la V2.
4. Après validation de la PR et de la migration, appliquer cette migration sur la base cible, puis publier la version de code approuvée. Le déploiement applicatif n’exécute pas de migration.
5. Se connecter avec le compte administrateur existant, ouvrir **Camouflages → Gestion du catalogue V2**, exporter la sauvegarde puis choisir **Préparer / actualiser le catalogue**. Lire la confirmation puis confirmer l’import additionnel. L’application relit les données historiques juste avant cet import.
6. Vérifier 33 armes, trois Or (Axion, HAN 86, VEL 46), M4 avec huit militaires confirmés, Myriade et Opérations nocturnes obtenus, Vert à 14/25 non obtenu. Contrôler les identifiants `m4-military`, `m4-myriad`, `m4-night`, `m4-green`.
7. Vérifier que les empreintes des collections historiques sont identiques. Le dashboard et l’arsenal affichent ensuite l’état V2, sans recopier celui-ci dans les archives V1.

Sans migration ou sans catalogue importé, la V2 montre une projection en lecture seule depuis les données courantes. Une panne d’accès au catalogue désactive les modifications et affiche l’erreur ; elle ne déclenche aucune réinitialisation. Si le profil V1 ne se charge pas, son administration est également désactivée pour éviter de sauvegarder des données initiales incomplètes.

Le code utilise les mêmes variables publiques Supabase que V1, sans nouvelle clé ni secret. Une Preview Vercel partageant les variables de production lit cette base : laisser la migration non appliquée jusqu’à revue, ou utiliser une base de test pour exercer les écritures. La PR ne comporte aucun workflow de migration automatique.

### Vérifications SQL en lecture seule

```sql
-- À noter avant/après migration et import : les empreintes doivent être identiques.
select id, jsonb_array_length(data) as records, md5(data::text) as fingerprint
from public.tracker order by id;

select id, definition->>'weaponId' as weapon_id,
       definition->>'track' as track
from public.camo_definitions
where id in ('m4-military', 'm4-myriad', 'm4-night', 'm4-green');

select definition_id, current, completed, revision
from public.camo_progress where definition_id = 'm4-green';

-- Doit retourner zéro ligne.
select coalesce(definition->>'weaponId',''), definition->>'mode',
       definition->>'track', definition->>'slot', count(*)
from public.camo_definitions group by 1,2,3,4 having count(*) > 1;
```

## Catalogue et progression

Le parcours militaire, spécial et érudit est **partagé entre modes**. Il n’existe qu’un jeu de huit militaires, trois spéciaux, Or, Platine et Rupture harmonique par arme. Les neuf maîtrises et quatre récompenses de Prestige sont séparées de ce total. Avec les 33 armes actuelles et l’archive militaire M4, la projection produit 893 définitions : 33 × 27 + Divergence + une archive.

La progression affichée sur une carte est le nombre de camouflages explicitement obtenus sur les 14 du parcours partagé. Cela ne mesure ni un nombre d’éliminations ni les maîtrises. Une arme confirmée en Or conserve cet Or, sans inventer rétrospectivement les onze confirmations de base absentes. M4 affiche donc 10/14 avant de terminer Vert.

Or : les deux alternatives de mode sont affichées ; il n’y a pas de cible de compteur universelle. Le compteur libre est une note quantitative à interpréter avec le mode et la partie ; il ne produit aucun pourcentage calculé. L’administrateur confirme l’obtention constatée en jeu. Les militaires reposent sur des niveaux d’arme, sans faux objectif d’éliminations.

Les prérequis utilisent les confirmations explicites : bases pour Or, tous les Or de la catégorie complète pour Platine, les 33 Platine pour Rupture harmonique, les 33 Rupture harmonique pour Divergence, puis chaque maîtrise précédente. Un catalogue de catégorie incomplet ou un niveau inconnu ne débloque rien par défaut. Divergence accessible après ses prérequis reste à confirmer : aucune obtention automatique n’est inscrite en base.

Les quatre statuts sont distincts. L’administrateur ne peut pas cocher un nouveau défi dont un prérequis connu est verrouillé. Il peut confirmer une obtention malgré une condition inconnue après un avertissement explicite. Décocher une étape ne supprime pas les étapes suivantes déjà confirmées : les données du joueur restent conservées et ne sont pas réécrites en cascade.

## Sources et informations à vérifier

Références officielles consultées le 1er novembre 2026 :

- [Progression et Prestige](https://www.callofduty.com/fr/blog/2026/10/call-of-duty-modern-warfare-4-ready-for-launch-progression-prestige), sections Camouflages d’armes, érudit, maîtrises de mode et Prestige d’arme.
- [Catalogue des armes](https://www.callofduty.com/fr/blog/2026/10/call-of-duty-modern-warfare-4-launch-multiplayer-operators-weapons-equipment-create-a-class), pour le périmètre de lancement et les tailles de catégories.

Le catalogue affiche les noms génériques militaires publiés, les noms et niveaux des spéciaux HAN 86 et SANG 9 mm, les conditions connues par catégorie, les maîtrises de chaque mode et les récompenses de Prestige. Les descriptions des conditions sont synthétisées en français ; les liens donnent le texte officiel complet. Aucun média Call of Duty n’est copié.

Restent explicitement « À vérifier » :

- Les seuils de niveau des militaires propres à chaque arme.
- Les noms, conditions et niveaux des autres spéciaux non détaillés dans ces sources.
- Les quantités des spéciaux HAN/SANG, du Platine et de Rupture harmonique.
- Les conditions corps à corps, tronquées dans la page officielle française.
- Les conditions des maîtrises Warzone, classifiées dans la source.
- L’état de Prestige d’arme du joueur : aucun niveau normal ne permet de le déduire. L’accès aux défis non terminés après une réinitialisation Prestige n’est pas détaillé dans les sources ; les niveaux actuellement saisis servent au contrôle des défis concernés.

Les données M4 viennent du propriétaire et sont étiquetées comme telles. Les anciennes valeurs 1/1 de Myriade et Opérations nocturnes sont des confirmations historiques, pas des quantités d’éliminations officielles. L’agrégat `m4-military` est conservé en archive ; ses huit obtentions confirmées sont projetées sur huit nouvelles cases sans double comptage. Les sources communautaires peuvent être renseignées distinctement par import, mais aucune donnée communautaire non vérifiée n’est préchargée.

## Corrections et sauvegardes

L’export V2 contient `{version:2, legacy:..., catalog:{definitions:[],progress:[]}}`. Il inclut les archives V1 pour conservation. L’import de corrections accepte cet export ou directement `{definitions,progress}` ; il montre un récapitulatif avant confirmation et ne remplace **jamais** les progrès existants. Les sources doivent être HTTPS. Ne changez pas `id`, `weaponId`, `mode`, `track` ou `slot` d’un défi existant. Corrigez son nom, sa description, son niveau, sa cible ou sa source dans la définition.

Pour une mise à jour pure de définitions, utiliser `progress: []`. Les états existants restent en base. Un nouvel état d’obtention n’est jamais créé à partir d’une définition seule. Réimporter une sauvegarde initialise uniquement les états encore absents ; restaurer ou corriger un état déjà présent exige une saisie explicite dans la fiche. L’ancien import V1 ne restaure pas les tables V2.

Une régénération depuis les archives V1 réactualise les définitions générées. Pour préserver des corrections manuelles de définition, privilégier l’import JSON de définitions corrigées et exporter avant toute régénération. Les anciennes cases Or/Platine et les défis V1 deviennent non modifiables dans l’administration quand V2 est active ; les statistiques et classes continuent de fonctionner. Les suppressions d’armes sont désactivées pour éviter des références orphelines ; la gestion d’archivage d’armes n’est pas incluse dans cette V2.

## Tests et limites de vérification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Les tests SQL utilisent un vrai moteur PostgreSQL local embarqué (PGlite), avec des rôles et un stub Auth de test. Ils couvrent conservation du JSONB, RLS, import, identités, validation et concurrence. Ils ne constituent pas un test d’authentification Supabase hébergée ni un test sur la production. Aucune migration ni écriture de progression distante n’est exécutée par cette livraison.
