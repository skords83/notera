# Notera – Entwicklungsauftrag für die Coding AI

Stand: 9. Oktober 2026. Auftraggeber: Sven Kierdorf. Zielnutzer der ersten Version: Sven und Sandra.

## Arbeitsauftrag

Entwickle eine selbst gehostete Aufgaben-App namens **Notera** für den PC und Android. Nutze diesen Auftrag und die beigefügte Datei `Notera-Designreferenz.html` als Grundlage. Liefere eine tatsächlich benutzbare Anwendung mit dauerhaft gespeicherten Daten, Anmeldung, Offlinebetrieb und Synchronisation. Eine Oberfläche mit lokalen Beispieldaten ist nur eine Designreferenz, kein fertiges Produkt.

Arbeite schrittweise bis zu den unten definierten Prüfkriterien. Triff übliche reversible Implementierungsentscheidungen selbst und dokumentiere sie. Frage nur bei fehlenden Informationen, die eine konkrete Umsetzung blockieren. Verlange keine produktiven Zugangsdaten für die Entwicklung. Prüfe ein vorhandenes Repository und seine Anweisungen, bevor du darin Änderungen vornimmst; lege sonst ein neues Projekt an. Änderungen an einem laufenden Server oder eine produktive Veröffentlichung sind ein eigener Auftrag.

## 1. Zweck und festgelegte Entscheidungen

Notera hält spontane Gedanken fest: „Das müsste ich erledigen“, „Das möchte ich drucken“, „Das muss ich bestellen“. Größere Vorhaben lassen sich daraus entwickeln. Der vorhandene Kalender verwaltet Termine; das Familien-Dashboard verwaltet wiederkehrende Familienpflichten. Notera soll keine Pflicht zur doppelten Pflege schaffen.

- Eigener Aufgabenserver mit eigener Datenbank ist die zentrale Datenquelle.
- Baïkal wird nicht als Hauptspeicher vorausgesetzt. CalDAV-Import/-Export und später gegebenenfalls ein begrenzter bidirektionaler Abgleich sind optionale Ausbaustufen.
- Private Listen und gemeinsame Listen mit Sandra gehören zur ersten nutzbaren Version.
- PC: responsive Web-App. Android zunächst: installierbare, offlinefähige PWA.
- Später: Android-App oder native Android-Erweiterung für Standorterinnerungen und Widgets. Die PWA darf keine zuverlässigen Standortereignisse im Hintergrund versprechen.
- Design: Darkmode als Standard, optional Hellmodus und Systemdarstellung.
- Der persönliche Eingang ist die Startansicht. „Heute“ ist eine bewusste Auswahl und eine Fälligkeitsübersicht, keine Pflicht für jede Aufgabe.
- Aufgaben dürfen ohne Datum, Priorität, Zuweisung, Tags oder Erinnerung existieren.
- Aufgaben und Erinnerungen sind voneinander getrennt: Fälligkeit erzeugt nicht automatisch eine Benachrichtigung.

## 2. Umfang und Reihenfolge

### Stufe A – vollständige erste nutzbare Version

Anmeldung, zwei Benutzerkonten, persönlicher Eingang, private und gemeinsame Listen, Aufgabe anlegen/bearbeiten/abhaken/wieder öffnen, Notizen und Links, optionale Zuweisung, Fälligkeit, bewusste Heute-Auswahl, Suche, Papierkorb, Offlinebetrieb, Synchronisation, responsive PWA, Docker Compose und Sicherung/Wiederherstellung.

Diese Stufe ist eine Entwicklungsreihenfolge und verkleinert nicht den vereinbarten Zielumfang. Erst ihre Prüfkriterien vollständig erfüllen, dann Stufe B umsetzen.

### Stufe B – vereinbarter erweiterter Funktionsumfang

Unteraufgaben, Tags, Listengruppen, Listenfarben und Symbole, Priorität, Markierung, manuelle Sortierung, intelligente Listen, Wiederholungen, mehrere optionale Erinnerungen, Web Push und „Später erinnern“. Auch diese Funktionen müssen gespeichert, offlinefähig und synchronisiert sein.

### Stufe C – späterer Ausbau

Standorterinnerungen mit nativer Android-Anbindung; Homescreen-Widgets; Anhänge; zusätzliche Benutzer und differenzierte Listenrechte; optionale CalDAV-Anbindung. Keine dieser Funktionen als fertig darstellen, bevor sie umgesetzt und geprüft ist. Keine Siri-/Apple-Integration erforderlich.

## 3. Bedienung und Ansichten

### Eingang und Schnelleingabe

- Jeder Benutzer hat einen privaten Eingang, der nicht geteilt werden kann.
- Eingabe eines Titels und Enter/Tipp auf Hinzufügen genügt; keine weiteren Pflichtfelder.
- Im Eingang angelegte Aufgaben bleiben privat. Eingabe in einer konkreten Liste legt dort an.
- Bei Eingabe aus einer intelligenten Ansicht, etwa Heute, muss das Ziel sichtbar sein. Standard: persönlicher Eingang. Für Heute wird zusätzlich die persönliche Heute-Auswahl gesetzt.
- Whitespace-only-Titel ablehnen, Text trimmen; Server und Client setzen dieselbe dokumentierte Höchstlänge. Formulardaten bei Fehlern erhalten.
- Nach dem Speichern Eingabe leeren und Fokus behalten. Offline sofort lokal speichern und „Ausstehend“ anzeigen.
- Keine natürliche Datumserkennung in Stufe A. Wörter wie „morgen“ nicht heimlich in ein Datum umwandeln.

### Navigation

Eingang, Heute, Geplant, Alle, Markiert und Erledigt als Ansichten, dazu echte Listen. „Geplant“ zeigt Aufgaben mit Fälligkeit. „Alle“ meint alle für den Benutzer sichtbaren Aufgaben, einschließlich privater und geteilter Listen, ohne gelöschte Aufgaben. Erledigte Aufgaben standardmäßig ausblenden, mit expliziter Umschaltung einblenden.

Desktop: Seitenleiste und Hauptbereich; Details bei Auswahl in einem Panel. Mobil: Listenübersicht, Aufgabenansicht und Details ohne dauerhaft sichtbare Desktop-Seitenleiste. Die mobile Aufgabenansicht soll den meisten Platz den Aufgaben geben. Schnelleingabe gut erreichbar, auch mit eingeblendeter Tastatur.

### Heute

- Offene Aufgaben mit heutiger Fälligkeit und vom Benutzer für heute ausgewählte Aufgaben.
- Überfällige Aufgaben in einem eigenen Abschnitt; dort ausblenden lässt die ursprüngliche Aufgabe bestehen.
- Keine Duplikate, wenn eine Aufgabe sowohl ausgewählt als auch heute fällig ist.
- Heute-Auswahl ist pro Benutzer gespeichert. Eine gemeinsame Aufgabe kann Sven für heute auswählen, ohne Sandras Planung zu verändern.
- Auswahl für ein bestimmtes lokales Datum speichern. Unerledigte persönliche Auswahl älterer Tage im Bereich „Nicht geschafft“ anbieten, ohne Fälligkeit zu erfinden oder automatisch jede Aufgabe weiterzutragen.

### Details und Erledigen

Titel, Notizen, Links, Zielliste, Fälligkeit, Zuweisung und später Unteraufgaben/Tags/Wiederholung/Erinnerungen. Optionales bleibt optisch zurückhaltend. Erledigen zeigt eine kurze Rückmeldung und eine Rückgängig-Aktion. Erledigte Aufgaben bleiben gespeichert und wieder öffnbar.

Bei Unteraufgaben zählt der Elternstatus ausdrücklich als eigener Zustand. Beim Erledigen eines Elternteils mit offenen Unteraufgaben die Wahl anbieten, auch alle Unteraufgaben zu erledigen. Keine stille Statusänderung. In der ersten Umsetzung einfache Hierarchie; das Modell erlaubt spätere zusätzliche Ebenen und verhindert Zyklen.

### Löschen

Löschen ist zunächst Soft Delete. Papierkorb mit Wiederherstellung und ursprünglicher Liste. Automatisches endgültiges Löschen nach 30 Tagen als dokumentierte, konfigurierbare Voreinstellung; vorher Wiederherstellung möglich. Synchronisations-Tombstones unabhängig vom Papierkorb aufbewahren. Zu alte Clients erhalten einen erzwungenen Vollabgleich, statt gelöschte Aufgaben wieder hochzuladen.

## 4. Benutzer, Freigabe und Berechtigungen

- Separate Benutzerkonten für Sven und Sandra; keine öffentliche Registrierung.
- Initiales Admin-Konto über einen dokumentierten Bootstrap-/CLI-Weg, ohne hart codiertes Passwort. Zweites Konto sicher anlegen; keine vorausgefüllten echten Passwörter in Konfigurationen.
- Listen sind zunächst privat. Teilen nur über ausdrückliche Aktion und Auswahl eines bestehenden Benutzers.
- Listenbesitzer bleibt Besitzer. Mitglieder dürfen Aufgaben anlegen, lesen, bearbeiten, verschieben und erledigen. Liste löschen und Mitgliedschaft verwalten darf nur der Besitzer.
- Für Verschieben müssen Schreibrechte auf Ausgangs- und Zielliste geprüft werden. Vor Verschieben zwischen privat und geteilt auf geänderte Sichtbarkeit hinweisen.
- Zugewiesen werden darf nur an ein aktuelles Listenmitglied. Entfernte Mitglieder dürfen keinen weiteren API-Zugriff behalten; Zuweisung bei Entfernung bereinigen.
- Server prüft Berechtigungen bei jedem Zugriff, einschließlich Suche, Export, Synchronisation, Push und Unteraufgaben. Keine Sicherheit ausschließlich durch versteckte UI-Elemente.
- Offline gespeicherte Daten sind auf einem bereits verbundenen Gerät zeitweise verfügbar. Nach bekanntem Rechteentzug lokale Kopien und ausstehende Zugriffe bereinigen; keine sofortige Fernlöschung eines offline befindlichen Geräts versprechen.
- Allgemeine Freigabelinks, E-Mail-Einladungen und externe Empfänger sind zunächst nicht erforderlich.

## 5. Datenmodell und zeitliche Semantik

Mindestens: Benutzer, Listen, Mitgliedschaften, Aufgaben, persönliche Aufgabenpräferenzen, Änderungsprotokoll, Geräte/Sync-Clients, Erinnerungen und Push-Abonnements. Später: Tags, Gruppen, gespeicherte Filter und Wiederholungsserien.

Aufgabe: stabile UUID, Listenzugehörigkeit, Titel, Notizen, optionale Links, optionaler Elternbezug, Priorität, optionale Zuweisung, Fälligkeitsart, Status, Erledigungszeitpunkt, Ersteller, Änderungszeitpunkt, Version, Löschzeitpunkt. Persönliche Heute-Auswahl und Markierung außerhalb der gemeinsamen Aufgabenfelder speichern. Tags in Stufe B listenbezogen; Filter und Gruppen benutzerbezogen. Dadurch bleiben Freigabe und Sichtbarkeit eindeutig.

- Eine Fälligkeit nur als Datum bleibt ein Kalenderdatum, kein UTC-Mitternachtszeitpunkt.
- Eine Fälligkeit mit Uhrzeit besitzt eine explizite Zeitzone; initiale Benutzerzeitzone `Europe/Berlin`, konfigurierbar.
- Technische Zeitstempel als UTC speichern. Benutzeranzeige lokal; Tagesgrenzen aus Benutzerzeitzone ableiten.
- Ungültige oder bei Zeitumstellung nicht existierende/mehrdeutige lokale Uhrzeiten erkennbar behandeln. Nicht unbemerkt um eine Stunde verschieben.
- Keine manuell selbst geschriebene Wiederholungsarithmetik, wenn eine geeignete gepflegte Bibliothek existiert.
- Datenbankmigrationen versionieren; keine destruktiven Änderungen an bestehender Produktion automatisch ausführen.

### Wiederholungen

Unterscheide fest geplante Wiederholung („jeden Montag“) und Wiederholung nach Erledigung („drei Tage nach Abschluss“). Beim Erledigen genau eine nächste Instanz erzeugen; paralleles Abhaken auf zwei Geräten darf keine doppelten Folgeaufgaben erzeugen. Erledigte Instanzen bleiben als Verlauf. Änderungen an Serie vs. Einzelinstanz klar unterscheiden. Monatsende, Schaltjahr, Sommer-/Winterzeit und verspätetes Erledigen testen. Bei festem Rhythmus standardmäßig den nächsten zukünftigen Termin erzeugen, ohne unbemerkt einen Stapel verpasster Instanzen anzulegen.

## 6. Synchronisation und Offlinebetrieb

Server ist die gemeinsame Quelle; Browserdatenbank ist Offlinecache und Warteschlange. App-Shell und bereits geladene Daten offline nutzbar. Anmeldung/Erstladen benötigt Verbindung. Offlinezustand ausdrücklich anzeigen, nicht als erfolgreich synchronisiert ausgeben.

- Lokale UUIDs, persistente Mutation Queue und stabile Idempotency Keys.
- Änderungen und Löschungen über einen serverseitigen monotonen Cursor abrufen; nicht allein nach Geräteuhr sortieren.
- Mutationen mit erwarteter Objektversion senden. Bei konkurrierendem Bearbeiten nicht blind den letzten Schreibvorgang gewinnen lassen.
- Unabhängige Feldänderungen automatisch zusammenführen, wenn sicher möglich. Bei gleichem Feld oder strukturellen Konflikten beide Varianten erhalten und eine verständliche Auflösung anbieten.
- Lösch-/Bearbeitungskonflikte und Verschiebungen ausdrücklich behandeln. Nach Löschung keine stille Wiederauferstehung.
- Queue, Cursor und Cache konsistent speichern. Neuladen, Prozessabbruch, Wiederholung einer Anfrage und Verbindungsverlust dürfen keine Aufgaben verlieren oder verdoppeln.
- Sync beim Öffnen, beim Zurückkehren in die App, bei wiederhergestellter Verbindung und nach Änderungen. Laufende Clients zeitnah über Serverereignisse informieren; Reconnect mit Cursor.
- PWA-Hintergrundsync ist eine Optimierung, keine Voraussetzung für Korrektheit. Bei geschlossener App keine ständige Synchronisation versprechen.
- Bei abgelaufener Sitzung ausstehende Änderungen erhalten, Anmeldung verlangen und anschließend erneut Berechtigungen prüfen.
- Status: Synchronisiert / Offline / Änderungen ausstehend / Konflikt / Fehler. Keine scheinbare Erfolgsmeldung bei Serverfehlern.

## 7. Benachrichtigungen

Stufe B: serverseitiger Scheduler und Web Push. Benachrichtigung erst nach expliziter Zustimmung, mit Beispiel zum Testen. HTTPS und installierte PWA erklären, soweit für den verwendeten Browser nötig. Betriebssystem, Browser, Verbindung und Push-Anbieter können Zustellung verzögern; keine exakt garantierte Alarmzeit behaupten.

- Fälligkeit, Erinnerung und Snooze separat speichern.
- Erinnerungen standardmäßig benutzerbezogen. Zuweisung erzeugt nicht automatisch Benachrichtigungen auf allen Geräten.
- Keine doppelten Sendejobs bei Worker-Neustart; Jobs müssen idempotent sein.
- Erledigte oder gelöschte Aufgaben erzeugen keine neuen Erinnerungen. Schon zugestellte Push-Nachrichten lassen sich nicht überall zurückholen.
- Entfernte Listenmitglieder bekommen keine weiteren Aufgabenbenachrichtigungen.
- Private Tasktexte auf dem Sperrbildschirm optional ausblenden.
- Web Push verwendet Browser-/Plattform-Push-Dienste; selbst gehosteter Aufgabenserver bedeutet nicht vollständig selbst gehostete Push-Zustellung.

## 8. Technischer Vorschlag

Falls kein vorhandenes Projekt einen anderen Stack vorgibt: TypeScript, React mit Vite für die PWA, Fastify für die API, PostgreSQL als Datenbank, etablierte Bibliotheken für Migrationen/Validierung und ein Service Worker. Hintergrundjobs mit PostgreSQL-gestützter Warteschlange oder vergleichbar einfacher persistenter Lösung; zunächst keinen zusätzlichen Dienst ohne konkreten Nutzen.

Versionen bei Projektbeginn anhand offizieller Dokumentation wählen, im Lockfile festhalten und nicht aus diesem Dokument ableiten. Eine andere gepflegte Kombination ist zulässig, wenn sie begründet dieselben Anforderungen erfüllt. API und Domänenlogik nicht fest an Browserkomponenten koppeln; spätere Android-Clients sollen dieselbe API nutzen können.

Anmeldung mit sicher gehashten Passwörtern, HttpOnly-/Secure-Sitzungscookies, CSRF-Schutz passend zur Architektur und Rate Limits für Anmeldung. Keine Passwörter oder langfristigen Auth-Tokens im Browser-LocalStorage. Notizen sicher als Text oder sanitisiertes eingeschränktes Format rendern. Geheimnisse über Umgebungsvariablen/Secrets; sensible Inhalte nicht in Logs ausgeben.

Docker Compose mit App/API, Datenbank und erforderlichem Worker, Healthchecks und persistenten Volumes. Hinter einem vorhandenen HTTPS-Reverse-Proxy betreibbar. Keine Annahmen über konkrete Domain, Servernamen, Ports oder vorhandenen Proxy treffen. `.env.example` enthält nur Platzhalter. Externe Erreichbarkeit und Domain sind Bereitstellungseinstellungen, keine Blockade für lokale Entwicklung.

## 9. Designvorgaben

Die beigefügte HTML-Datei ist eine interaktive Designreferenz mit lokalen Beispieldaten; keine fertige Anwendung und keine echte Freigabe/Synchronisation.

Darkmode-Palette: Hintergrund `#191b20`, Seitenleiste `#22252c`, Eingabeflächen `#262a33`, Linien `#343945`, Haupttext `#eeeef2`, Zusatztext `#a9afbd`, Blau `#90b7ff`. Listenfarben zurückhaltend: Grün `#8ecfb2`, Violett `#b5a0eb`, Orange `#dfb185`. Diese Werte als Ausgangspunkt nutzen und Kontrast praktisch prüfen.

Apple-inspirierte Klarheit mit eigener Identität: ruhige Flächen, großzügige Abstände, runde Abhakfelder, klare Schrift, keine überflüssigen dekorativen Karten. Kein Raben-/Mythologie-Motiv. Schlichtes `n.` ist ein vorläufiges App-Zeichen, keine endgültig entwickelte Marke.

Vereinbarter Feinschliff: keinen zusätzlichen NOTERA-Schriftzug über dem Listentitel, keinen Spruch am unteren Rand, keine dauernden Belehrungen. Hinweise kontextbezogen zeigen. Gemeinsame Listen eindeutig kennzeichnen. Symbolgrößen und Abstände konsistent. Mobile Ansicht bewusst gestalten, nicht bloß Desktop zusammenschieben.

Semantische HTML-Elemente, vollständige Tastaturbedienung, sichtbarer Fokus, große Touchziele, verständliche Labels, keine Information nur durch Farbe. Reduzierte Bewegung beachten. Lange Titel umbrechen. Dynamische Schriftgröße, kleine Android-Displays und Bildschirmtastatur berücksichtigen. Hellmodus eigenständig prüfen; nicht nur Farben invertieren.

## 10. Abnahme und aussagekräftige Tests

### Nutzbarkeit

1. Sven legt mit Titel + Enter eine undatierte Aufgabe an. Nach Neuladen bleibt sie erhalten.
2. Sandra kann Svens privaten Eingang weder in UI noch mit API/Sync/Suche sehen.
3. Sven teilt eine Liste mit Sandra. Beide können Aufgaben bearbeiten und abhaken; Zuweisung funktioniert.
4. Gleiche Aufgabe erscheint auf PC und Android ohne manuelles Exportieren. Statusänderungen werden übertragen.
5. Offline anlegen, bearbeiten und abhaken funktioniert. Nach App-Neustart offline sind Queue und Daten vorhanden; nach Wiederverbindung Abgleich ohne Duplikate.
6. Zwei Geräte verändern dieselbe Aufgabe gleichzeitig: unabhängige Änderungen bleiben erhalten, konkurrierende Änderungen werden erkennbar aufgelöst.
7. Gerät A löscht, Gerät B bearbeitet offline: keine unbemerkte Wiederauferstehung oder verschwundene Bearbeitung.
8. Wiederherstellung aus Papierkorb funktioniert; abgelaufener Cursor führt zu korrektem Vollabgleich.
9. Heute-Auswahl für Sven ändert Sandras Planung nicht. Fällig + ausgewählt erzeugt keinen doppelten Eintrag.
10. Datum ohne Uhrzeit bleibt über Zeitzonen und Sommerzeit hinweg dasselbe Datum.

### Sicherheit und Betrieb

Direkte unberechtigte API-Zugriffe, manipulierte Listenzugehörigkeit, unerlaubte Zuweisungen und Rechteentzug testen. Datenbanksicherung inklusive Wiederherstellung in einer frischen Instanz nachweisen. Produktionsbuild und Compose-Start dokumentieren. Persistenz nach Containerneustart prüfen. Keine Geheimnisse ins Repository übernehmen.

### Erweiterungen

Wiederholungen an Monatsende/Schaltjahr/Zeitumstellung, doppeltes Erledigen, Scheduler-Neustart, gelöschte Aufgaben vor Erinnerung, ungültige Push-Abonnements und Snooze prüfen. Native Standorterinnerungen später auf echtem Android-Gerät bei gesperrtem Bildschirm, Neustart, Rechteentzug und offline testen.

Tests auf relevante Risiken konzentrieren: Berechtigungen, Synchronisation, Zeiten, Wiederholungen und Persistenz. UI visuell auf Desktop und bei 360px/320px Breite kontrollieren; keine horizontale Überbreite, verdeckten Aktionen oder abgeschnittenen Texte. Die echte Push-/Android-Zustellung und echten Zwei-Geräte-Abgleich nicht durch ausschließlich gemockte Tests als bewiesen ausgeben.

## 11. Lieferumfang und Abschlussbericht

- Vollständiger Quellcode, migrationsfähiges Datenmodell und Lockfile.
- Docker Compose, `.env.example`, verständliche Anleitung für lokale Entwicklung und Serverbetrieb.
- Dokumentierte Einrichtung der zwei Benutzer, HTTPS-Anforderungen, Sicherung/Wiederherstellung und Aktualisierung.
- Relevante automatisierte Tests und kurze Liste tatsächlich durchgeführter manueller Prüfungen.
- Beispiel-/Demodaten ausschließlich optional, ohne private Echtdaten als Produktionsstartzustand.
- Abschlussbericht: Was funktioniert, welche Stufe erreicht ist, welche Prüfungen bestanden sind und was noch fehlt. Keine unfertigen Schalter als funktionsfähige Features ausgeben.

## 12. Spätere Standortfunktion und CalDAV

Standortregel als zukünftige Erweiterung getrennt modellieren: Ort/Koordinaten, Radius, Ankunft/Verlassen, optionaler Zeitfilter, Wiederholungs-/Abklingregel und Empfänger. Diese Regeln zwischen Clients synchronisieren; Standortereignisse lokal auf Android erkennen. Kein kontinuierlicher Standortverlauf auf dem Server erforderlich. Zunächst keine leeren Ortsdialoge anzeigen.

CalDAV später als Adapter mit dokumentierter Feldzuordnung, stabilen UID-Beziehungen und bewahrten unbekannten Eigenschaften. Zuerst Import/Export; bidirektionaler Abgleich nur mit Konfliktstrategie, Löschregeln und Tests gegen die tatsächlich eingesetzte Baïkal-Version. Nicht alle eigenen Funktionen als extern interoperabel behaupten. Zwei konkurrierende Hauptspeicher vermeiden.

## Kurzauftrag zum Starten

> Implementiere Notera anhand dieses Dokuments und der beigefügten Designreferenz. Beginne mit Stufe A, liefere eine echte persistente Anwendung und prüfe insbesondere gemeinsame Listen, Datenschutz zwischen Benutzern und Offline-Synchronisation. Übernimm übliche technische Entscheidungen selbst, dokumentiere sie und arbeite anschließend Stufe B ab. Standorterinnerungen und CalDAV bleiben spätere Erweiterungen. Veröffentliche oder ändere keinen laufenden produktiven Server ohne separaten Auftrag.
