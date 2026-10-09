# Client-IP und Anmeldelimit hinter Traefik

Notera begrenzt weiterhin alle Anmeldeversuche auf **10 pro Client-IP innerhalb von 15 Minuten**. Die Begrenzung erfolgt vor der Passwortprüfung, einschließlich unbekannter Konten. Clients hinter derselben öffentlichen NAT-Adresse teilen sich weiterhin ein Limit. Das ist von der bisherigen unbeabsichtigten Zusammenfassung aller Nutzer unter der Traefik-IP zu unterscheiden.

## Konfiguration beim späteren VPS-Update

1. Die tatsächliche Verbindung **Traefik → Notera** prüfen. Relevant ist die Absenderadresse, die Noteras TCP-Socket sieht, nicht die öffentliche Domain und nicht ein vom Browser übermittelter Header. Beispielsweise zeigt `docker inspect --format '{{json .NetworkSettings.Networks}}' <traefik-container>` die Containeradressen. Bei mehreren Netzen das gemeinsame Netz mit Notera verwenden. Es wurde keine VPS-Konfiguration in diesem Auftrag ausgelesen oder geändert.
2. Für Traefik möglichst eine feste Adresse im ausschließlich dafür vorgesehenen Docker-Netz nutzen. In Noteras `.env` `TRUSTED_PROXIES` auf diese **konkrete Adresse**, bevorzugt `/32` für IPv4 beziehungsweise `/128` für IPv6, setzen. Das vorhandene `compose.yaml` reicht die Variable an `app` durch. In einer eigenen VPS-Compose-Datei muss dieselbe Environment-Zuordnung ergänzt werden.
3. `APP_ORIGIN=https://notera.skords.de` beibehalten. Routing, TLS, Zugangsdaten und Datenbankvolumes bleiben unverändert.
4. Nach Review/Merge und geplanter Sicherung das neue Image beziehen und ausschließlich den App-Container neu erstellen, damit die Environment-Variable übernommen wird. Ein bloßes `docker restart` übernimmt keine geänderte Compose-Umgebung. Es ist keine Datenbankmigration nötig.
5. Anschließend mit separaten Testclients prüfen: Client A erreicht 429, Client B kann sich weiterhin anmelden. Keine Fehlversuchsserie auf produktiven Konten ohne eingeplanten Test durchführen. Diese VPS-Prüfung wurde hier nicht durchgeführt.

Beispiel mit **fiktiver Adresse**, vor Verwendung ersetzen:

```dotenv
APP_ORIGIN=https://notera.skords.de
TRUSTED_PROXIES=172.30.50.2/32
```

```yaml
services:
  app:
    environment:
      TRUSTED_PROXIES: ${TRUSTED_PROXIES:-}
```

Ohne Wert bleibt `trustProxy: false`. Unbekannte oder ungültige Einträge verhindern den App-Start mit einer verständlichen Konfigurationsmeldung; `true`, `*`, Hop-Anzahlen und `/0` werden nicht akzeptiert. Es werden weder pauschal private Netze noch beliebige `X-Forwarded-For`-Header freigeschaltet.

Wenn Traefik über einen veröffentlichten Host-Port weiterleitet, kann Notera statt der Traefik-Adresse die Docker-Gateway-Adresse sehen. Diese nicht blind freigeben: Auch andere Verbindungen können unter dieser Adresse erscheinen. Dann die Verbindung über ein direktes, geeignet isoliertes Docker-Netz herstellen oder die Zugriffspfade so beschränken, dass nur der vertrauenswürdige Proxy unter der erlaubten Adresse ankommt. Gleiches gilt für große Netzwerk-CIDRs: Jede Adresse darin erhält das Recht, Client-IPs weiterzureichen.

## Mehrere Proxys und Forwarding-Header

Notera verwendet Fastifys IP-/CIDR-Vertrauensprüfung. Die Kette wird vom TCP-Gegenüber aus nach außen ausgewertet und endet beim ersten nicht vertrauenswürdigen Hop. Beispiel:

```text
Internet-Client → vertrauenswürdiger Loadbalancer → Traefik → Notera
```

Nur wenn der Loadbalancer wirklich Bestandteil dieser Kette ist, werden dessen konkrete Adressen zusätzlich zu Traefik eingetragen, kommagetrennt. Spoofing-Adressen links vom ersten nicht vertrauenswürdigen Client werden nicht für das Limit übernommen. Direkte Verbindungen von unkonfigurierten Adressen werden stets nach ihrer Socket-IP begrenzt, auch wenn sie `X-Forwarded-For`, `X-Real-IP` oder `Forwarded` setzen.

Traefik muss eingehende Forwarding-Header ebenfalls korrekt behandeln:

- Direkt öffentlich erreichbares Traefik: `entryPoints.<name>.forwardedHeaders.insecure` deaktiviert lassen. Keine Browser- oder beliebigen Internet-Adressen unter `forwardedHeaders.trustedIPs` eintragen.
- Mit vorgeschaltetem Loadbalancer: dort nur dessen tatsächliche vertrauenswürdige IPs/CIDRs eintragen. Ein vorgeschalteter Proxy muss fremde Header entfernen bzw. die nachweisliche Gegenstelle korrekt anhängen.
- Eine Anfrage von einer in Notera freigegebenen Proxy-Adresse darf Client-IP-Angaben liefern. Die Sicherheit hängt deshalb auch davon ab, dass fremde Container/Clients nicht als dieser Proxy auftreten können.

Offizielle Referenzen: [Fastify `trustProxy`](https://fastify.dev/docs/latest/Reference/Server/#trustproxy), [Traefik Forwarded Headers](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/#forwarded-headers).
