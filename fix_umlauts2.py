with open(r'c:\Users\phams\Documents\Test\assessly\modules\README.md', 'r', encoding='utf-8') as f:
    content = f.read()

replacements = [
    # Missed ue -> ü forms
    ("pruefen", "prüfen"),
    ("Pruefen", "Prüfen"),
    ("prueft", "prüft"),
    ("Prueft", "Prüft"),
    ("duerfen", "dürfen"),
    ("Duerfen", "Dürfen"),
    ("uebernimmt", "übernimmt"),
    ("Uebernimmt", "Übernimmt"),
    ("uebernehmen", "übernehmen"),
    ("Uebernehmen", "Übernehmen"),
    ("ueberprueft", "überprüft"),
    ("Ueberprueft", "Überprüft"),
    ("ueberpruefen", "überprüfen"),
    ("ueberpruefe", "überprüfe"),
    ("Ueberpruefe", "Überprüfe"),
    ("ueberpruefen", "überprüfen"),
    ("uebrige", "übrige"),
    ("Uebrige", "Übrige"),
    ("uebrigens", "übrigens"),
    ("genuegt", "genügt"),
    ("Genuegt", "Genügt"),
    ("genuegend", "genügend"),
    ("Genuegend", "Genügend"),
    ("ausgefuehrt", "ausgeführt"),
    ("durchgefuehrt", "durchgeführt"),
    ("aufgefuehrt", "aufgeführt"),
    ("eingefuehrt", "eingeführt"),
    ("weitergefuehrt", "weitergeführt"),
    # Missed oe -> ö forms
    ("moeglich", "möglich"),
    ("Moeglich", "Möglich"),
    ("eroeffnet", "eröffnet"),
    ("Eroeffnet", "Eröffnet"),
    ("benoetigt", "benötigt"),
    ("Benoetigt", "Benötigt"),
    # Missed ae -> ä forms
    ("naemlich", "nämlich"),
    ("Naemlich", "Nämlich"),
    ("regelmaessig", "regelmäßig"),
    ("unabhaengig", "unabhängig"),
    ("Unabhaengig", "Unabhängig"),
    # ss -> ß in specific German words (only where appropriate)
    ("ausschliesslich", "ausschließlich"),
    ("Ausschliesslich", "Ausschließlich"),
    ("ausschliessend", "ausschließend"),
    ("regelmaessig", "regelmäßig"),
    ("schliesslich", "schließlich"),
    ("Schliesslich", "Schließlich"),
    ("abschliessend", "abschließend"),
    ("Abschliessend", "Abschließend"),
    ("Abschluss", "Abschluss"),  # no change - already correct
    ("Strasse", "Straße"),
    ("strasse", "straße"),
    ("Massnahmen", "Maßnahmen"),
    ("massnahmen", "maßnahmen"),
    ("Massnahme", "Maßnahme"),
    ("massnahme", "maßnahme"),
    ("Groesse", "Größe"),
    ("groesse", "größe"),
]

for old, new in replacements:
    content = content.replace(old, new)

with open(r'c:\Users\phams\Documents\Test\assessly\modules\README.md', 'w', encoding='utf-8') as f:
    f.write(content)

print("Second pass done.")
