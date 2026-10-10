# Browser-Race beim Aufgabenanlegen – 10. Oktober 2026

Nach dem Merge der Listenfarben schlug ein Main-Lauf beim Neuladen nach „Privater Gedanke“ fehl. Der bisherige Test wartete nach Enter nur auf „Synchronisiert“. Dieser Status konnte noch vom vorigen Vorgang stammen, bevor die neue IndexedDB-Schreibtransaktion abgeschlossen war. Damit war ein Neuladen vor lokaler Speicherung möglich.

Die Aufgaben-Testhilfe wartet jetzt auf die erfolgreiche Mutationsantwort genau dieser neuen Aufgabe, ihre sichtbare Darstellung, das geleerte Eingabefeld und den abgeschlossenen Sync. Ein Browserregressionstest hält bewusst eine konkurrierende IndexedDB-Schreibtransaktion offen: Obwohl noch „Synchronisiert“ angezeigt wird, darf die Testhilfe nicht fertig werden. Erst nach Freigabe folgen Speicherung, Serverbestätigung und Reload-Nachweis. Keine produktive Speicherlogik oder Schemaänderung.

Lokal durchgeführt: `npm test` (alle fünf Testdateien) und `npm run build` einschließlich TypeScript bestanden; bestehende Bundlegrößenwarnung bleibt. Der lokale Browserlauf bleibt durch die Socket-Sperre blockiert; die tatsächliche Chromium-Ausführung erfolgt im bestehenden GitHub-Actions-Workflow. Ergebnisse des neuen Laufs werden in der Übergabe verlinkt.

---

# Anpassbare Listenfarben – 10. Oktober 2026

Basis: `main` bei `226409d855bdd8820430c8fec3137e8e30bbe709`; relevante Quelldateien vor Änderungen über den GitHub-Connector mit dem lokalen Stand verglichen. Branch: `feat/list-colors`. Keine Unteraufgaben oder weiteren Stufe-B-Funktionen, kein Merge und kein produktiver Rollout.

## Tatsächlich durchgeführt

- `npm test`: fünf Testdateien bestanden. Neue Prüfungen decken Anlegen/Ändern, ungültige Werte, Besitzerrechte, gesperrten Eingang, Synchronisation an ein zweites Mitglied, Felderhalt und veraltete Versionen ab.
- Offline-Integration mit IndexedDB und echter API/Datenbank: offline anlegen/umfärben, Modul-Neuladen, Wiederverbindung, Konflikt durch konkurrierende Umbenennung, ausdrückliche Auflösung ohne Überschreiben von Name/Mitgliedern und erneute Anmeldung.
- PGlite: Upgrade von Schema 001, wiederholte Migration, Restore alter Sicherung ohne Farbspalte, Backup/Restore mit expliziter Farbe, Datenbank-Constraint und sichere Fallbacks.
- `npm run build`: TypeScript und Produktionsbuild bestanden. Bestehende Bundlegrößenwarnung bleibt.
- GitHub Actions [Lauf 38024760857](https://github.com/skords83/notera/actions/runs/38024760857): Browserregressionen einschließlich Farbauswahl, Abbrechen, Tastatur, Mitgliederabgleich und Offlineänderung sowie Desktop-/360-/320px-Screenshots in beiden Modi bestanden. Container-Build, PostgreSQL-Start, Anmeldungseinrichtung und Neustartprüfung ebenfalls erfolgreich; GHCR-Veröffentlichung wie vorgesehen übersprungen.
- Berechneter Kontrast der zehn neuen Farben gegenüber dem App-Hintergrund: mindestens 5,0:1 hell und 7,4:1 dunkel.

## Blockiert / noch nicht nachgewiesen

- Lokaler Browserlauf versucht: `listen EPERM 127.0.0.1:3217`. Deshalb lokal keine Desktop-/360-/320-Pixel-Sichtprüfung und keine Screenreader-Abnahme behauptet.
- Docker ist lokal nicht verfügbar. PostgreSQL-/Containerprüfung erfolgt über den bestehenden PR-Workflow; dieser prüft zusätzlich Migration 002, den Altstandard und Farbpersistenz nach Neustart.
- Die CI-Screenshots wurden erzeugt, konnten aber lokal nicht zur Sichtprüfung heruntergeladen werden (DNS-Zugriff auf den Artefaktserver blockiert). Automatische Layoutchecks ersetzen keine Sichtprüfung. Echte Android-Geräte und Screenreader wurden nicht geprüft.

## VPS-Update nach späterer Freigabe

Vorher sichern. Nach Merge und erfolgreichem Image-Build den bestehenden Ablauf `docker compose pull` und `docker compose up -d` verwenden. Migration 002 läuft beim Start automatisch und additiv, auch auf bestehenden Installationen. Alle App-Tabs schließen und neu öffnen, damit der wartende Service Worker aktiviert wird. Anmeldung, Farbauswahl und Abgleich prüfen. Neue JSON-Backups mit Farbe nur auf Schema 002 oder neuer wiederherstellen; alte Backups bleiben kompatibel. Keine neuen Umgebungsvariablen erforderlich.

---

# Aktuelle Korrekturen – 10. Oktober 2026

Basis: `main` bei `bbdb1464cbd17221afa7e308433a95731658650f`. Die lokalen Quelldateien wurden vor Änderungen anhand aller Git-Blob-Prüfsummen mit dem aktuellen GitHub-Baum verglichen; keine Abweichung. Arbeitsbranch: `fix/proxy-login-list-validation-ui`. Kein Merge, keine Änderung produktiver Daten oder Zugangsdaten und kein produktiver Rollout.

## Fehlernachweis und Änderungen

Die Regressionstests wurden zunächst gegen den unveränderten Code ausgeführt und schlugen wie erwartet fehl: Client B hinter demselben Proxy erhielt nach Client A ebenfalls 429 statt 401; eine serverseitig abgelehnte neue Liste verschwand aus der Queue (0 statt 1 Eintrag). Mit den Korrekturen bestehen beide Tests.

- Explizites `TRUSTED_PROXIES` als IP-/CIDR-Liste; sichere Voreinstellung ohne Header-Vertrauen. Das Login-Limit bleibt 10/15 Minuten. Tests prüfen getrennte Clients, direkte Header-Manipulation, mehrstufige Ketten, IPv4-gemappte Adressen und ungültige Konfiguration.
- Gemeinsame deutsche Listenname-Validierung vor Einreihung und auf dem Server. Abgelehnte Anlegeanfragen bleiben über Sync/Neuladen erhalten und sind korrigierbar oder ausdrücklich verwerfbar. Abhängige Änderungen warten. Echter Rechteentzug entfernt weiterhin Cache und zugehörige Queue-Einträge.

| Vorher | Nachher | Zweck |
| --- | --- | --- |
| „1 Aufgaben“, unvollständige Zähler in Sonderansichten | Singular/Plural einschließlich Erledigt und Papierkorb | Verständliche Anzahl |
| Fokusrahmen direkt um das schmale Eingabefeld | Ein ruhiger Außenrahmen um die Schnelleingabe bei Tastaturfokus | Sichtbarer Fokus ohne doppelte Umrandung |
| Rückgängig blieb unbegrenzt stehen | Acht Sekunden; neuer Vorgang setzt Timer zurück; Hover, Fokus und verborgener Tab pausieren | Bedienbare, begrenzte Rückmeldung |
| Statuszeile war auf breiten Desktops anders ausgerichtet | Gleiche 1000px-Spalte wie Überschrift, Eingabe und Aufgabenbereich | Konsistente Ausrichtung |
| ISO-Datum/-Uhrzeit | Deutsches Kalenderdatum bzw. Uhrzeit in gespeicherter Zeitzone mit Zonenangabe | Kein Tagesversatz reiner Datumswerte |

## Prüfstand dieser Änderung

- `npm test`: lokal bestanden (vier Testdateien, insgesamt 17 Testfälle: 8 Domäne/API, 1 Offline-Integration, 5 Proxy, 3 Validierung/Anzeige).
- `npm run build`: lokal bestanden, einschließlich TypeScript. Bestehende Vite-Bundlegrößenwarnung bleibt; keine neue Abhängigkeit.
- Offline-Integration: ungültige Namen; gültiges Trimmen; persistierte ungültige Altanfrage; serverseitig abgelehnte gültige Namen; Korrektur inklusive abhängiger Aufgaben; bewusstes Verwerfen; offline anlegen, Client neu laden und online synchronisieren; tatsächlicher Rechteentzug.
- Lokaler Browserstart erneut versucht, durch `listen EPERM 127.0.0.1:3217` blockiert. Keine lokale visuelle Prüfung behauptet.
- Im bestehenden GitHub-Workflow sind zusätzliche Browser-Regressionsprüfungen mit temporären Konten/Datenbank und Screenshots für Desktop/360/320 eingerichtet. Ergebnis des PR-Laufs wird nachgetragen.
- Keine eigene Android-, Produktions- oder VPS-Prüfung. Die vom Nutzer gemeldete funktionierende Anmeldung/Aufgabenanlage/PC-Android-Synchronisation ist ein Nutzerbericht, kein hier durchgeführter Test.

Beim späteren VPS-Update sind die konkrete vertrauenswürdige Traefik-Adresse und die Environment-Weitergabe zu setzen; siehe [TRAEFIK.md](TRAEFIK.md). Keine Migration. Keine Stufe-B-Funktion begonnen.

---

# Entwicklungs- und Prüfbericht

Stand: 9. Oktober 2026. **Der vollständige Entwicklungsauftrag ist noch nicht abgeschlossen.** Stufe A ist implementiert und automatisiert geprüft, aber noch nicht vollständig abgenommen. Stufe B bleibt entsprechend der ausdrücklich vorgegebenen Abnahmereihenfolge offen.

## Vorhanden

- Eigenständiges React-/TypeScript-/Fastify-Projekt mit Lockfile, gemeinsamer Validierung und versionierter initialer SQL-Migration.
- Dauerhafter PostgreSQL-Speicher; lokal PGlite mit derselben Migration. Bootstrap-CLI für zwei getrennte Konten ohne Standardpasswörter.
- Sitzungen, scrypt-Passwörter, Origin-/CSRF-Prüfung, Login-Limit, Sicherheitsheader.
- Persönlicher Eingang, private und ausdrücklich geteilte Listen, Besitzer-/Mitgliedsrechte und validierte Zuweisung.
- Aufgaben mit Titel, Notizen, HTTP-/HTTPS-Links, Datum oder Uhrzeit mit Zeitzone; Bearbeiten, Verschieben, Erledigen, Wiederöffnen und Rückgängig.
- Persönliche Heute-Auswahl, Überfällige und frühere Auswahl, Suche, Geplant/Alle/Markiert/Erledigt, Papierkorb/Wiederherstellen.
- Dauerhafte IndexedDB-Queue mit UUIDs/Idempotenzschlüsseln, versionierte Konflikte, atomare Bestätigung, Abgleich bei Öffnen/Fokus/Online und Cursor-SSE.
- Rechteentzug bereinigt bekannten lokalen Zugriff. Sitzungsablauf bewahrt Änderungen. Mehrere Tabs verwenden IndexedDB-Transaktionen und Web Locks.
- App-Shell-Service-Worker, Manifest und PNG-Icons; responsive Navigation, Desktop-Detailpanel, Hell-/Dunkel-/Systemdarstellung, Tastaturfokus und native Dialoge.
- Compose, Healthchecks, persistentes DB-Volume, Backup-/Restore-CLI, Betriebshinweise.

## Tatsächlich ausgeführte Prüfungen

`npm test`: bestanden, zwei Testdateien. Direkt ausgeführt ergeben diese **acht Domänen-/API-Tests plus einen umfangreichen Offline-Integrationstest**. Der Node-26-Testprozess zeigt im Gesamtlauf die zwei Testdateien als Einheiten an.

Die Domänentests prüfen insbesondere:

1. Privater Eingang unsichtbar für den anderen Benutzer; unberechtigte Änderungen/Ziellisten abgewiesen; geteilte Bearbeitung und Besitzerrechte.
2. Berechtigungsentzug mit bereinigter Zuweisung; ab dann keine weiteren Aufgaben-/Sync-Zugriffe.
3. Wiederholung identischer Requests ohne doppelte Aufgabe; derselbe Schlüssel mit verändertem Inhalt abgewiesen.
4. Unabhängige parallele Feldänderungen erhalten; gleiche Felder sowie Löschen/Bearbeiten/Verschieben erzeugen Konflikte.
5. Persönliche Heute-Auswahl verändert den anderen Benutzer nicht; fällig und ausgewählt liefert eine Kategorie.
6. Leere/zu lange Titel, unzulässige Links/Zuweisungen, falsche Kalenderdaten sowie nicht existierende/mehrdeutige Berliner Uhrzeiten abgewiesen. Datumswerte bleiben über Zeitzonen unverändert.
7. Papierkorbbereinigung erzeugt unabhängige Tombstones; zu alte Cursor erfordern Reset; endgültig gelöschte Aufgaben werden nicht durch Edits wiederbelebt.
8. HTTP-Sitzungen, Origin-Schutz, Cookieattribute, Logout und Login-Limit.

Backup und Persistenz werden im selben Testpaket mit einer **echten PGlite-Datenbank** geprüft: Schließen und Wiederöffnen des Datenordners; vollständige Sicherung; Restore in einen zweiten frischen Datenordner; Vergleich der Aufgaben und Listen; Restore in eine bereits befüllte Instanz abgewiesen. Das ist kein Nachweis für Containerneustart oder PostgreSQL-Container-Restore.

Der Offline-Integrationstest verwendet den tatsächlichen Client-Store und die tatsächliche Fastify-API/PGlite-Datenbank. Browser-APIs und IndexedDB werden durch `fake-indexeddb`/Testadapter bereitgestellt; Netzwerkaufrufe laufen über Fastify Injection. Geprüft sind Offline-Anlegen/-Bearbeiten/-Erledigen, erneutes Laden des Clientmoduls aus gespeichertem Zustand, Antwortverlust nach Commit, Serverfehler, Sessionablauf mit erneuter Anmeldung, echte Versionskonflikte, explizite Wiederherstellung nach Löschkonflikt, Konflikte in späteren Queue-Schritten sowie Rechteentzug. **Das ersetzt keinen echten Browser-/Geräteneustart.**

`npm run build`: bestanden, einschließlich strikter TypeScript-Prüfung und Service-Worker-Erzeugung. Der Clientbundle beträgt rund 551 kB minifiziert / 162 kB gzip; Vite gibt eine Größenwarnung aus. Eine spätere Aufteilung ist möglich, aber keine Funktionsabnahme.

Produktionsdateien über Fastify Injection: `/`, Manifest, Service Worker, beide PNG-Icons und `/api/health` jeweils HTTP 200 mit korrektem Inhaltstyp. Keine realen TCP-Verbindungen in diesem Test.

Die Paketinstallation meldete keine bekannten Schwachstellen. Die abschließende separate Prüfung `npm audit --omit=dev` konnte wegen `EAI_AGAIN registry.npmjs.org` nicht abgeschlossen werden. Sie ist **nicht als bestandener vollständiger Sicherheitscheck** zu werten.

## Nachtrag: automatischer Docker-Build auf GitHub

Der [Workflow-Lauf 37987150517](https://github.com/skords83/notera/actions/runs/37987150517) für Commit `ec94a0eb4b8680a0a62fa8d665cd24155c0a9b23` hat die automatisierten Tests sowie den Docker-Build einschließlich TypeScript/Vite erfolgreich abgeschlossen. Auf dem GitHub-Runner wurden App und PostgreSQL mit Docker Compose gestartet, HTTP-Endpunkte und die Bootstrap-CLI geprüft und nach Neustart beider Container die Existenz des angelegten Testkontos per SQL bestätigt. Die Testcontainer samt Testvolume wurden anschließend entfernt.

Auch der anschließende Publish-Job war erfolgreich. Das Image wurde als `ghcr.io/skords83/notera:latest` sowie `ghcr.io/skords83/notera:sha-ec94a0eb4b8680a0a62fa8d665cd24155c0a9b23` für `linux/amd64` veröffentlicht.

Das ergänzt die lokalen Tests um einen echten Containerlauf. Es ersetzt weder die Browser-/Android-Abnahme noch den noch ausstehenden Container-Backup-/Restore-Test. Die Standard-Compose-Datei verwendet jetzt das von GitHub veröffentlichte Image; `compose.build.yaml` erlaubt weiterhin einen lokalen Build. Der Workflow ist unter `.github/workflows/docker.yml` versioniert.

## Blockierte/noch offene Abnahme

- Lokaler Webserver: Start versucht, `listen EPERM 127.0.0.1:3000`. Die Ausführungsumgebung untersagt lokale Sockets.
- Chromium: Start versucht, `setsockopt: Operation not permitted`, Prozess beendet. Deshalb keine durchgeführte visuelle Desktop-/360px-/320px-Kontrolle, keine geprüften Screenshots, keine reale Tastatur-/Touch-Abnahme.
- Docker ist lokal nicht installiert. Inzwischen wurden Docker-Build, Compose-Start mit PostgreSQL, Bootstrap-CLI und Kontopersistenz nach Containerneustart in GitHub Actions erfolgreich geprüft. Container-Backup/Restore und ein umfassender Datenvergleich nach Neustart bleiben offen.
- Echter Abgleich zwischen PC und Android, installierte Android-PWA, Offline-App-Neustart sowie Bildschirmtastatur nicht geprüft.
- Der vorbereitete `npm run test:browser`-Lauf wurde wegen dieser Umgebungssperren nicht vollständig ausgeführt. Er ist ein Startpunkt für echte Browserchecks, keine Behauptung bestandener Abnahme.
- Keine produktive Veröffentlichung und keine Änderung an einem laufenden Server.

## Nächste Abnahme in geeigneter Umgebung

1. Lokalen Produktionsbuild starten und `npm run test:browser` ausführen. Screenshots beider Farbschemata prüfen; Details, lange Texte, Navigation und Tastatur separat auf 320/360px kontrollieren.
2. Compose starten, Konten per CLI anlegen, gemeinsame Liste mit beiden Konten bearbeiten; private Daten auch über direkte API-Anfragen prüfen.
3. PWA auf echtem Android per HTTPS installieren; PC und Android gleichzeitig und offline bearbeiten, App offline neu starten, dann Konflikte und Abgleich prüfen.
4. Container neustarten, Persistenz prüfen, Sicherung in einer frischen Compose-Instanz wiederherstellen. Audit bei erreichbarem Registry wiederholen.
5. Nach erfolgreicher Stufe-A-Abnahme Stufe B implementieren und prüfen.

## Noch nicht implementiert

Stufe B: Unteraufgaben, Tags, Listengruppen, Listenfarben/-symbole, Prioritäten, manuelle Sortierung, gespeicherte intelligente Filter, Wiederholungsserien, mehrere Erinnerungen, Web Push, Snooze und Scheduler. Die persönliche Markierung sowie die verlangten Basisansichten sind bereits vorhanden; sie stellen keinen Abschluss von Stufe B dar. Reservierte Erinnerungs-/Push-Tabellen sind ausdrücklich kein funktionierendes Benachrichtigungssystem.

Stufe C bleibt wie beauftragt später: native Standortereignisse, Widgets, Anhänge, differenzierte Rollen und CalDAV.

## Unteraufgaben – Prüfstand 10. Oktober 2026

Basis: GitHub `main` a612ac0ce927f281486e9f89783ac2e42813182b. Alle bereitgestellten Repository-Dateien vor Änderungen gegen GitHub-Blob-Hashes abgeglichen; keine Abweichungen, kein AGENTS.md im Repository. Lokale Git-Metadaten sind in dieser Umgebung nicht zugänglich; Branch/PR werden über den GitHub-Connector erstellt.

Implementiert: Unteraufgaben-UI, Einzelmutationen mit geerbten Serverrechten, Fortschritt, atomare Statusaktionen samt Undo, persistente Offline-Queue und Konfliktauflösung, Migration 003 und rückwärtskompatibler Restore. Details und Upgrade siehe README/Architektur.

Lokal geprüft (ausschließlich temporäre Testdatenbanken/Konten):
- `npm test`: erfolgreich, sechs Testdateien einschließlich neuer Domänenregression und erweiterter Offline-/Migrationstests.
- `npm run build`: erfolgreich (TypeScript, Vite, Service Worker). Bestehende Warnung zu einem Bundle über 500 kB bleibt.
- Domäne: Trim/Leerzeichen/Längenvalidierung, unbekannte Felder, private/geteilte Zugriffe, unabhängige Schritte, gleicher Schritt mit Konflikt, alle Statusregeln, atomare Bestätigung/Undo, verlorene Antwort/Idempotenz, Move-Quell-/Zielrechte, Papierkorb/Restore, Entfernen/Hard-Delete und Nicht-Wiederanlage.
- Offline: neue Hauptaufgabe und Schritte, Bearbeiten/Abhaken, gemeinsame Erledigung plus Undo, IndexedDB-Neuladen, verlorene Antwort, sichtbarer Konflikt und explizite Auflösung, Rechteentzug einschließlich lokaler Kinder.
- Migration: bestehende Aufgabe unverändert nach Upgrade, wiederholte Migration, alte Sicherung ohne Unteraufgaben; neuer Backup-/Restore-Roundtrip einschließlich entfernter Schritte.

Blockiert/offen:
- `npm run test:browser` lokal gestartet, aber bereits beim Testserver durch `listen EPERM: operation not permitted 127.0.0.1:3217` blockiert. Keine lokalen Browserergebnisse oder Sichtprüfungen behauptet.
- Browserregressionen für Enter/Fokus, Validierung, Bearbeiten, Abhaken/Wiederöffnen/Entfernen, Bestätigen/Abbrechen/Undo, Offlineanlage/Reload sowie Desktop/360/320 in Hell/Dunkel sind in den bestehenden Workflow eingebunden. CI-Ergebnis wird am PR geprüft.
- Echtes Android-Gerät und Screenreader-Abnahme stehen aus; Chromium ersetzt diese Prüfungen nicht.
- Lokaler Docker-/PostgreSQL-Containerlauf nicht durchgeführt; Container und Migration laufen im vorhandenen isolierten CI-Compose-Prüfpfad. Kein VPS-Zugriff, kein Deployment, kein Merge.

CI-Zwischenstand: [Lauf 38075164367](https://github.com/skords83/notera/actions/runs/38075164367) für Commit `3965df5` hat Tests, Build und sämtliche Browserregressionen erfolgreich abgeschlossen, einschließlich der Unteraufgaben-Screenshots/Überbreitenprüfungen in 1360/360/320 Pixeln und beiden Themes. Screenshots liegen im CI-Artefakt `browser-screenshots`; eine manuelle Sichtprüfung dieser Bilder wurde in dieser Umgebung nicht durchgeführt. Ergänzende Regressionen prüfen nun außerdem die Fokusrückgabe nach Escape/Entfernen, den ursprünglichen Erledigungszeitpunkt bei Undo und persistente 410-Konflikte nach endgültigem Löschen einer Hauptaufgabe. Lokale Tests und Build bestehen auch nach diesen Ergänzungen.
Der gleiche CI-Lauf hat anschließend auch den Produktions-Container gebaut, App/PostgreSQL gestartet sowie den neuen PostgreSQL-Test für Upgrade bestehender Aufgaben, atomare Statusaktionen und JSON-Backup/Restore in eigenen temporären Datenbanken erfolgreich ausgeführt.

## Aufklappbare Unteraufgaben – 10. Oktober 2026

Basis: aktuelles `main` f42c4c0df1efb04299b3f115357a527786fc0a6d; Arbeitsdateien vollständig per GitHub-Blob-Hash abgeglichen, keine Abweichungen und kein AGENTS.md im Repository. Eigener Branch `feat/inline-subtasks`. Keine Änderungen an Schema, Backend, Speicherung, Queue, Konfliktlogik oder Abhängigkeiten.

Implementiert: getrennte Aufklapp-/Fortschrittsbuttons in der Aufgabenliste; mehrere lokal offene Aufgaben; eingerückte Schritte mit Checkboxen, durchgestrichenen erledigten Titeln und Enter-/Escape-Eingabe; Unteraufgaben im Detailpanel direkt nach dem Titel samt schmalem Balken. Eindeutige ARIA-Zuordnungen, 44-Pixel-Touchziele, Zeilenumbruch und Fokusführung. Papierkorbrechte und ungespeicherte Detailentwürfe bleiben auch bei einer Remote-Synchronisation erhalten.

Lokal: `npm test` erfolgreich (sechs Testdateien), `npm run build` erfolgreich (TypeScript/Vite/Service Worker; bestehende Bundlegrößenwarnung). `npm run test:browser` gestartet, aber Testserver durch `listen EPERM` auf 127.0.0.1:3217 blockiert. Ausschließlich isolierte Testdaten.

Neue Browserregressionen im unveränderten Actions-/Container-Workflow: Auf-/Zuklappen per Pfeil/Fortschritt/Tastatur ohne Detailöffnung, getrennte Haupt-/Kindcheckboxen und Undo, sofortige Fortschrittswerte, Eingabe/Leerzeichenfehler/Escape, mehrere offene Aufgaben, Zustandserhalt nach Sync, zwei Browserkontexte und ungespeicherte Notizen/Links, Offlineanlage/Abgleich, Papierkorb/Restore. Screenshots und Überbreiten-/Touchflächenprüfungen für Desktop/360/320 in Hell/Dunkel sowie Detailposition/Balken. Actions-Lauf [38092624642](https://github.com/skords83/notera/actions/runs/38092624642) ist vollständig erfolgreich: API-/Offline-Tests, Build, Browserregressionen einschließlich Remote-Synchronisation mit ungespeicherten Notizen, Bildschirmbreiten 1360/360/320 px und Hell-/Dunkelmodus sowie Container-, PostgreSQL-Migrations- und Backup/Restore-Prüfung. Ein zuvor zu früh auswertender Label-Locator wurde auf die Textbox-Rolle umgestellt; der DOM-Snapshot bestätigte den erhaltenen Notizwert.

Offen: manuelle Sichtprüfung der Screenshots, Screenreader und echtes Android-Gerät. Kein Merge, keine produktive Veröffentlichung oder VPS-Änderung. Keine zusätzlichen Upgrade-Schritte gegenüber Schema 003; nach regulärem Image-Update PWA-Tabs neu öffnen.

## Kompakte Unteraufgabengruppen – 11. Oktober 2026

Basis: `main` f2bb7141fea04f50bcdfd5609e165dbe352d5855. Alle bereitgestellten versionierten Dateien vor Änderungen per GitHub-Blob-Hash abgeglichen; keine Abweichungen, kein AGENTS.md. Branch `fix/compact-subtask-groups`; lokale Git-Metadaten nicht zugänglich, GitHub-Connector verwendet.

Darstellung: Listenname nur in listenübergreifenden Ansichten/Suche; Fortschritt nur eingeklappt. Pfeil neben dem Titel, kompakte eingerückte Schritte, Trennlinie nach der ganzen Gruppe. Immer erreichbarer Aufgabenmenübutton mit „Unteraufgabe hinzufügen“, direkter Fokus auch beim ersten Schritt, Enter für weitere Schritte, Escape mit Rückgabe des Fokus und Entfernen eines leeren Bereichs. Fehler erhalten die Eingabe. Detailfortschritt und bestehende Queue-/Berechtigungs-/Konfliktaktionen unverändert; kein Schema- oder Dependency-Wechsel.

Lokal bestanden: `npm test` (sechs Testdateien), `npm run build` (TypeScript, Vite, Service Worker; bekannte Bundlegrößenwarnung). `npm run test:browser` versucht, durch `listen EPERM 127.0.0.1:3217` vor Browserstart blockiert.

Browserregressionen im bestehenden Actions-/Container-Workflow ergänzt: erster Schritt ohne Details, Abbruch/Leerzeichenvalidierung/Fokus, Fortschritt nur geschlossen, Listenname in konkreter Liste gegenüber Alle/Heute/Markiert/Suche, getrennte Aktionen. Bestehende Offline-/Undo-/Remote-Sync-/Detailentwurfs-/Papierkorbregressionen erhalten. Neue Screenshot-Szenarien mit vier Hauptaufgaben, null/einer/zwei/drei Unteraufgaben, erledigten Schritten, langen Titeln, geschlossenem Fortschritt und Menü für 1360/360/320 px in Hell/Dunkel. Der vollständige [Actions-Lauf 38094275142](https://github.com/skords83/notera/actions/runs/38094275142) für Implementierungscommit `c30615245cbf8ea6fc7182ebe8b0c8259e9d2e67` ist erfolgreich: Tests, Build, sämtliche Browserregressionen, Produktions-Container, Compose/PostgreSQL, Migration/Backup/Restore und Persistenz nach Neustart. Der Publish-Job wurde wie vorgesehen übersprungen. Ein durch die Regression gefundener erneut ausgeführter Menüauftrag nach Undo wurde behoben; ein älterer Browserselektor ist an den entfallenen Listennamen angepasst. Haupttitel bleiben mit und ohne Schritte bündig, Kindcheckboxen sind gegenüber den Hauptcheckboxen um 16 px eingerückt.

Sichtprüfung ausdrücklich **offen**: Die [CI-Screenshots](https://github.com/skords83/notera/actions/runs/38094275142/artifacts/11685501378) wurden erzeugt (u. a. `compact-groups-{dark,light}-{1360,360,320}.png` und entsprechende Menüaufnahmen). Der GitHub-Connector konnte das ZIP bereitstellen; der lokale Abruf scheiterte an Netzwerk-/DNS-Beschränkungen (`gh run download`: keine Verbindung zu api.github.com; Download-URL: Host nicht auflösbar). Kein Browser ist mit dem Computer-Use-Werkzeug verbunden. Daher keine tatsächliche visuelle Prüfung der Bilder behauptet. Automatische Überbreiten- und 44-Pixel-Touchflächenprüfungen bestehen, ersetzen aber keine Sichtprüfung von Abständen/Einrückung. Artefakte werden vom bestehenden Workflow sieben Tage aufbewahrt.

Weiter offen: echtes Android-Gerät, Bildschirmtastatur und Screenreader. [PR #7](https://github.com/skords83/notera/pull/7). Kein Merge, kein produktiver Rollout; Actions-/Container-Workflow unverändert.
