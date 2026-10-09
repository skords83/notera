# Notera auf dem VPS mit Dockhand und Traefik

## Vor dem ersten Start

1. Den Deployment-Pull-Request nach main übernehmen. Unter GitHub Actions muss „Test and publish Notera“ erfolgreich abgeschlossen sein. Der Workflow veröffentlicht erst nach Tests, Produktionsbuild und Compose-Start mit PostgreSQL.
2. Das Container-Paket notera unter https://github.com/users/skords83/packages/container/notera öffnen. Für Abruf ohne Anmeldung in den Package Settings die Sichtbarkeit auf Public stellen. Ein öffentliches Repository macht das Paket nicht automatisch öffentlich. Alternativ den VPS/Dockhand mit einem Token mit read:packages bei GHCR anmelden; Tokens nicht in Compose eintragen.
3. DNS für notera.skords.de auf den VPS richten, gegebenenfalls auch den IPv6-Eintrag korrekt setzen. Traefik mit websecure, letsencrypt, Netzwerk proxy und crowdsec@docker wird als vorhanden vorausgesetzt.

## Dockhand-Stack

Neuen Stack „notera“ anlegen und den Inhalt von compose.vps.yaml verwenden. Separat in Dockhand die Compose-Umgebungsvariablen bzw. .env hinterlegen:

```dotenv
POSTGRES_PASSWORD=HIER_EIN_NEUES_ZUFAELLIGES_HEX_PASSWORT
APP_ORIGIN=https://notera.skords.de
NOTERA_DOMAIN=notera.skords.de
TRASH_DAYS=30
```

Ein Passwort auf dem VPS mit `openssl rand -hex 32` erzeugen und privat in die Umgebung eintragen. Den Platzhalter nicht verwenden. APP_ORIGIN ist der exakte Browser-Ursprung ohne abschließenden Slash; bei einer anderen Domain auch NOTERA_DOMAIN ändern.

Compose ersetzt Variablen aus seiner Umgebung/.env vor dem Start. Eine lediglich als env_file in den Container eingebundene Datei ersetzt diese Compose-Variablen nicht. Domain und Image müssen keine Container-Umgebungsvariablen sein.

Stack starten. App und DB müssen healthy sein. Die App hängt am Proxy und am isolierten Datenbanknetz; die DB nur am Datenbanknetz. Keine Hostports werden veröffentlicht. Das bestehende Termina-Volume bleibt unberührt.

## Alternativ per Terminal

Im Ordner mit compose.vps.yaml und .env:

```sh
docker compose -f compose.vps.yaml config --quiet
docker compose -f compose.vps.yaml pull
docker compose -f compose.vps.yaml up -d --wait
docker compose -f compose.vps.yaml ps
docker compose -f compose.vps.yaml logs --tail=100 app
```

## Konten anlegen

Auf dem VPS in einem interaktiven Terminal (auch nach Dockhand-Start):

```sh
docker exec -it notera-app npm run user:add -- sven "Sven"
docker exec -it notera-app npm run user:add -- sandra "Sandra"
```

Passwörter werden verdeckt abgefragt, mindestens 12 Zeichen. PostgreSQL erlaubt den parallelen CLI-Zugriff während die App läuft. Kein erneutes Anlegen bestehender Konten.

Danach https://notera.skords.de öffnen. Bei HTTP 502 zuerst App-/DB-Status prüfen. Bei Anmelde-/Originfehlern APP_ORIGIN mit der tatsächlich verwendeten URL vergleichen.

## Abnahme

Der Compose-Test im Workflow ersetzt keine Android-/Browser-Abnahme und keinen PostgreSQL-Restore-Test. Erst mit Beispielaufgaben testen: Anmeldung für beide Personen, privater Eingang, geteilte Liste, PC/Android-Abgleich, Offline-Neustart, konkurrierende Änderungen und Containerneustart. Android-PWA über das Browsermenü installieren. Erinnerungen/Push und weitere Stufe-B-Funktionen sind noch nicht implementiert.

## Sicherung und Aktualisierung

```sh
docker exec notera-app npm run backup -- /tmp/notera-backup.json
docker cp notera-app:/tmp/notera-backup.json ./notera-backup.json
chmod 600 ./notera-backup.json
docker exec notera-app rm /tmp/notera-backup.json
```

Bei weiteren Sicherungen neue Dateinamen verwenden; CLI überschreibt nicht. Sicherungen geschützt außerhalb des VPS aufbewahren. Wiederherstellung zuerst in einem separaten Stack mit eigener frischer Datenbank prüfen (siehe README).

Updates über Dockhand „Pull/Recreate“ bzw. `docker compose -f compose.vps.yaml pull` und `up -d --wait`. Eine Veröffentlichung auf GHCR aktualisiert den VPS nicht automatisch. Vor Updates sichern. Für festgelegte Versionen NOTERA_IMAGE auf `ghcr.io/skords83/notera:sha-<vollständiger Commit-SHA>` setzen. Datenbankpasswort nach erster Initialisierung nicht nur in .env ändern; dafür ist auch eine DB-Passwortänderung nötig. Volumes nicht löschen.

Bei persistenten Problemen der Echtzeitsynchronisation Traefik-Timeouts prüfen; die App hat zusätzlich einen Abgleich alle 30 Sekunden, solange sie sichtbar ist.
