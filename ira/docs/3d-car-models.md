# Adding real 3D car models

The "Your car" page draws a generated car for every model. To show a realistic one, list it in `public/cars/models.json`. Cars not listed keep the generated model, and if a real model fails to load the page falls back to it.

There are two ways to add a car:

- **Sketchfab embed (quickest):** no download or account. Add the model's Sketchfab link:

  ```json
  "toyota/tacoma": {
    "sketchfab": "https://sketchfab.com/3d-models/2019-toyota-tacoma-8bb91f037ec64151ba72279c50ce5c20",
    "credit": "\"2019 Toyota Tacoma\" by David_Holiday, CC BY 4.0",
    "creditUrl": "https://sketchfab.com/3d-models/2019-toyota-tacoma-8bb91f037ec64151ba72279c50ce5c20"
  }
  ```

  The page link, the embed code, or just the 32-character model id all work. Sketchfab's viewer shows the model, so its logo and "click & hold to rotate" hint stay, and the first load takes about 10 seconds for a detailed model while the generated car holds the spot. Pick models whose page shows an **Embed** button and roughly 200k+ triangles.
- **Downloaded `.glb` file:** loads faster with no Sketchfab branding, but needs the steps below.

## 1. Download a model

Free models with a Creative Commons license are on [Sketchfab](https://sketchfab.com). A free account is needed to download.

1. Open a model page and check the **License** box under the viewer.
   - **CC Attribution (CC BY)**: OK for the demo and for commercial use, as long as you credit the creator (step 4).
   - **NonCommercial (NC)**: fine for a hackathon demo, but not for a product.
   - **ShareAlike (SA)**: your changes to the model must use the same license.
   - "Standard" or "Editorial" licenses have their own terms. Read them before using the model.
2. Click **Download 3D Model** and pick **GLB**. If only **glTF** is offered, download that zip and convert it (step 3).

Candidates found so far. Check each license yourself before using it:

| Car | Model | Notes |
|---|---|---|
| Camry | [Toyota Camry by Recon-3D](https://sketchfab.com/3d-models/toyota-camry-fd9b89c8c12b48f98915fac1392e3b67) | CC BY; model year not stated |
| Camry | [Toyota Camry V80 by sultan](https://sketchfab.com/3d-models/toyota-camry-v80-98c70e5aa53446728fea4d8f448bbf33) | CC BY; about 705k triangles |
| RAV4 | [2020 RAV4 Prime PHEV by Nazh Design](https://sketchfab.com/3d-models/2020-toyota-rav4-prime-phev-fc30b71e31aa409cbca8bf6885533af5) | CC BY |
| RAV4 | [Toyota RAV4 2026 by teenlin3](https://sketchfab.com/3d-models/toyota-rav4-2026-53e8ac0ac68e4d65bb1c3ed95a8a8101) | CC BY; AI-generated, quality may vary |
| Tacoma | [2019 Toyota Tacoma by David_Holiday](https://sketchfab.com/3d-models/2019-toyota-tacoma-8bb91f037ec64151ba72279c50ce5c20) | CC BY; about 519k triangles |
| Tacoma | [Toyota Tacoma TRD by LagzDesign](https://sketchfab.com/3d-models/toyota-tacoma-trd-f13b2c73a13147a69a6d2a83f72b2505) | CC BY; low-poly, light |
| Corolla | [Toyota Corolla E170 (2017) by Blender Boy](https://sketchfab.com/3d-models/toyota-corolla-e170-2017-d87af59849814c5cb35a0c233f2c2f19) | CC BY-SA; about 756k triangles |
| Corolla | [2020 Toyota Corolla by jakazawa](https://sketchfab.com/3d-models/2020-toyota-corolla-5f0971f964a34c33bd61ca620050ce0d) | CC BY-NC-SA: demo only |
| Highlander | [2015 Toyota Highlander by jdurden](https://sketchfab.com/3d-models/2015-toyota-highlander-8f5f1e64dc004868a49cf05b0d3441cc) | CC BY; about 1M triangles (compress it) |

Paid models with cleaner geometry are on CGTrader and TurboSquid (about $10–100 each). Pick a "royalty free" license and a `.glb` or `.fbx` download.

## 2. Name and place the file

Save it as `public/cars/toyota/<model>.glb`, using lowercase with dashes, for example `camry.glb`, `rav4.glb`, `tacoma.glb`, `corolla.glb`, `highlander.glb`.

## 3. Shrink it (strongly recommended)

Sketchfab files are often 20–100 MB. Run this from the `ira/` folder:

```bash
npx @gltf-transform/cli optimize public/cars/toyota/camry.glb public/cars/toyota/camry.glb --compress meshopt --texture-compress webp --simplify-ratio 0.5
```

Aim for under 5 MB per car. If the result looks blocky, drop `--simplify-ratio 0.5`.

If you downloaded a glTF zip instead of a GLB, unzip it and convert first:

```bash
npx @gltf-transform/cli copy path/to/scene.gltf public/cars/toyota/camry.glb
```

## 4. List it in `public/cars/models.json`

Keys are `make/model` in lowercase, matching the Make and Model dropdowns (anything in parentheses, such as "(PHEV)", is ignored):

```json
{
  "toyota/camry": {
    "file": "/cars/toyota/camry.glb",
    "credit": "\"Toyota Camry\" by Recon-3D, CC BY 4.0",
    "creditUrl": "https://sketchfab.com/3d-models/toyota-camry-fd9b89c8c12b48f98915fac1392e3b67"
  },
  "toyota/rav4": {
    "file": "/cars/toyota/rav4.glb",
    "credit": "\"2020 Toyota RAV4 Prime PHEV\" by Nazh Design, CC BY 4.0",
    "creditUrl": "https://sketchfab.com/3d-models/2020-toyota-rav4-prime-phev-fc30b71e31aa409cbca8bf6885533af5"
  }
}
```

`credit` and `creditUrl` show as a small link in the corner of the stage. CC BY requires it.

## 5. Check it

Reload the "Your car" page and choose that model. The viewer turns the car lengthwise, scales it to the real car's length, centers it and sits it on the ground automatically.

- **Car faces backward at first:** add `"rotateY": 180` to its entry.
- **Car is sideways:** add `"rotateY": 90` (or `-90`).
- **Generated car stays:** the file didn't load. Check the browser console for a "Couldn't load" warning and make sure the `file` path starts with `/cars/`.
- **Floor, lights or a backdrop come along with the car:** the model includes extra scene objects. Delete them in Blender (or https://gltf.report) and export again as GLB.
