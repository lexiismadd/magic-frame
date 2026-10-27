# Digests

A digest is a text summary of widgets you pick, kept at an address Home
Assistant (or any script) can read. Magic Frame sends nothing itself. Something
else picks the text up and passes it on: a phone notification at seven, an SMS
through Twilio, a message in Signal.

```
Day 3 — Mia: Gym, Music — Leo: Art
🎒 Bring the gym bag (Mia)
08:00 Dentist
☐ Call the plumber
• Milk
Rain, 11°C (feels like 8°C)
```

Each line comes from a widget that already sits on one of your views, with the
same settings it has there. The school rotation counts with the same holidays,
the calendar reads the same feeds, and the shopping list reads the same list.
A digest cannot say something different from the screen on the wall.

## Making one

1. In the editor, open **Digests** in the sidebar (`/editor/digests`) and press
   **New digest**. Give it a name and an address — lower-case letters, digits
   and hyphens, for example `morning`. The address becomes part of the URL.
2. The right-hand column lists every view with its widgets. Click a widget to
   add it. Only **saved** widgets appear: a widget gets its final id when its
   view is saved, and that id is what the digest points at.
3. Drag the entries into the order you want the lines in. The arrow next to an
   entry opens its options (see below).
4. **Preview** saves the digest and shows the text exactly as the address
   returns it.

Digests are for administrators only. Anyone with a companion token can read
one, so choosing what goes into one is an administrator's decision.

## What each widget writes

Eight widget types can be added; the others are greyed out.

| Widget | What it writes | Options |
| --- | --- | --- |
| School rotation | Today's rotation day and each child's activities, then that weekday's reminders. On a day off: *No school* or *Weekend* with the reason, and the next school day. | **Child**: every child, or one. **Show reminders**: on by default. |
| Calendar | One line per event: the start time, or *All day*, then the title. Times follow the widget's 12/24-hour setting. | **Time range**: Today (default), Tomorrow, Next 3, 6, 12 or 24 hours. The hour ranges leave out events that have already ended. |
| Todos | `☐` and the title of each open to-do, with the due date when it has one. At most 20. | **All open** (default), **Due by today** (today and overdue; to-dos without a date do not count), **Overdue**. |
| Shopping list | `•` and each open item. At most 50. | **Unchecked only** (default) or **All items**, where ticked ones get a `✓`. |
| Weather | The current condition and temperature, plus *feels like* when it differs by two degrees or more. | **One-liner** (default), **High/Low only**, **Multi-day forecast** (humidity, wind and the next three days), **Hourly (today)**. |
| Sensor | `Label: value unit` for every entity in the widget. Unavailable entities are left out. | — |
| Environment | The values the widget shows: AQI, particulates, pollen, UV, wind, solar, and its Home Assistant entities. | — |
| Text | The widget's text and its second line. Useful as a heading between sections. | — |

Todos and Shopping list read the source the widget reads: the built-in list,
a Home Assistant to-do list, or a Todoist project.

When a source does not answer within ten seconds, its line says so: *Weather:
unreachable*. A school rotation whose holiday calendar cannot be reached says
*Holiday calendar unreachable* instead of a rotation day. With the holidays
missing, every school day after them would be counted wrong.

A widget that was deleted from its view is skipped; the rest of the digest
still arrives. Renaming a view takes its digest entries along. Duplicating a
view does not: the copy's widgets are new widgets.

## The address

```
GET /api/digest/<address>
```

It returns plain text, one line per entry line. Two query parameters change
that:

- `?format=json` returns `{"lines": [...], "text": "..."}`.
- `?lang=` picks the language: `de`, `en`, `nb`, `nn` or `pt-BR`. Without it the
  digest is written in the installation's language (**Settings → General →
  Language**), and in English when none is set.

Unlike the display addresses, this one needs the **companion API token** from
**Settings → Devices & apps**. Send it as a header:

```
Authorization: Bearer YOUR_TOKEN
```

`?key=YOUR_TOKEN` works too, but then the token sits in the URL, and URLs end
up in logs and browser history. Without a token the answer is **401**; an
address no digest has is **404**. A browser that is signed in to the editor
needs no token — that is how **Open** in the editor works.

## In Home Assistant

A sensor's state holds at most 255 characters, which a morning digest easily
exceeds. So the whole text goes into an attribute. The editor shows this block
under **For Home Assistant**, already filled in with your address. Paste it
into `configuration.yaml`, then replace `YOUR_TOKEN`:

```yaml
rest:
  - resource: http://192.0.2.10/api/digest/morning?format=json
    headers:
      Authorization: Bearer YOUR_TOKEN
    scan_interval: 900
    sensor:
      - name: "Morning digest"
        value_template: "{{ value_json.text[:255] }}"
        json_attributes:
          - text
```

On the Home Assistant add-on the address carries the port: `:8098`.
`scan_interval: 900` fetches every fifteen minutes. That is often enough for a
message in the morning, and it does not keep the calendar and weather services
busy.

An automation then sends the attribute wherever you like:

```yaml
automation:
  - alias: "Morning digest"
    triggers:
      - trigger: time
        at: "07:00:00"
    actions:
      - action: notify.mobile_app_your_phone
        data:
          message: "{{ state_attr('sensor.morning_digest', 'text') }}"
```

If you would rather fetch the text at the moment you send it, a `rest_command`
returns the answer to the script that called it:

```yaml
rest_command:
  morning_digest:
    url: "http://192.0.2.10/api/digest/morning?format=json"
    headers:
      Authorization: Bearer YOUR_TOKEN
```

```yaml
actions:
  - action: rest_command.morning_digest
    response_variable: digest
  - action: notify.mobile_app_your_phone
    data:
      message: "{{ digest.content.text }}"
```
