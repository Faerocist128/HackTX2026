# 3D car models

The "Your car" page and the home page show real 3D cars embedded from [Sketchfab](https://sketchfab.com) on a black stage. Cars are listed in `lib/vehicle/carModels.json`, keyed by `make/model` in lowercase, matching the Make and Model dropdowns. Anything in parentheses, such as "(PHEV)", is ignored.

A car is matched by make and model only, so one entry covers every model year: the 2022 Camry model shows for any Camry. Cars that aren't listed get no stage at all.

## Adding a car

1. Find a model on Sketchfab whose page shows an **Embed** button and roughly 200k+ triangles (the count is under the viewer). Check the **License** box: CC BY is safest, and NonCommercial (NC) is fine for a hackathon demo but not for a product.
2. Add an entry to `lib/vehicle/carModels.json`:

   ```json
   "toyota/tacoma": {
     "label": "Midsize pickup",
     "sketchfab": "https://sketchfab.com/3d-models/2019-toyota-tacoma-8bb91f037ec64151ba72279c50ce5c20",
     "credit": "\"2019 Toyota Tacoma\" by David_Holiday, CC BY 4.0",
     "creditUrl": "https://sketchfab.com/3d-models/2019-toyota-tacoma-8bb91f037ec64151ba72279c50ce5c20"
   }
   ```

   - `label` shows under the car's name.
   - `sketchfab` can be the page link, the embed code, or just the 32-character model id.
   - `credit` and `creditUrl` appear in the site footer. The Creative Commons licenses require crediting the creator, so keep them.
   - Optional `zoom` sets how close the camera sits after framing the car: `1` shows the whole car, and smaller is closer. The default is `0.8`.
3. Reload the page and choose that model.

## How it looks and loads

- The viewer starts black and fades the car in once Sketchfab says it's ready. Sketchfab's buttons and labels are hidden, and its backdrop is replaced with black.
- Detailed models take 10–50 seconds on first load. Before a demo, open each car once so the browser caches it.
- Free Sketchfab embeds may still show Sketchfab's own "click & hold to rotate" hint, which only a paid Sketchfab plan can hide.
