# Vectra lights — settings page

A single web page that talks over Bluetooth LE to a home-made automatic
headlight module for an Opel Vectra C: it shows the module's status and
writes its settings.

- Works in Chrome on Android and on a computer (Web Bluetooth). It does not
  work in Safari or on the iPhone.
- Nothing is sent anywhere: the page talks only to the module, which asks
  for its own six-digit code at the first connection.
- Add `?demo` to the address to see it with sample data and no module.

This repository is only the published copy. The page is developed together
with the module's firmware.
